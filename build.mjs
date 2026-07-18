// Downloads MoMA's Artworks.csv, filters to works with images, and shards the
// records into small JSON files under public/data/.
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
  'https://media.githubusercontent.com/media/MuseumofModernArt/collection/main/Artworks.csv';

const OUT_DIR = fileURLToPath(new URL('./public/data/', import.meta.url));
const TARGET_SHARD_BYTES = 40_000; // headroom under the ~50 KB ceiling

console.error(`Downloading ${CSV_URL} ...`);
const res = await fetch(CSV_URL);
if (!res.ok) {
  throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`);
}

// Stream straight into the CSV parser. The file starts with a UTF-8 BOM and
// fields contain quoted commas and escaped quotes; csv-parse handles all that.
const parser = Readable.fromWeb(res.body).pipe(
  parse({ bom: true, columns: true, relax_column_count: true })
);

const works = [];
let total = 0;
for await (const row of parser) {
  total++;
  const imageURL = (row.ImageURL ?? '').trim();
  if (!imageURL) continue;
  const objectID = Number(row.ObjectID);
  if (!Number.isInteger(objectID) || objectID < 0) continue;
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
  if ((row.OnView ?? '').trim()) record.OnView = 1;
  works.push(record);
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
console.log(`${works.length} works with images.`);
