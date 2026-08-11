// Downloads MoMA's Artworks.csv, filters to works with images, and shards the
// records two ways under public/data/:
//
//   shard-<n>.json          one random work   — sharded by `ObjectID % shardCount`
//   artists/shard-<n>.json  one whole artist  — sharded by `ConstituentID % shardCount`
//
// Both shardings are computable from the id, so a permalink lookup needs only
// the matching meta.json plus a single shard — no index file.

import { parse } from 'csv-parse';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// The CSVs live in Git LFS; the plain raw.githubusercontent.com URL returns
// only an LFS pointer file, so fetch the media URL instead.
const BASE = 'https://media.githubusercontent.com/media/MuseumofModernArt/collection/main';
// Set to a directory holding Artworks.csv / Artists.csv to build from local
// copies instead of re-downloading 70 MB on every run.
const LOCAL_CSV_DIR = process.env.MOMA_CSV_DIR;

const OUT_DIR = fileURLToPath(new URL('./public/data/', import.meta.url));
const ARTIST_DIR = `${OUT_DIR}artists/`;
const TARGET_SHARD_BYTES = 40_000; // headroom under the ~50 KB ceiling
// Artists vary wildly in output — a 3,000-work oeuvre next to a two-work one —
// so an artist shard overshoots its average by more than a work shard does.
// Aim lower to keep the spread under the same ceiling.
const TARGET_ARTIST_SHARD_BYTES = 24_000;

// An artist wall never hangs more than a few dozen works at once, so the shard
// carries a sample that spans the oeuvre and the rest waits in a per-artist
// file the wall fetches only when someone keeps reshuffling.
const WALL_SAMPLE = 120;
// Below this a random pick lands on someone with too little work to hang.
// Permalinks ignore it: `?artist=` reaches anyone in the collection.
const MIN_WORKS_RANDOM = 8;
// The long-tail (`?deep=1`) picker still wants more than a single work.
const MIN_WORKS_DEEP = 2;

// Physical dimensions predict the *image* proportions only for flat work; for
// a chair or a sculpture the photograph's shape has nothing to do with the
// object's. The wall measures those for real once the pixels arrive.
const FLAT = new Set([
  'Photograph',
  'Print',
  'Drawing',
  'Illustrated Book',
  'Painting',
  'Architecture',
  'Periodical',
  'Ephemera',
  'Notebook',
  'Collage',
  'Textile',
  'Poster',
  'Mies van der Rohe Archive',
  'Frank Lloyd Wright Archive',
]);

async function readCSV(name) {
  let stream;
  if (LOCAL_CSV_DIR) {
    console.error(`Reading ${LOCAL_CSV_DIR}/${name} ...`);
    stream = createReadStream(`${LOCAL_CSV_DIR}/${name}`);
  } else {
    const url = `${BASE}/${name}`;
    console.error(`Downloading ${url} ...`);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Download failed: HTTP ${res.status} ${res.statusText} for ${url}`);
    }
    stream = Readable.fromWeb(res.body);
  }
  // The files start with a UTF-8 BOM and fields contain quoted commas and
  // escaped quotes; csv-parse handles all that.
  return stream.pipe(parse({ bom: true, columns: true, relax_column_count: true }));
}

// Every image URL but a handful is the same MoMA media template with only the
// file id and its signature varying:
//
//   https://www.moma.org/media/<base64url of
//     [["f","527770"],["p","convert","-resize 1024x1024>"]]>.jpg?sha=<16 hex>
//
// Storing the two variables instead of the whole URL takes an artist shard
// from ~150 to ~24 bytes per work. The reconstruction is verified per record
// below, so a change to MoMA's template degrades to a stored URL rather than a
// wall of broken images.
const MEDIA_RE = /^https:\/\/www\.moma\.org\/media\/([A-Za-z0-9_-]+)\.jpg\?sha=([0-9a-f]+)$/;

function mediaURL(fileID) {
  const payload = `[["f","${fileID}"],["p","convert","-resize 1024x1024\\u003e"]]`;
  const b64 = Buffer.from(payload, 'utf8')
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `https://www.moma.org/media/${b64}.jpg`;
}

// -> [fileID, sha] when the template round-trips, else the URL verbatim.
let templated = 0;
let verbatim = 0;
function packImage(url) {
  const m = MEDIA_RE.exec(url);
  if (m) {
    try {
      const fileID = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'))[0][1];
      if (/^\d+$/.test(fileID) && mediaURL(fileID) === url.slice(0, url.indexOf('?'))) {
        templated++;
        return [Number(fileID), m[2]];
      }
    } catch {
      /* fall through to storing the URL */
    }
  }
  verbatim++;
  return [url, ''];
}

function median(numbers) {
  if (!numbers.length) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Spread a sample across the whole list instead of taking the first n, so a
// 3,000-work oeuvre is represented end to end rather than by its earliest
// accession numbers.
function spread(list, n) {
  if (list.length <= n) return list;
  const step = list.length / n;
  return Array.from({ length: n }, (_, i) => list[Math.floor(i * step)]);
}

// Pack records into shards of about `target` bytes, keyed so that
// `id % shardCount` finds the record's shard.
function shardBy(records, key, target) {
  const bytes = records.reduce((sum, r) => sum + JSON.stringify(r).length + 1, 0);
  const shardCount = Math.max(1, Math.ceil(bytes / target));
  const shards = Array.from({ length: shardCount }, () => []);
  for (const r of records) shards[key(r) % shardCount].push(r);
  return shards;
}

// --- artists -----------------------------------------------------------

const artistNames = new Map(); // ConstituentID -> { name, bio }
for await (const row of await readCSV('Artists.csv')) {
  const cid = Number(row.ConstituentID);
  if (!Number.isInteger(cid) || cid < 0) continue;
  artistNames.set(cid, {
    name: (row.DisplayName ?? '').trim(),
    bio: (row.ArtistBio ?? '').trim(),
  });
}
console.error(`Parsed ${artistNames.size} artists.`);

// --- artworks ----------------------------------------------------------

const works = [];
const byArtist = new Map(); // ConstituentID -> { works: [tuple], ratios: [n] }
let total = 0;

for await (const row of await readCSV('Artworks.csv')) {
  total++;
  const imageURL = (row.ImageURL ?? '').trim();
  if (!imageURL) continue;
  const objectID = Number(row.ObjectID);
  if (!Number.isInteger(objectID) || objectID < 0) continue;

  const cids = (row.ConstituentID ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0);

  const record = {
    ObjectID: objectID,
    Title: (row.Title ?? '').trim(),
    Artist: (row.Artist ?? '').trim(),
    Date: (row.Date ?? '').trim(),
    Medium: (row.Medium ?? '').trim(),
    CreditLine: (row.CreditLine ?? '').trim(),
    URL: (row.URL ?? '').trim(),
    ImageURL: imageURL,
  };
  const onView = (row.OnView ?? '').trim() ? 1 : 0;
  if (onView) record.OnView = 1;
  // Lets the single-work view jump straight to that artist's wall.
  if (cids.length) record.Cid = cids;
  works.push(record);

  const height = parseFloat(row['Height (cm)']);
  const width = parseFloat(row['Width (cm)']);
  const flat = FLAT.has((row.Classification ?? '').trim());
  const ratio =
    flat && height > 0 && width > 0 ? Math.round((width / height) * 1000) / 1000 : 0;

  const [image, sha] = packImage(imageURL);
  // [ObjectID, fileID|URL, sha, ratio, Title, Date, OnView?]
  const tuple = [objectID, image, sha, ratio, record.Title, record.Date];
  if (onView) tuple.push(1);

  for (const cid of cids) {
    let entry = byArtist.get(cid);
    if (!entry) byArtist.set(cid, (entry = { works: [], ratios: [] }));
    entry.works.push(tuple);
    if (ratio) entry.ratios.push(ratio);
  }
}

// --- one random work ---------------------------------------------------

const workShards = shardBy(works, (w) => w.ObjectID, TARGET_SHARD_BYTES);
await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(ARTIST_DIR, { recursive: true });
await Promise.all(
  workShards.map((shard, n) => writeFile(`${OUT_DIR}shard-${n}.json`, JSON.stringify(shard)))
);
await writeFile(
  `${OUT_DIR}meta.json`,
  JSON.stringify({
    totalWorks: works.length,
    shardCount: workShards.length,
    builtAt: new Date().toISOString(),
  })
);

// --- one whole artist --------------------------------------------------

const artists = [];
const deep = []; // oeuvres too big to fit in a shard
for (const [cid, entry] of byArtist) {
  const who = artistNames.get(cid);
  if (!who || !who.name) continue; // no name to hang the wall under
  entry.works.sort((a, b) => a[0] - b[0]);
  artists.push({
    id: cid,
    n: who.name,
    b: who.bio,
    c: entry.works.length,
    // A stand-in shape for works whose proportions the dataset doesn't know:
    // this artist's own median beats any global default.
    r: median(entry.ratios) || 0,
    w: spread(entry.works, WALL_SAMPLE),
  });
  if (entry.works.length > WALL_SAMPLE) deep.push([cid, entry.works]);
}
artists.sort((a, b) => a.id - b.id);

const artistShards = shardBy(artists, (a) => a.id, TARGET_ARTIST_SHARD_BYTES);
await Promise.all(
  artistShards.map((shard, n) =>
    writeFile(
      `${ARTIST_DIR}shard-${n}.json`,
      // Keyed by id so the client can look one artist up without scanning.
      JSON.stringify(Object.fromEntries(shard.map(({ id, ...rest }) => [id, rest])))
    )
  )
);

await mkdir(`${ARTIST_DIR}works/`, { recursive: true });
await Promise.all(
  deep.map(([cid, all]) => writeFile(`${ARTIST_DIR}works/${cid}.json`, JSON.stringify(all)))
);

// Picking a random artist has to be fair without downloading an index of all
// of them, so each shard carries its own totals: pick a shard in proportion to
// the weight it holds, then an artist within it. Weighting by sqrt(works)
// tilts towards substantial oeuvres without silencing the long tail.
const shardStats = artistShards.map((shard) => {
  let eligible = 0;
  let deepCount = 0;
  let weight = 0;
  for (const a of shard) {
    if (a.c >= MIN_WORKS_RANDOM) {
      eligible++;
      weight += Math.sqrt(a.c);
    }
    if (a.c >= MIN_WORKS_DEEP) deepCount++;
  }
  return [eligible, deepCount, Math.round(weight * 10) / 10];
});

await writeFile(
  `${ARTIST_DIR}meta.json`,
  JSON.stringify({
    shardCount: artistShards.length,
    artistCount: artists.length,
    randomCount: shardStats.reduce((sum, s) => sum + s[0], 0),
    deepCount: shardStats.reduce((sum, s) => sum + s[1], 0),
    minWorksRandom: MIN_WORKS_RANDOM,
    minWorksDeep: MIN_WORKS_DEEP,
    wallSample: WALL_SAMPLE,
    shards: shardStats,
    builtAt: new Date().toISOString(),
  })
);

// Only the name search downloads this, and only when someone opens it.
await writeFile(
  `${ARTIST_DIR}names.json`,
  JSON.stringify(
    artists
      .slice()
      .sort((a, b) => b.c - a.c || a.n.localeCompare(b.n))
      .map((a) => [a.id, a.n, a.c])
  )
);

const biggest = (shards) => Math.max(...shards.map((s) => JSON.stringify(s).length));
console.error(
  `Parsed ${total} records; wrote ${workShards.length} work shards (largest ${(
    biggest(workShards) / 1024
  ).toFixed(1)} KB) and ${artistShards.length} artist shards (largest ${(
    biggest(artistShards) / 1024
  ).toFixed(1)} KB, ${deep.length} oeuvres spilling to their own file).`
);
console.error(
  `Image URLs: ${templated} templated, ${verbatim} stored verbatim.`
);
console.log(
  `${works.length} works with images; ${artists.length} artists (${
    shardStats.reduce((sum, s) => sum + s[0], 0)
  } with ${MIN_WORKS_RANDOM}+ works).`
);
