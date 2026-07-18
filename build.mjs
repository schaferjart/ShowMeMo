// Builds public/data/ from the Art Institute of Chicago's monthly data dump
// (https://github.com/art-institute-of-chicago/api-data): downloads the
// tar.bz2, extracts json/artworks/, keeps public-domain works with an
// image_id, and shards the records into small JSON files.
//
// Images are not stored in the dump; every record's image is addressable
// through the museum's IIIF server from its image_id, at the size the
// museum recommends for reuse (843px).
//
// Sharding is by `ObjectID % shardCount`, so a permalink lookup needs only
// meta.json plus a single shard — no index file.
//
// Set ARTIC_DIR to a pre-extracted `artic-api-data` directory to skip the
// ~115 MB download.

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DUMP_URL = 'https://artic-api-data.s3.amazonaws.com/artic-api-data.tar.bz2';
const OUT_DIR = fileURLToPath(new URL('./public/data/', import.meta.url));
const TARGET_SHARD_BYTES = 40_000; // headroom under the ~50 KB ceiling
const IIIF = (imageId) =>
  `https://www.artic.edu/iiif/2/${imageId}/full/843,/0/default.jpg`;

let dumpDir = process.env.ARTIC_DIR;
let scratch = null;
if (!dumpDir) {
  scratch = await mkdtemp(join(tmpdir(), 'artic-'));
  const archive = join(scratch, 'artic-api-data.tar.bz2');
  console.error(`Downloading ${DUMP_URL} ...`);
  const res = await fetch(DUMP_URL);
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`);
  }
  await writeFile(archive, Buffer.from(await res.arrayBuffer()));
  console.error('Extracting json/artworks/ ...');
  execFileSync('tar', ['-xjf', archive, '-C', scratch, 'artic-api-data/json/artworks']);
  dumpDir = join(scratch, 'artic-api-data');
}

const artworksDir = join(dumpDir, 'json', 'artworks');
const files = (await readdir(artworksDir)).filter((f) => f.endsWith('.json'));
console.error(`Reading ${files.length} artwork files ...`);

const works = [];
for (const file of files) {
  const row = JSON.parse(await readFile(join(artworksDir, file), 'utf8'));
  if (!row.is_public_domain || !row.image_id) continue;
  const objectID = Number(row.id);
  if (!Number.isInteger(objectID) || objectID < 0) continue;
  const record = {
    ObjectID: objectID,
    Title: (row.title ?? '').trim(),
    Artist: (row.artist_display ?? '').replaceAll('\n', ', ').trim(),
    Date: (row.date_display ?? '').trim(),
    Medium: (row.medium_display ?? '').trim(),
    CreditLine: (row.credit_line ?? '').trim(),
    URL: `https://www.artic.edu/artworks/${objectID}`,
    ImageURL: IIIF(row.image_id),
  };
  if (row.is_on_view) record.OnView = 1;
  works.push(record);
}

if (scratch) await rm(scratch, { recursive: true, force: true });

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
  `Parsed ${files.length} records; wrote ${shardCount} shards (largest ${(largest / 1024).toFixed(1)} KB).`
);
console.log(`${works.length} public-domain works with images.`);
