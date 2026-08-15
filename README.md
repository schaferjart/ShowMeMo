# Serendipity Machine

A site in the spirit of James Bridle's
[The Distractor](https://distractor.jamesbridle.com/) (2023): one random artwork
from [The Museum of Modern Art's collection dataset](https://github.com/MuseumofModernArt/collection).

- The artwork fills the viewport; the works you saw before remain beneath it, neatly piled — straight, slightly offset, dimmed — growing as you browse.
- The refresh button (or `Space` / `R`) loads another random work.
- The download button saves the image.
- Title, artist, and year are always visible at the bottom; clicking them reveals medium, credit line, and a link to the work at MoMA (the `×`, `Esc`, or `I` closes it again).
- `?id=<ObjectID>` permalinks to a specific work; the URL always reflects the
- `?onview=1` restricts the random picks to works currently on view at MoMA.
- Connect it to your browser and let every new tab be a pretty. 
- `A` (or the wall button) opens **the wall** — the same machine, but the unit
  of chance is an artist and the screen fills with their work.

## The wall — `artist.html`

One random *artist* at a time, hung across the whole viewport. Same
serendipity, one level up: `Space` / `R` draws another artist, and
`?artist=<ConstituentID>` permalinks to anybody in the collection
(`https://www.moma.org/artists/3110` → `artist.html?artist=3110`).

- **The hang fills the screen exactly** — rows of works at their true
  proportions, no scrolling, no leftover background. `hang.js` explains the
  arithmetic; the short version is that it searches how many works to show, how
  many rows to deal them into and how wide the gaps are, then takes whichever
  combination distorts the works least. It usually lands on a hang that fills
  the viewport without cropping anything at all.
- **The screen decides how much you see.** A phone gets about eight works, a
  27-inch display about thirty — bigger screens show more work *and* bigger
  work. `+` and `−` argue with that; rotating the phone or dragging the window
  re-solves the wall for the shape it now has.
- **The wall settles.** The first hang is computed from the catalogue's
  centimetres, which describe the object rather than the photograph of it. As
  the pictures arrive and report what shape they actually are, the wall hangs
  itself again and the works move into place.
- **Three hangs**: salon (by chance), chronological (first work to last, spread
  across the whole career however few fit), and by shape. The wall opens on the
  salon hang; clicking its name in the details panel moves to the next one and
  rehangs.
- **It drifts.** Left alone, one work at a time swaps itself out for another of
  the same proportions, so a wall open on a second screen is never quite the
  same wall. The composition never moves; only the pictures do. Off with the
  toggle in the details panel, and off by default under `prefers-reduced-motion`.
- Click any work to see it whole (`←` / `→` to walk along the wall, `Esc` to go
  back). `/` finds an artist by name. `I` opens the details.
- `?deep=1` picks evenly from every artist with more than one work instead of
  leaning towards substantial bodies of work.

## Install to Brave (Chromium)

The dropdown doesn't offer "custom URL" directly, but there's a workaround: The "Homepage" trick

1. Go to Settings → Appearance
2. Enable "Show home button"
3. Select the custom URL field and paste your URL
4. In "New tab page shows" → select "Homepage"

## How it works

`build.mjs` downloads MoMA's `Artworks.csv` (~160,000 records, Git LFS), keeps the ~half that have an image URL, and shards them into small JSON files by `ObjectID % shardCount`.
Because the shard for any ObjectID is computable, permalinks resolve with no
index file. Per pageview the client fetches only `meta.json`, one shard
(< 50 KB), and one JPEG hotlinked from MoMA's media server.

The same pass joins `Artists.csv` and shards the collection a second time, by
`ConstituentID % shardCount`, into `data/artists/`. A whole artist therefore
arrives in one request, and the wall costs the same two JSON fetches as a
single work does. Three things make that affordable:

- Every MoMA image URL is the same signed template with one file id swapped in,
  so an artist shard stores the id and its signature (~24 bytes) instead of the
  150-byte URL. The build verifies each reconstruction and falls back to storing
  the URL whole if MoMA ever changes the template.
- A shard carries at most 120 works per artist, sampled to span the oeuvre.
  Louise Bourgeois's other 2,900 wait in `data/artists/works/<id>.json`, which
  the wall fetches in the background only for the artists that need it.
- Picking a random artist has to be fair without downloading an index of
  11,686 of them, so `data/artists/meta.json` carries per-shard totals: pick a
  shard in proportion to the weight it holds, then an artist inside it.
  Weighting by the square root of an artist's holdings leans towards
  substantial bodies of work without silencing the long tail.

Random picks are limited to artists with eight or more imaged works — anyone
with fewer has too little to hang. Permalinks ignore that: `?artist=` reaches
every artist in the collection, however few works they left.

## Build

Requires Node 18+.

```sh
npm install
npm run build
```

This downloads the CSVs (it takes a minute) and writes `public/data/shard-<n>.json`
and `public/data/meta.json` for the single-work machine, plus
`public/data/artists/` for the wall, printing the final counts. Re-run it any
time to refresh the dataset. MoMA updates the source repository regularly.

Set `MOMA_CSV_DIR` to a directory holding `Artworks.csv` and `Artists.csv` to
build from local copies instead of re-downloading 70 MB on every run.

## Run locally

Serve the `public/` folder with any static file server:

```sh
python3 -m http.server 8000 -d public
```

## Deploy

### GitHub Pages

`.github/workflows/pages.yml` builds the dataset and publishes `public/` to the
**root** of the `gh-pages` branch on every push to `main`, leaving the sibling
Serendipity Machines' subfolders in place. The site is served at
<https://schaferjart.github.io/ShowMeMo/>. To refresh the dataset, re-run the
workflow from the Actions tab (`workflow_dispatch`).

`gh-pages` is a shared tree: the root is this site, and each sibling Serendipity
Machine owns one subfolder (`/cleveland/`, `/artic/`, `/3d/`, `/hpbda/`, ...). Two rules
keep that from breaking:

- **One deploy target per workflow file.** A branch needing its own deploy adds
  a new filename (`deploy-hpbda.yml`), never a second copy of `pages.yml` —
  otherwise merging that branch overwrites this workflow's trigger.
- **No deploy step wipes what it does not own.** The root deploy deletes only
  top-level files and `data/`; subfolder deploys touch only their subfolder.

The sibling Serendipity Machines live on the `fleet` branch (one folder per
museum) and deploy themselves via that branch's `deploy.yml`; `hpbda` and the
`3D` site deploy from their own branches. This root only publishes MoMA.

### Docker / Coolify

The `Dockerfile` is a two-stage build: a Node stage runs `build.mjs` (so the
image always ships a fresh dataset), then `nginx:alpine` serves `public/` with
long cache headers for `/data/` and static assets, and no caching for
`index.html`.

```sh
docker build -t serendipity-machine .
docker run -p 8080:80 serendipity-machine
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
