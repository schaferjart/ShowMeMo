// Builds public/data/ from the Walters Art Museum's static open-access
// files (https://github.com/WaltersArtMuseum/api-thewalters-org): clones the
// repo, joins art.csv with media.csv on ObjectID, keeps works that have an
// image, and shards the records into small JSON files.
//
// The Walters' v1 API was shut down in 2023; these CSVs are the museum's
// interim data product, so treat the dataset as a frozen snapshot.
//
// Sharding is by `ObjectID % shardCount`, so a permalink lookup needs only
// meta.json plus a single shard — no index file.
//
// Set WALTERS_DIR to an existing clone to skip the ~40 MB clone.

import { parse } from 'csv-parse';
import { createReadStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'https://github.com/WaltersArtMuseum/api-thewalters-org';
const OUT_DIR = fileURLToPath(new URL('./public/data/', import.meta.url));
const TARGET_SHARD_BYTES = 40_000; // headroom under the ~50 KB ceiling

let repoDir = process.env.WALTERS_DIR;
let scratch = null;
if (!repoDir) {
  scratch = await mkdtemp(join(tmpdir(), 'walters-'));
  repoDir = join(scratch, 'api-thewalters-org');
  console.error(`Cloning ${REPO} (shallow) ...`);
  execFileSync('git', ['clone', '--quiet', '--depth', '1', REPO, repoDir]);
}

const csv = (file) =>
  createReadStream(join(repoDir, file)).pipe(
    parse({ bom: true, columns: true, relax_column_count: true })
  );

// One image per object: the primary if flagged, otherwise the best-ranked.
const imageByObject = new Map();
for await (const row of csv('media.csv')) {
  if (row.MediaType !== 'Image') continue;
  const objectID = Number(row.ObjectID);
  const url = (row.ImageURL ?? '').trim();
  if (!Number.isInteger(objectID) || !url) continue;
  const rank = Number(row.Rank) || 99;
  const primary = row.IsPrimary === '1';
  const prev = imageByObject.get(objectID);
  if (!prev || (primary && !prev.primary) || (!prev.primary && rank < prev.rank)) {
    imageByObject.set(objectID, { url, rank, primary });
  }
}
console.error(`${imageByObject.size} objects with an image.`);

const works = [];
let total = 0;
for await (const row of csv('art.csv')) {
  total++;
  const objectID = Number(row.ObjectID);
  if (!Number.isInteger(objectID) || objectID < 0) continue;
  const image = imageByObject.get(objectID);
  if (!image) continue;
  works.push({
    ObjectID: objectID,
    Title: (row.Title ?? '').trim(),
    Artist: (row.Creators ?? '').trim() || (row.Culture ?? '').trim(),
    Date: (row.DateText ?? '').trim(),
    Medium: (row.Medium ?? '').trim(),
    CreditLine: (row.CreditLine ?? '').trim() || 'The Walters Art Museum',
    URL: (row.ResourceURL ?? '').trim(),
    ImageURL: image.url,
  });
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
  `Parsed ${total} objects; wrote ${shardCount} shards (largest ${(largest / 1024).toFixed(1)} KB).`
);
console.log(`${works.length} works with images.`);
