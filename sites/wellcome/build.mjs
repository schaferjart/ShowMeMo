// Builds public/data/ from the Wellcome Collection images API
// (https://developers.wellcomecollection.org, keyless): pages the /images
// endpoint filtered to CC0 and Public Domain Mark licenses and shards the
// records.
//
// NOTE: api.wellcomecollection.org is not reachable from every sandboxed
// environment; this site is normally built by the fleet deploy
// GitHub Actions workflow.
//
// The API caps any single result set at 10,000 items, so the harvest runs
// once per license to reach up to 20,000 (logged, not silent).
//
// ObjectID is the record's index in the snapshot, so permalinks are
// best-effort across rebuilds.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fetchText } from '../../fetch-retry.mjs';

const API = 'https://api.wellcomecollection.org/catalogue/v2/images';
const OUT_DIR = fileURLToPath(new URL('./public/data/', import.meta.url));
const TARGET_SHARD_BYTES = 40_000; // headroom under the ~50 KB ceiling
const LICENSES = { 'cc-0': 'CC0', 'pdm': 'Public Domain Mark' };

const byId = new Map();
for (const [license, licenseName] of Object.entries(LICENSES)) {
  for (let page = 1; page <= 100; page++) {
    // The API dropped source.production (dates); source.contributors remains
    // the only useful include here, so Date is left blank.
    const url = `${API}?locations.license=${license}&pageSize=100&page=${page}&include=source.contributors`;
    const res = await fetchText(url);
    if (!res.ok) break;
    const body = JSON.parse(res.text);
    for (const item of body.results ?? []) {
      if (!item.id || byId.has(item.id)) continue;
      // thumbnail.url is a IIIF info.json; rewrite it to a sized image.
      const info = item.thumbnail?.url ?? '';
      if (!info) continue;
      const src = item.source ?? {};
      const contributors = (src.contributors ?? [])
        .map((c) => c.agent?.label)
        .filter(Boolean)
        .join('; ');
      byId.set(item.id, {
        Title: (src.title ?? '').trim(),
        Artist: contributors,
        Date: '',
        Medium: '',
        CreditLine: `Wellcome Collection (${licenseName})`,
        URL: src.id ? `https://wellcomecollection.org/works/${src.id}/images?id=${item.id}` : '',
        ImageURL: info.replace(/\/info\.json$/, '/full/!1000,1000/0/default.jpg'),
      });
    }
    const total = body.totalResults ?? 0;
    if (page * 100 >= Math.min(total, 10_000)) {
      if (total > 10_000) {
        console.error(`  ${license}: capped at 10,000 of ${total} available`);
      }
      break;
    }
  }
  console.error(`  ${license}: ${byId.size} total ...`);
}

const works = [...byId.values()];
if (works.length < 100) {
  throw new Error(`Only ${works.length} images harvested — API shape changed?`);
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

console.log(`${works.length} open-license images.`);
