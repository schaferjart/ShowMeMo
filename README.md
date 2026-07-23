# Distractor fleet

The sibling sites to MoMA's Distractor — one random artwork from a museum's open
collection, full screen, almost no interface — one folder per museum, all built
on the same shared app.

Companion branches:

- **`main`** — the MoMA flagship (advanced display), deploys to the site root.
- **`hpbda`** — a personalised MoMA reskin, deploys to `/hpbda/`.
- **`3D`** — Smithsonian's rotatable 3D objects (a different medium), `/3d/`.
- **`fleet`** — this branch: every other museum, one `/slug/` each.

## Layout

```
shared/
  app.js               # the fleet's one app (MoMA's, one line parametrised)
  style.css
  index.template.html  # branding placeholders + PostHog init
sites/
  <slug>/
    config.json        # slug, museum, title, description, viewLabel, footer
    build.mjs          # downloads that museum's data into public/data/ (shards)
  museum/
    index.html         # the static fleet index ("Museum of Possible Museums")
build-site.mjs         # builds one site into dist/<slug>/
```

**Adding a museum is two files:** a `config.json` and a `build.mjs`.

## Build a site locally

```sh
npm ci
node build-site.mjs cleveland     # → dist/cleveland/
python3 -m http.server 8000 -d dist/cleveland
```

`build-site.mjs` runs the site's `build.mjs` (fetching its dataset), renders
`shared/index.template.html` with the site's `config.json`, and drops in the
shared `app.js`/`style.css` — a self-contained folder ready to deploy.

## Deploy

`.github/workflows/deploy.yml` builds every site and publishes each into its own
`gh-pages/<slug>/` subfolder — a matrix job per site, run serially so the pushes
to `gh-pages` can't race, sharing the `pages` concurrency group with the root and
`/hpbda/` deploys. It fires on pushes to `fleet` that touch `sites/**` or
`shared/**`, on a monthly cron (data refresh), and on manual dispatch.

Datasets are never committed (`sites/*/public/data/` and `dist/` are gitignored);
every site builds fresh on GitHub's runners, which reach the sources this repo's
sandbox could not.

## Analytics

One PostHog project for the whole fleet, segmented by a `site` super property.
The init snippet lives in `shared/index.template.html`; each rendered page calls
`posthog.register({ site, museum })`. The project token is a publishable client
key, inlined because this is a static site with no bundler.

## Legal

Each site carries only CC0 / public-domain / openly-licensed **metadata**; images
are hotlinked from each museum's own servers for personal, non-commercial viewing
and are not rehosted. Per-museum specifics live in that site's source and the
`museum/` index.
