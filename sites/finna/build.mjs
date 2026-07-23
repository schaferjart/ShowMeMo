// Builds public/data/ from Finna.fi, the Finnish museums/archives/libraries
// aggregator (https://api.finna.fi, keyless, CC0 metadata): pages the
// search API for freely reusable images and shards the records.
//
// NOTE: api.finna.fi is not reachable from every sandboxed environment;
// this site is normally built by the fleet deploy GitHub Actions
// workflow.
//
// Deep paging is capped by the backend, so the harvest runs once per
// usage-rights class (usage_B = CC0/PD, usage_A = CC BY) and logs any cap.
// ObjectID is the record's index in the snapshot.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fetchText } from '../../fetch-retry.mjs';

const API = 'https://api.finna.fi/v1/search';
const OUT_DIR = fileURLToPath(new URL('./public/data/', import.meta.url));
const TARGET_SHARD_BYTES = 40_000; // headroom under the ~50 KB ceiling
const USAGE = { usage_B: 'free reuse', usage_A: 'CC BY' };
const MAX_PAGES = 1000; // limit=100 → up to 100k per class

const byId = new Map();
for (const [usage, usageName] of Object.entries(USAGE)) {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({ page: String(page), limit: '100', lng: 'en-gb' });
    params.append('filter[]', '~format_ext_str_mv:"0/Image/"');
    params.append('filter[]', 'free_online_boolean:"1"');
    params.append('filter[]', `~usage_rights_str_mv:"${usage}"`);
    for (const f of ['id', 'title', 'nonPresenterAuthors', 'year', 'formats', 'buildings', 'imageRights', 'images']) {
      params.append('field[]', f);
    }
    const res = await fetchText(`${API}?${params}`);
    if (!res.ok) break;
    const body = JSON.parse(res.text);
    const records = body.records ?? [];
    if (!records.length) break;
    for (const r of records) {
      const image = (r.images ?? [])[0];
      if (!r.id || !image || byId.has(r.id)) continue;
      const building = (r.buildings ?? [])[0]?.translated ?? '';
      const license = r.imageRights?.copyright ?? usageName;
      byId.set(r.id, {
        Title: (r.title ?? '').trim(),
        Artist: (r.nonPresenterAuthors ?? []).map((a) => a.name).filter(Boolean).join('; '),
        Date: (r.year ?? '').toString(),
        Medium: '',
        CreditLine: [building, license].filter(Boolean).join(' — '),
        URL: `https://finna.fi/Record/${encodeURIComponent(r.id)}`,
        ImageURL: `https://api.finna.fi${image}`,
      });
    }
    const total = body.resultCount ?? 0;
    if (page % 50 === 0) console.error(`  ${usage} p${page}: ${byId.size} total ...`);
    if (page * 100 >= total) break;
    if (page === MAX_PAGES) console.error(`  ${usage}: capped at ${MAX_PAGES * 100} of ${total}`);
  }
  console.error(`  ${usage} done: ${byId.size} total`);
}

const works = [...byId.values()];
if (works.length < 100) {
  throw new Error(`Only ${works.length} records harvested — API shape changed?`);
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

console.log(`${works.length} freely reusable images.`);
