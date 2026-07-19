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

`.github/workflows/pages.yml` builds the dataset and force-pushes `public/`
as a single orphan commit to the `gh-pages` branch on every push to `main`.
The site is served at <https://schaferjart.github.io/ShowMeMo/>. To refresh
the dataset, re-run the workflow from the Actions tab (`workflow_dispatch`).

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
