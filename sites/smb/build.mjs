// Builds public/data/ from the Staatliche Museen zu Berlin collection
// search (the keyless JSON backend behind recherche.smb.museum): pages the
// search endpoint for records with image attachments and shards them.
//
// NOTE: api.smb.museum is public but undocumented — pin to the shapes the
// museum's own frontend uses, log the first response, and fail loudly on
// mismatch. The host is not reachable from every sandboxed environment;
// this branch is normally built by the build-distractors workflow.
//
// Image URLs are deterministic: recherche.smb.museum/images/{asset}_{size}.jpg
// (the client falls back to another work if a rendition 404s).

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fetchText } from '../../fetch-retry.mjs';

const API = 'https://api.smb.museum/search/';
const OUT_DIR = fileURLToPath(new URL('./public/data/', import.meta.url));
const TARGET_SHARD_BYTES = 40_000; // headroom under the ~50 KB ceiling
const LIMIT = 100;
const MAX_OFFSET = 25000; // the API returns HTTP 500 past this deep-paging window

const works = [];
let offset = 0;
let total = Infinity;
let logged = false;
while (offset < Math.min(total, MAX_OFFSET)) {
  const res = await fetchText(`${API}?lang=de&limit=${LIMIT}&offset=${offset}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Referer: 'https://recherche.smb.museum/',
    },
    body: JSON.stringify({
      q_advanced: [{ field: 'attachments', operator: 'AND', q: 'true' }],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} at offset ${offset}`);
  const body = JSON.parse(res.text);
  if (!logged) {
    console.error('First response keys:', Object.keys(body).join(', '));
    console.error('First object:', JSON.stringify(body.objects?.[0]).slice(0, 600));
    logged = true;
  }
  total = body.total ?? 0;
  for (const o of body.objects ?? []) {
    const asset = (o.assets ?? [])[0];
    const objectID = Number(o.id);
    if (!asset || !Number.isInteger(objectID)) continue;
    works.push({
      ObjectID: objectID,
      Title: (o.title ?? '').trim(),
      Artist: (o.involvedParties ?? []).join('; '),
      Date: (o.dating ?? [])[0] ?? '',
      Medium: (o.materialAndTechnique ?? []).join('; '),
      CreditLine: `${(o.collection ?? '').toString()} — Staatliche Museen zu Berlin`,
      URL: (o.permalink ?? '').trim(),
      ImageURL: `https://recherche.smb.museum/images/${asset}_800x800.jpg`,
    });
  }
  offset += LIMIT;
  if (offset % 5000 === 0) console.error(`  ${offset}/${total} ...`);
}
if (total > MAX_OFFSET) {
  console.error(`  capped at ${MAX_OFFSET} of ${total} (API deep-paging limit)`);
}

if (works.length < 100) {
  throw new Error(`Only ${works.length} works harvested — API shape changed?`);
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

await writeFile(
  `${OUT_DIR}meta.json`,
  JSON.stringify({ totalWorks: works.length, shardCount, builtAt: new Date().toISOString() })
);

console.log(`${works.length} works with images.`);
