// Builds public/data/ from Smithsonian Open Access metadata dumps
// (line-delimited JSON in the public smithsonian-open-access S3 bucket):
// downloads the files for the art museums' units, keeps CC0 records whose
// primary online media is an image, and shards the records.
//
// Units: SAAM (American Art), NPG (Portrait Gallery), FS (Asian Art),
// HMSG (Hirshhorn), NMAfA (African Art).
//
// Images are hotlinked from ids.si.edu at a 1000px bound; ObjectID is the
// record's index in the snapshot, so permalinks are best-effort across
// rebuilds.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BUCKET = 'https://smithsonian-open-access.s3.us-west-2.amazonaws.com';
const UNITS = ['saam', 'npg', 'fs', 'hmsg', 'nmafa'];
const UNIT_NAMES = {
  SAAM: 'Smithsonian American Art Museum',
  NPG: 'National Portrait Gallery',
  FS: 'National Museum of Asian Art',
  HMSG: 'Hirshhorn Museum and Sculpture Garden',
  NMAFA: 'National Museum of African Art',
};
const OUT_DIR = fileURLToPath(new URL('./public/data/', import.meta.url));
const TARGET_SHARD_BYTES = 40_000; // headroom under the ~50 KB ceiling
const CONCURRENCY = 12;

const files = [];
for (const unit of UNITS) {
  const res = await fetch(`${BUCKET}/metadata/edan/${unit}/index.txt`);
  if (!res.ok) throw new Error(`Index failed for ${unit}: HTTP ${res.status}`);
  const urls = (await res.text()).trim().split('\n').filter(Boolean);
  files.push(...urls);
  console.error(`${unit}: ${urls.length} files`);
}

const first = (list) => (list ?? [])[0]?.content ?? '';

const works = [];
let total = 0;
let done = 0;
async function worker() {
  for (;;) {
    const url = files.shift();
    if (!url) return;
    // index.txt uses the legacy s3-us-west-2 host; normalize to the bucket URL.
    const path = url.replace(/^https?:\/\/[^/]+\//, '');
    const res = await fetch(`${BUCKET}/${path}`);
    if (!res.ok) continue;
    for (const line of (await res.text()).trim().split('\n')) {
      if (!line) continue;
      total++;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      const dn = row.content?.descriptiveNonRepeating;
      if (dn?.metadata_usage?.access !== 'CC0') continue;
      const media = (dn.online_media?.media ?? []).find(
        (m) => m.type === 'Images' && m.content && m.usage?.access === 'CC0'
      );
      if (!media) continue;
      const ft = row.content?.freetext ?? {};
      works.push({
        Title: (dn.title?.content ?? '').trim(),
        Artist: first(ft.name).trim(),
        Date: first(ft.date).trim(),
        Medium: first(ft.physicalDescription).trim(),
        CreditLine: [first(ft.creditLine).trim(), UNIT_NAMES[row.unitCode] ?? row.unitCode]
          .filter(Boolean)
          .join(' — '),
        URL: (dn.record_link || dn.guid || '').trim(),
        ImageURL: `${media.content}&max=1000`,
      });
    }
    if (++done % 100 === 0) console.error(`  ${done} files, ${works.length} works ...`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// Deterministic order for a given snapshot, then index as ObjectID.
works.sort((a, b) => (a.URL < b.URL ? -1 : a.URL > b.URL ? 1 : 0));
works.forEach((w, i) => (w.ObjectID = i));

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
