// Builds public/data/ from the New York Public Library's January 2016
// public-domain release (https://github.com/NYPL-publicdomain/data-and-utilities):
// clones the repo, reads the pd_items ndjson files, keeps items with at
// least one image capture, and shards the records into small JSON files.
//
// The dump is a frozen snapshot of ~190k public-domain items; captures are
// direct images.nypl.org URLs (t=w requests the 760px web size).
//
// ObjectID is the NYPL databaseID, so `ObjectID % shardCount` permalinks
// work exactly as in the other sites.
//
// Set NYPL_DIR to an existing clone to skip the ~500 MB clone.

import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'https://github.com/NYPL-publicdomain/data-and-utilities';
const OUT_DIR = fileURLToPath(new URL('./public/data/', import.meta.url));
const TARGET_SHARD_BYTES = 40_000; // headroom under the ~50 KB ceiling

let repoDir = process.env.NYPL_DIR;
let scratch = null;
if (!repoDir) {
  scratch = await mkdtemp(join(tmpdir(), 'nypl-'));
  repoDir = join(scratch, 'data-and-utilities');
  console.error(`Cloning ${REPO} (shallow) ...`);
  execFileSync('git', ['clone', '--quiet', '--depth', '1', REPO, repoDir]);
}

const itemsDir = join(repoDir, 'items');
const files = (await readdir(itemsDir)).filter((f) => f.endsWith('.ndjson'));

const works = [];
let total = 0;
const seen = new Set();
for (const file of files) {
  const lines = createInterface({
    input: createReadStream(join(itemsDir, file)),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (!line.trim()) continue;
    total++;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const capture = (row.captures ?? [])[0];
    if (!capture) continue;
    const objectID = Number(row.databaseID);
    if (!Number.isInteger(objectID) || objectID < 0 || seen.has(objectID)) continue;
    seen.add(objectID);
    const artist = (row.contributor ?? [])
      .map((c) => (typeof c === 'string' ? c : c?.contributorName))
      .filter(Boolean)
      .join('; ');
    works.push({
      ObjectID: objectID,
      Title: (row.title ?? '').trim(),
      Artist: artist,
      Date: (row.date ?? '').toString().trim(),
      Medium: [(row.genre ?? []).join(', '), (row.physicalDescriptionForm ?? []).join(', ')]
        .filter(Boolean)
        .join('; '),
      CreditLine: (row.collectionTitle ?? '').trim() || 'The New York Public Library',
      URL: (row.digitalCollectionsURL ?? '').trim(),
      ImageURL: capture.replace(/^http:/, 'https:').replace(/&t=\w$/, '&t=w'),
    });
  }
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
  `Parsed ${total} items; wrote ${shardCount} shards (largest ${(largest / 1024).toFixed(1)} KB).`
);
console.log(`${works.length} public-domain items with images.`);
