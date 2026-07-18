// Downloads the Cleveland Museum of Art's open-access data.csv, keeps CC0
// works with a web image, and shards the records into small JSON files under
// public/data/.
//
// Sharding is by `ObjectID % shardCount`, so a permalink lookup needs only
// meta.json plus a single shard — no index file.

import { parse } from 'csv-parse';
import { Readable } from 'node:stream';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// The CSV lives in Git LFS; the plain raw.githubusercontent.com URL returns
// only an LFS pointer file, so fetch the media URL instead.
const CSV_URL =
  'https://media.githubusercontent.com/media/ClevelandMuseumArt/openaccess/master/data.csv';

const OUT_DIR = fileURLToPath(new URL('./public/data/', import.meta.url));
const TARGET_SHARD_BYTES = 40_000; // headroom under the ~50 KB ceiling

console.error(`Downloading ${CSV_URL} ...`);
const res = await fetch(CSV_URL);
if (!res.ok) {
  throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`);
}

const parser = Readable.fromWeb(res.body).pipe(
  parse({ bom: true, columns: true, relax_column_count: true })
);

const works = [];
let total = 0;
for await (const row of parser) {
  total++;
  if ((row.share_license_status ?? '').trim() !== 'CC0') continue;
  const imageURL = (row.image_web ?? '').trim();
  if (!imageURL) continue;
  const objectID = Number(row.id);
  if (!Number.isInteger(objectID) || objectID < 0) continue;
  works.push({
    ObjectID: objectID,
    Title: (row.title ?? '').trim(),
    Artist: (row.creators ?? '').trim(),
    Date: (row.creation_date ?? '').trim(),
    Medium: (row.technique ?? '').trim(),
    CreditLine: (row.creditline ?? '').trim(),
    URL: (row.url ?? '').trim(),
    ImageURL: imageURL,
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
  `Parsed ${total} records; wrote ${shardCount} shards (largest ${(largest / 1024).toFixed(1)} KB).`
);
console.log(`${works.length} CC0 works with images.`);
