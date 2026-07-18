// Builds public/data/ from the National Gallery of Art's open data
// (https://github.com/NationalGalleryOfArt/opendata): downloads objects.csv
// and published_images.csv, joins them on object id, keeps objects whose
// primary image is flagged open access, and shards the records into small
// JSON files.
//
// Images are served from the gallery's IIIF endpoint, fit inside 800px.
//
// Sharding is by `ObjectID % shardCount`, so a permalink lookup needs only
// meta.json plus a single shard — no index file.

import { parse } from 'csv-parse';
import { Readable } from 'node:stream';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE =
  'https://raw.githubusercontent.com/NationalGalleryOfArt/opendata/main/data/';
const OUT_DIR = fileURLToPath(new URL('./public/data/', import.meta.url));
const TARGET_SHARD_BYTES = 40_000; // headroom under the ~50 KB ceiling

async function rows(file) {
  console.error(`Downloading ${BASE}${file} ...`);
  const res = await fetch(BASE + file);
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status} for ${file}`);
  }
  return Readable.fromWeb(res.body).pipe(
    parse({ bom: true, columns: true, relax_column_count: true })
  );
}

// Primary open-access image per object: objectid -> IIIF base URL.
const imageByObject = new Map();
for await (const row of await rows('published_images.csv')) {
  if (row.viewtype !== 'primary' || row.openaccess !== '1') continue;
  const objectID = Number(row.depictstmsobjectid);
  if (!Number.isInteger(objectID)) continue;
  const iiif = (row.iiifurl ?? '').trim();
  if (iiif) imageByObject.set(objectID, iiif);
}
console.error(`${imageByObject.size} objects with an open primary image.`);

const works = [];
let total = 0;
for await (const row of await rows('objects.csv')) {
  total++;
  const objectID = Number(row.objectid);
  if (!Number.isInteger(objectID) || objectID < 0) continue;
  const iiif = imageByObject.get(objectID);
  if (!iiif) continue;
  works.push({
    ObjectID: objectID,
    Title: (row.title ?? '').trim(),
    Artist: (row.attribution ?? '').trim(),
    Date: (row.displaydate ?? '').trim(),
    Medium: (row.medium ?? '').trim(),
    CreditLine: (row.creditline ?? '').trim(),
    URL: `https://www.nga.gov/artworks/${objectID}`,
    ImageURL: `${iiif}/full/!800,800/0/default.jpg`,
  });
}

const totalBytes = works.reduce((sum, w) => sum + JSON.stringify(w).length + 1, 0);
const shardCount = Math.max(1, Math.ceil(totalBytes / TARGET_SHARD_BYTES));

const shards = Array.from({ length: shardCount }, () => []);
for (const w of works) {
  shards[w.ObjectID % shardCount].push(w);
}

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });
await Promise.all(
  shards.map((shard, n) => writeFile(`${OUT_DIR}shard-${n}.json`, JSON.stringify(shard)))
);

const meta = {
  totalWorks: works.length,
  shardCount,
  builtAt: new Date().toISOString(),
};
await writeFile(`${OUT_DIR}meta.json`, JSON.stringify(meta));

const largest = Math.max(...shards.map((s) => JSON.stringify(s).length));
console.error(
  `Parsed ${total} objects; wrote ${shardCount} shards (largest ${(largest / 1024).toFixed(1)} KB).`
);
console.log(`${works.length} open-access works with images.`);
