// Builds public/data/ from the NASA Image and Video Library
// (https://images.nasa.gov, keyless): sweeps a set of topic queries
// through the search API, dedupes by nasa_id, and shards the records.
//
// NOTE: images-api.nasa.gov is not reachable from every sandboxed
// environment; this branch is normally built by the build-distractors
// GitHub Actions workflow.
//
// ObjectID is the record's index in the snapshot, so permalinks are
// best-effort across rebuilds.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fetchText } from '../../fetch-retry.mjs';

const API = 'https://images-api.nasa.gov/search';
const OUT_DIR = fileURLToPath(new URL('./public/data/', import.meta.url));
const TARGET_SHARD_BYTES = 40_000; // headroom under the ~50 KB ceiling
const QUERIES = [
  'apollo', 'gemini', 'mercury program', 'space shuttle', 'international space station',
  'hubble', 'webb telescope', 'mars', 'moon', 'earth', 'saturn', 'jupiter', 'venus',
  'nebula', 'galaxy', 'astronaut', 'launch', 'spacewalk', 'voyager', 'artemis',
];
const MAX_PAGES = 100; // the API refuses to page past 10,000 results per query

const byId = new Map();
for (const q of QUERIES) {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${API}?q=${encodeURIComponent(q)}&media_type=image&page_size=100&page=${page}`;
    const res = await fetchText(url);
    if (!res.ok) break; // past the last page the API returns 400
    const items = JSON.parse(res.text).collection?.items ?? [];
    if (!items.length) break;
    for (const item of items) {
      const data = item.data?.[0];
      const thumb = item.links?.find((l) => l.rel === 'preview')?.href;
      if (!data?.nasa_id || !thumb || byId.has(data.nasa_id)) continue;
      // Skip items whose description asserts third-party copyright.
      if (/copyright/i.test(data.description ?? '') && !/no copyright/i.test(data.description ?? '')) continue;
      byId.set(data.nasa_id, {
        Title: (data.title ?? '').trim(),
        Artist: (data.photographer ?? data.secondary_creator ?? '').trim(),
        Date: (data.date_created ?? '').slice(0, 10),
        Medium: (data.center ?? '').trim(),
        CreditLine: 'NASA Image and Video Library (public domain)',
        URL: `https://images.nasa.gov/details/${encodeURIComponent(data.nasa_id)}`,
        ImageURL: thumb.replace('~thumb.', '~medium.').replace(/^http:/, 'https:'),
      });
    }
  }
  console.error(`  ${q}: ${byId.size} total ...`);
}

const works = [...byId.values()];
if (works.length < 100) {
  throw new Error(`Only ${works.length} items harvested — API shape changed?`);
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

console.log(`${works.length} images.`);
