// Builds public/data/ from the Minneapolis Institute of Art's collection
// repo (https://github.com/artsmia/collection): shallow-clones it (one JSON
// file per object, committed daily), keeps unrestricted public-domain works
// with a valid image, and shards the records into small JSON files.
//
// Images are served from the museum's image API at its 800px "large" size.
//
// Sharding is by `ObjectID % shardCount`, so a permalink lookup needs only
// meta.json plus a single shard — no index file.
//
// Set MIA_DIR to an existing clone to skip the ~900 MB clone.

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'https://github.com/artsmia/collection';
const OUT_DIR = fileURLToPath(new URL('./public/data/', import.meta.url));
const TARGET_SHARD_BYTES = 40_000; // headroom under the ~50 KB ceiling

let repoDir = process.env.MIA_DIR;
let scratch = null;
if (!repoDir) {
  scratch = await mkdtemp(join(tmpdir(), 'mia-'));
  repoDir = join(scratch, 'collection');
  console.error(`Cloning ${REPO} (shallow) ...`);
  execFileSync('git', ['clone', '--quiet', '--depth', '1', REPO, repoDir]);
}

const objectsDir = join(repoDir, 'objects');
const works = [];
let total = 0;
for (const bucket of await readdir(objectsDir)) {
  let files;
  try {
    files = await readdir(join(objectsDir, bucket));
  } catch {
    continue;
  }
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    total++;
    let row;
    try {
      row = JSON.parse(await readFile(join(objectsDir, bucket, file), 'utf8'));
    } catch {
      continue;
    }
    if (row.image !== 'valid' || Number(row.restricted) === 1) continue;
    if ((row.rights_type ?? '') !== 'Public Domain') continue;
    const objectID = Number(row.id);
    if (!Number.isInteger(objectID) || objectID < 0) continue;
    const artist = [row.artist, row.life_date].filter(Boolean).join(', ');
    const record = {
      ObjectID: objectID,
      Title: (row.title ?? '').trim(),
      Artist: artist.trim(),
      Date: (row.dated ?? '').trim(),
      Medium: (row.medium ?? '').trim(),
      CreditLine: (row.creditline ?? '').trim(),
      URL: `https://collections.artsmia.org/art/${objectID}`,
      ImageURL: `https://api.artsmia.org/images/${objectID}/large.jpg`,
    };
    if (row.room && row.room !== 'Not on View') record.OnView = 1;
    works.push(record);
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
  `Parsed ${total} objects; wrote ${shardCount} shards (largest ${(largest / 1024).toFixed(1)} KB).`
);
console.log(`${works.length} public-domain works with images.`);
