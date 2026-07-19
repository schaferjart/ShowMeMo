# Merci: MoMA

A single-serving site in the spirit of James Bridle's
[The Distractor](https://distractor.jamesbridle.com/) (2023): one random artwork
from [The Museum of Modern Art's collection dataset](https://github.com/MuseumofModernArt/collection),
full screen, with almost no interface.

- The artwork fills the viewport; the works you saw before remain beneath it,
  neatly piled — straight, slightly offset, dimmed — growing as you browse
  (a distant safety cap keeps very long sessions smooth).
- The refresh button (or `Space` / `R`) loads another random work.
- The download button saves the image.
- Title, artist, and year are always visible at the bottom; clicking them
  reveals medium, credit line, and a link to the work at MoMA
  (the `×`, `Esc`, or `I` closes it again).
- `?id=<ObjectID>` permalinks to a specific work; the URL always reflects the
  work on screen.
- `?onview=1` restricts the random picks to works currently on view at MoMA.

That's it. The restraint is the product.

## How it works

There is no backend and no framework. `build.mjs` downloads MoMA's
`Artworks.csv` (~160,000 records, Git LFS), keeps the ~half that have an
image URL, and shards them into small JSON files by `ObjectID % shardCount`.
Because the shard for any ObjectID is computable, permalinks resolve with no
index file. Per pageview the client fetches only `meta.json`, one shard
(< 50 KB), and one JPEG hotlinked from MoMA's media server.

## Build

Requires Node 18+.

```sh
npm install
npm run build
```

This downloads the CSV (it takes a minute) and writes
`public/data/shard-<n>.json` plus `public/data/meta.json`, printing the final
count of works with images. Re-run it any time to refresh the dataset —
MoMA updates the source repository regularly.

## Run locally

Serve the `public/` folder with any static file server:

```sh
python3 -m http.server 8000 -d public
```

## Deploy

### GitHub Pages

`.github/workflows/pages.yml` builds the dataset and publishes `public/` to the
**root** of the `gh-pages` branch on every push to `main`, leaving the sibling
Distractors' subfolders in place. The site is served at
<https://schaferjart.github.io/ShowMeMo/>. To refresh the dataset, re-run the
workflow from the Actions tab (`workflow_dispatch`).

`gh-pages` is a shared tree: the root is this site, and each sibling Distractor
owns one subfolder (`/cleveland/`, `/artic/`, `/3d/`, `/hpbda/`, ...). Two rules
keep that from breaking:

- **One deploy target per workflow file.** A branch needing its own deploy adds
  a new filename (`deploy-hpbda.yml`), never a second copy of `pages.yml` —
  otherwise merging that branch overwrites this workflow's trigger.
- **No deploy step wipes what it does not own.** The root deploy deletes only
  top-level files and `data/`; subfolder deploys touch only their subfolder.

Branches whose data source needs open egress (SMK, NASA, Wellcome, Städel,
Finna, SMB) are built and deployed by `build-distractors.yml`, which checks each
one out by ref and runs serially so the pushes to `gh-pages` cannot race.

### Docker / Coolify

The `Dockerfile` is a two-stage build: a Node stage runs `build.mjs` (so the
image always ships a fresh dataset), then `nginx:alpine` serves `public/` with
long cache headers for `/data/` and static assets, and no caching for
`index.html`.

```sh
docker build -t distractor-moma .
docker run -p 8080:80 distractor-moma
```

On Coolify: create an application from this repository with the Dockerfile
build pack; the container listens on port 80. To refresh the dataset, simply
redeploy (the dataset is fetched at image build time). Cached `/data/` files
may take up to 30 days to expire for returning visitors; that only delays new
artworks, it breaks nothing.

## Legal

The collection **metadata** is licensed
[CC0](https://creativecommons.org/publicdomain/zero/1.0/) by The Museum of
Modern Art. The **images** remain under copyright of the artists and estates
and are served from MoMA's own media server; this project hotlinks them for
personal, non-commercial viewing and does not rehost or redistribute the
files.
