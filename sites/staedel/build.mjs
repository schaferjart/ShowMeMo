// Builds public/data/ from the Städel Museum's keyless OAI-PMH interface
// (https://sammlung.staedelmuseum.de/en/oai/guide): harvests LIDO records
// (1000 per page, resumption-token loop), keeps records with an image
// linkResource, and shards the records.
//
// NOTE: sammlung.staedelmuseum.de is not reachable from every sandboxed
// environment; this site is normally built by the fleet deploy
// GitHub Actions workflow. The museum asks harvesters to register a name
// and email as a courtesy.
//
// LIDO is XML; this parses the handful of needed paths with regexes,
// which is crude but dependency-free. ObjectID is the numeric tail of the
// OAI identifier (oai:DE-MUS-048017:{id}).

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fetchText } from '../../fetch-retry.mjs';

const OAI = 'https://sammlung.staedelmuseum.de/api/oai';
const OUT_DIR = fileURLToPath(new URL('./public/data/', import.meta.url));
const TARGET_SHARD_BYTES = 40_000; // headroom under the ~50 KB ceiling

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(n))
    .replace(/&amp;/g, '&')
    .trim();

// First match of a LIDO element's text content, ignoring attributes/namespaces.
const grab = (xml, element) => {
  const m = xml.match(new RegExp(`<lido:${element}\\b[^>]*>([^<]*)</lido:${element}>`));
  return m ? decode(m[1]) : '';
};

const works = [];
let url = `${OAI}?verb=ListRecords&metadataPrefix=lido`;
for (;;) {
  const res = await fetchText(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const xml = res.text;
  const records = xml.split('<record>').slice(1);
  for (const record of records) {
    if (record.includes('status="deleted"')) continue;
    const idMatch = record.match(/<identifier>oai:[^:<]+:(\d+)<\/identifier>/);
    const objectID = idMatch ? Number(idMatch[1]) : NaN;
    if (!Number.isInteger(objectID)) continue;
    const image = grab(record, 'linkResource');
    if (!image || !/^https?:/.test(image)) continue;
    const page = grab(record, 'recordInfoLink');
    works.push({
      ObjectID: objectID,
      Title: grab(record, 'appellationValue'),
      Artist:
        grab(record, 'displayActorInRole') ||
        (record.match(/<lido:actor\b[\s\S]*?<lido:appellationValue[^>]*>([^<]*)</) ?? [])[1]?.trim() ||
        '',
      Date: grab(record, 'displayDate'),
      Medium: grab(record, 'displayMaterialsTech'),
      CreditLine: 'Städel Museum, Frankfurt am Main (CC BY-SA 4.0)',
      URL: page,
      ImageURL: image,
    });
  }
  const token = xml.match(/<resumptionToken[^>]*>([^<]+)<\/resumptionToken>/)?.[1];
  if (!token) break;
  url = `${OAI}?verb=ListRecords&resumptionToken=${encodeURIComponent(token.trim())}`;
  console.error(`  ${works.length} works ...`);
}

if (works.length < 100) {
  throw new Error(`Only ${works.length} works harvested — OAI shape changed?`);
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
