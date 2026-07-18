// Builds public/data/ from the Smithsonian Open Access 3D bucket
// (https://3d.si.edu, mirrored at smithsonian-open-access on AWS S3): lists
// every key under 3d/, groups files by package uuid, picks a browser-sized
// GLB and a poster image for each, and reads the package's scene.svx.json
// for its title and EDAN record id.
//
// The bucket is anonymously listable and serves every file with
// `Access-Control-Allow-Origin: *`, so the client can load the GLBs
// cross-origin with no server and no key.
//
// Sharding is by `ObjectID % shardCount`; ObjectID is the package's index
// in uuid order (the set is small, so permalinks are best-effort across
// rebuilds).

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BUCKET = 'https://smithsonian-open-access.s3.us-west-2.amazonaws.com';
const OUT_DIR = fileURLToPath(new URL('./public/data/', import.meta.url));
const TARGET_SHARD_BYTES = 40_000; // headroom under the ~50 KB ceiling
const CONCURRENCY = 16;

// --- 1. List every key under 3d/ (paged, 1000 keys per request). ---
const keys = [];
let token = null;
do {
  const url = new URL(BUCKET);
  url.searchParams.set('list-type', '2');
  url.searchParams.set('prefix', '3d/');
  url.searchParams.set('max-keys', '1000');
  if (token) url.searchParams.set('continuation-token', token);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`List failed: HTTP ${res.status}`);
  const xml = await res.text();
  for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(m[1]);
  token = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] ?? null;
  if (keys.length % 10000 < 1000) console.error(`  ${keys.length} keys ...`);
} while (token);
console.error(`Listed ${keys.length} keys.`);

// --- 2. Group by package uuid and pick a GLB + poster per package. ---
const packages = new Map();
for (const key of keys) {
  const m = key.match(/^3d\/([^/]+)\/([^/]+)$/);
  if (!m) continue;
  let pkg = packages.get(m[1]);
  if (!pkg) packages.set(m[1], (pkg = { files: [] }));
  pkg.files.push(m[2]);
}

function pickGlb(files) {
  // Non-Draco first so no decoder is needed; low LOD keeps pageloads ~1 MB.
  const order = [
    (f) => f.endsWith('-low-nondraco.glb'),
    (f) => f.endsWith('-low.glb'),
    (f) => f.endsWith('-medium-nondraco.glb'),
    (f) => f.endsWith('-medium.glb'),
    (f) => f.endsWith('.glb'),
  ];
  for (const test of order) {
    const hit = files.find(test);
    if (hit) return hit;
  }
  return null;
}

const candidates = [];
for (const [uuid, pkg] of [...packages.entries()].sort()) {
  if (!pkg.files.includes('scene.svx.json')) continue;
  const glb = pickGlb(pkg.files);
  if (!glb) continue;
  const poster =
    ['scene-image-medium.jpg', 'scene-image-low.jpg', 'scene-image-thumb.jpg'].find((f) =>
      pkg.files.includes(f)
    ) ?? null;
  candidates.push({ uuid, glb, poster });
}
console.error(`${candidates.length} packages with a scene and a GLB.`);

// --- 3. Fetch each scene.svx.json for title + EDAN record id. ---
const works = [];
let done = 0;
async function worker() {
  for (;;) {
    const c = candidates.shift();
    if (!c) return;
    try {
      const res = await fetch(`${BUCKET}/3d/${c.uuid}/scene.svx.json`);
      if (!res.ok) continue;
      const scene = await res.json();
      const col = scene.metas?.find((m) => m.collection)?.collection ?? {};
      const edan = (col.edanRecordId ?? '').replace(/^edanmdm[:-]/, '');
      works.push({
        Uuid: c.uuid,
        Title: (col.title ?? col.sceneTitle ?? '').trim() || c.glb.replace(/\.glb$/, ''),
        Medium: (col.sceneTitle ?? '').trim(),
        CreditLine: 'Smithsonian Institution, Open Access (CC0)',
        URL: edan ? `https://www.si.edu/object/${edan}` : '',
        GlbURL: `${BUCKET}/3d/${c.uuid}/${encodeURIComponent(c.glb)}`,
        PosterURL: c.poster ? `${BUCKET}/3d/${c.uuid}/${c.poster}` : '',
      });
    } catch {
      // A missing or malformed scene file just drops the package.
    } finally {
      if (++done % 250 === 0) console.error(`  ${done} scenes read ...`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// Index in uuid order so ObjectIDs are deterministic for a given snapshot.
works.sort((a, b) => (a.Uuid < b.Uuid ? -1 : 1));
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
  `Wrote ${shardCount} shards (largest ${(largest / 1024).toFixed(1)} KB).`
);
console.log(`${works.length} 3D objects.`);
