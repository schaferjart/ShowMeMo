// Builds ONE fleet site into dist/<name>/.
//
//   node build-site.mjs <name>
//
// Steps: run the site's own build.mjs (which writes sites/<name>/public/data/),
// render shared/index.template.html with the site's config.json, and assemble
// the deploy-ready folder (index.html + shared app.js/style.css + data/).
//
// `museum` is special: a hand-written static index page — copied verbatim, no
// build, no config.

import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const name = process.argv[2];
if (!name) {
  console.error('usage: node build-site.mjs <site>');
  process.exit(1);
}

const root = fileURLToPath(new URL('.', import.meta.url));
const siteDir = `${root}sites/${name}/`;
const sharedDir = `${root}shared/`;
const outDir = `${root}dist/${name}/`;

if (!existsSync(siteDir)) {
  console.error(`no such site: sites/${name}/`);
  process.exit(1);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

if (name === 'museum') {
  await cp(`${siteDir}index.html`, `${outDir}index.html`);
  console.error(`museum: copied static index -> dist/museum/`);
  process.exit(0);
}

// 1. Build the dataset. The site's build.mjs writes sites/<name>/public/data/.
await run('node', [`${siteDir}build.mjs`]);

// 2. Render the shared template with this site's config.
const config = JSON.parse(await readFile(`${siteDir}config.json`, 'utf8'));
const fields = {
  TITLE: config.title,
  DESCRIPTION: config.description,
  VIEW_LABEL: config.viewLabel,
  FOOTER: config.footer,
  SLUG: config.slug,
  MUSEUM: config.museum,
};
// ponytail: raw substitution; our config values contain no quotes/braces that
// would break the HTML/JS contexts. The leftover-{{ guard below fails loud if a
// placeholder goes unfilled; add JSON-escaping here if a museum name ever needs it.
let html = await readFile(`${sharedDir}index.template.html`, 'utf8');
for (const [k, v] of Object.entries(fields)) {
  if (v == null) throw new Error(`${name}/config.json missing ${k.toLowerCase()}`);
  html = html.replaceAll(`{{${k}}}`, v);
}
if (html.includes('{{')) throw new Error(`unfilled placeholder in rendered ${name} index.html`);
await writeFile(`${outDir}index.html`, html);

// 3. Shared assets + the freshly built data.
await cp(`${sharedDir}app.js`, `${outDir}app.js`);
await cp(`${sharedDir}style.css`, `${outDir}style.css`);
await cp(`${siteDir}public/data/`, `${outDir}data/`, { recursive: true });

console.error(`built ${name} -> dist/${name}/`);

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))
    );
  });
}
