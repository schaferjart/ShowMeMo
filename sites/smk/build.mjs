// Builds public/data/ from SMK — Statens Museum for Kunst, the National
// Gallery of Denmark (https://www.smk.dk/en/article/smk-api/): pages the
// keyless JSON API for public-domain works with images and shards the
// records into small JSON files.
//
// NOTE: api.smk.dk is not reachable from every sandboxed environment; this
// branch is normally built by the build-distractors GitHub Actions
// workflow, where the runner has open egress.
//
// ObjectID is the record's index in the snapshot (SMK object numbers are
// not numeric), so permalinks are best-effort across rebuilds.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fetchText } from '../../fetch-retry.mjs';

const API = 'https://api.smk.dk/api/v1/art/search/';
const OUT_DIR = fileURLToPath(new URL('./public/data/', import.meta.url));
const TARGET_SHARD_BYTES = 40_000; // headroom under the ~50 KB ceiling
const ROWS = 1000;

const works = [];
let offset = 0;
let found = Infinity;
while (offset < found) {
  const url = `${API}?keys=*&filters=[has_image:true],[public_domain:true]&offset=${offset}&rows=${ROWS}`;
  const res = await fetchText(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} at offset ${offset}`);
  const page = JSON.parse(res.text);
  found = page.found ?? 0;
  for (const item of page.items ?? []) {
    const image = (item.image_native ?? item.image_max ?? '').toString().trim();
    if (!image) continue;
    const production = (item.production ?? [])[0] ?? {};
    const artist =
      (item.artist ?? []).join('; ') ||
      [production.creator, production.creator_nationality].filter(Boolean).join(', ');
    const dates = (item.production_date ?? [])[0] ?? {};
    works.push({
      Title: ((item.titles ?? [])[0]?.title ?? '').trim(),
      Artist: artist.trim(),
      Date: (dates.period ?? '').toString().trim(),
      Medium: (item.techniques ?? []).join(', '),
      CreditLine: 'SMK — Statens Museum for Kunst (CC0)',
      URL: item.object_number
        ? `https://open.smk.dk/en/artwork/image/${encodeURIComponent(item.object_number)}`
        : '',
      ImageURL: image,
    });
  }
  offset += ROWS;
  console.error(`  ${Math.min(offset, found)}/${found} ...`);
}

if (works.length < 100) {
  throw new Error(`Only ${works.length} works harvested — API shape changed?`);
}

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

await writeFile(
  `${OUT_DIR}meta.json`,
  JSON.stringify({ totalWorks: works.length, shardCount, builtAt: new Date().toISOString() })
);

console.log(`${works.length} public-domain works with images.`);
