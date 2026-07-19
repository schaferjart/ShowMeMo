// Builds public/data/ from the Fitzwilliam Museum's CC0 raw-data dump
// (https://github.com/FitzwilliamMuseum/fitz-collection-raw-data): downloads
// the master objects.csv.gz, keeps records with an image URL, and shards
// the records into small JSON files.
//
// The museum's live API is auth-gated; the GitHub dump is the sanctioned
// open channel. Object ids are numeric ("object-1000"), so ObjectID keeps
// the familiar `% shardCount` permalinks.

import { parse } from 'csv-parse';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const CSV_URL =
  'https://raw.githubusercontent.com/FitzwilliamMuseum/fitz-collection-raw-data/main/csv/objects.csv.gz';
const OUT_DIR = fileURLToPath(new URL('./public/data/', import.meta.url));
const TARGET_SHARD_BYTES = 40_000; // headroom under the ~50 KB ceiling

console.error(`Downloading ${CSV_URL} ...`);
const res = await fetch(CSV_URL);
if (!res.ok) {
  throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`);
}

const parser = Readable.fromWeb(res.body)
  .pipe(createGunzip())
  .pipe(parse({ bom: true, columns: true, relax_column_count: true }));

const works = [];
let total = 0;
for await (const row of parser) {
  total++;
  const imageURL = (row.largeImage ?? '').trim() || (row.thumbnail ?? '').trim();
  if (!imageURL) continue;
  const objectID = Number((row.id ?? '').replace(/^object-/, ''));
  if (!Number.isInteger(objectID) || objectID < 0) continue;
  const dates = [row.fromDate, row.toDate].map((d) => (d ?? '').trim()).filter(Boolean);
  works.push({
    ObjectID: objectID,
    Title: (row.title ?? '').trim(),
    Artist: (row.maker ?? '').trim(),
    Date: (row.period ?? '').trim() || (dates[0] === dates[1] ? dates[0] : dates.join('–')) || '',
    Medium: (row.primaryCategory ?? '').trim(),
    CreditLine: `The Fitzwilliam Museum, Cambridge — ${(row.department ?? '').trim()}`,
    URL: (row.URI ?? '').trim(),
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
  `Parsed ${total} objects; wrote ${shardCount} shards (largest ${(largest / 1024).toFixed(1)} KB).`
);
console.log(`${works.length} works with images.`);
