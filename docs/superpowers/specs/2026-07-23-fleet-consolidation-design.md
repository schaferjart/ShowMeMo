# Fleet consolidation — design

**Date:** 2026-07-23
**Status:** approved design, pre-implementation

## Goal

Collapse 15 long-lived `distractor/*` branches into one `fleet` branch of
per-site folders, all built on MoMA's advanced display. Reduce 17 branches
(`main`, `hpbda`, 15 distractors) to 3 (`main`, `hpbda`, `fleet`), and make the
whole class of merge-contamination bugs structurally impossible.

## Why (the mess this fixes)

Each museum site currently lives on its own branch. The sites share a
**byte-identical** `app.js` and `style.css` (verified by hash) — only
`index.html` (branding) and `build.mjs` (data source) differ. Because every
branch carries files at the same paths as `main`, a merge silently overwrites
`main`'s version with the branch's. This bit three times in one week:

1. `pages.yml` deploy trigger (hpbda's subfolder deploy clobbered root's).
2. `index.html` footer.
3. `app.js` data path (`../data/` for a subfolder broke the root site).

Folders with distinct paths + a shared app remove the shared-filename collision
entirely.

## Target architecture

### Three branches, three deploy targets

| Branch  | Contents                              | Deploys to                         |
|---------|---------------------------------------|------------------------------------|
| `main`  | MoMA only, unchanged (flagship)       | gh-pages **root**                  |
| `hpbda` | unchanged, standalone (reads MoMA data via `../data/`) | gh-pages **/hpbda/** |
| `fleet` | all 15 sites as folders, shared MoMA app | gh-pages **/<slug>/** subfolders |

MoMA stays on `main` and owns the root deploy. `fleet` is branched *from* `main`
so it inherits MoMA's advanced `app.js`/`style.css` as its base, but it deploys
only the subfolders — it never touches root. `hpbda` is untouched.

### `fleet` branch layout

```
shared/
  app.js               # MoMA's app, ONE line parametrised (download filename)
  style.css            # MoMA's stylesheet, verbatim
  index.template.html  # placeholders: {{TITLE}} {{DESCRIPTION}} {{VIEW_LABEL}}
                       #               {{FOOTER}} {{SLUG}} {{MUSEUM}}
sites/
  cleveland/
    config.json        # { slug, museum, title, description, viewLabel, footer }
    build.mjs          # produces public/data/ from Cleveland's source (unchanged)
  artic/  nga/  mia/  si3d/  walters/  nypl/  smithsonian/  fitzwilliam/
  smk/  nasa/  wellcome/  staedel/  finna/  smb/
  museum/
    index.html         # the fleet index page (static, no build.mjs, no config)
build-site.mjs         # orchestrates: run a site's build.mjs, render template, assemble output
.github/workflows/
  deploy.yml           # matrix over sites/*, replaces pages.yml + build-distractors.yml
  claude.yml  claude-code-review.yml
```

Adding a museum = two files (`config.json` + `build.mjs`). Nothing else.

## Parametrised branding

Each site carries a `config.json`:

```json
{
  "slug": "cleveland",
  "museum": "Cleveland Museum of Art",
  "title": "Distractor: Cleveland",
  "description": "One random CC0 work from the Cleveland Museum of Art.",
  "viewLabel": "View at the Cleveland Museum of Art",
  "footer": "A random work from the Cleveland Museum of Art // J. A. Schafer 2026"
}
```

`build-site.mjs <name>`:
1. Runs `sites/<name>/build.mjs` → `sites/<name>/public/data/`.
2. Renders `shared/index.template.html` with the site's `config.json` values.
3. Copies `shared/app.js` + `shared/style.css` into the output.
4. Emits a deploy-ready folder (`index.html`, `app.js`, `style.css`, `data/`).

Branding is injected at **build time**, so each deployed `index.html` is fully
static — no title flash, no runtime config fetch.

`museum/` is the exception: a hand-written static index page, no `build.mjs`, no
`config.json`; the deploy copies it verbatim.

## PostHog

One PostHog project for the whole fleet + MoMA, segmented by a `site` super
property (decision confirmed with user).

- The init snippet lives in `shared/index.template.html`'s `<head>`, rendered
  once per site. Immediately after `init`, the template calls
  `posthog.register({ site: '{{SLUG}}', museum: '{{MUSEUM}}' })` so every event
  — custom and autocapture — carries which museum it came from.
- The `capture()` calls already in `app.js` (`artwork_viewed`, `_refreshed`,
  `_downloaded`, `_info_opened`, plus a link-click event) stay generic and
  inherit the super properties. All are guarded by `if (window.posthog)`.
- The project token (`phc_zd5U…`) is a publishable client key; inlining it in a
  static site is PostHog's documented approach. No env var (no bundler, no
  runtime env on gh-pages).
- MoMA on `main` already has the snippet (commit `7516c16`) with
  `register({ site: 'moma', museum: 'MoMA' })` — done, separate from this
  migration.

Known limitation: gh-pages cannot reverse-proxy, so `eu.i.posthog.com` is
directly adblockable. Accepted for an art toy.

## The one parametrised line of `app.js`

MoMA's `app.js` hardcodes the download filename `moma-${id}.jpg`. In
`shared/app.js` this becomes `${window.SITE?.slug || 'art'}-${id}.jpg`, where
`window.SITE` is set by the template's inline script (same source as the
PostHog `register` values). That is the **only** MoMA-specific string in the
app; everything else (the external "View at X" link) already comes from each
record's `URL` field.

## Data & build model

- `public/data/` stays gitignored **everywhere**; no built shards are committed
  (drops the fleet's current force-committed data).
- Every site builds fresh in CI. GitHub runners have the open egress the local
  sandbox lacked, so all 15 build — including the 6 that never built locally
  (smk, nasa, wellcome, staedel, finna, smb).

### `deploy.yml`

- Matrix over `sites/*`. Each job: `npm ci` → `node build-site.mjs <name>` →
  publish output into `gh-pages/<slug>/`.
- `max-parallel: 1` on the gh-pages push (jobs share the branch; serialise to
  avoid non-fast-forward races) — same guard as today's `build-distractors.yml`.
- Triggers: push to `fleet` touching `sites/**` or `shared/**`, plus a monthly
  `cron` for data refresh. Path-filtered so a docs change rebuilds nothing.
- Replaces both `pages.yml`-style manual deploys and `build-distractors.yml`.

### Slug mapping (URLs must be preserved)

| Site branch | slug (gh-pages folder) | Currently live? |
|-------------|------------------------|-----------------|
| cleveland   | `cleveland`  | yes |
| artic       | `artic`      | yes |
| nga         | `nga`        | yes |
| mia         | `mia`        | yes |
| **si3d**    | **`3d`**     | yes (slug ≠ branch name) |
| walters     | `walters`    | yes |
| nypl        | `nypl`       | yes |
| smithsonian | `smithsonian`| yes |
| fitzwilliam | `fitzwilliam`| yes |
| smk         | `smk`        | no — first deploy |
| nasa        | `nasa`       | no — first deploy |
| wellcome    | `wellcome`   | no — first deploy |
| staedel     | `staedel`    | no — first deploy |
| finna       | `finna`      | no — first deploy |
| smb         | `smb`        | no — first deploy |

`si3d → 3d` is the only slug that differs from its branch name — its
`config.json` sets `"slug": "3d"`.

## Migration — staged, verifiable, reversible

1. **Assemble `fleet`** off `main`. Lift MoMA's `app.js`/`style.css` into
   `shared/`, parametrise the one download-filename line, write
   `index.template.html`, `build-site.mjs`, `deploy.yml`. Remove the inherited
   MoMA root files that belong to `main`, not the fleet: root `public/` and root
   `build.mjs` (keep `package.json` — the `csv-parse` dep is still needed —
   and repoint `README.md` at the fleet). The `distractor/*` branches are
   untouched at this stage.
2. **Populate `sites/*`** — for each distractor branch, copy its `build.mjs` +
   author a `config.json` from its old `index.html` branding. Reconstruct
   `sites/museum/index.html` from the live gh-pages page.
3. **Verify locally** the 9 egress-free sites: run `build-site.mjs <name>`,
   serve, confirm a work renders with correct branding. Dry-run the matrix.
4. **Archive** — tag every `distractor/*` as `archive/<name>`, push tags.
5. **Push `fleet`**, let `deploy.yml` publish all subfolders. Verify every live
   URL still 200s and renders; verify the 6 new sites build on the CI runners.
6. **Delete** the 15 `distractor/*` branches from origin (history safe in tags).
   *Gated on explicit user go-ahead — steps 1–5 are fully reversible without it.*

## Risks / open items

- **si3d build.mjs** is the most divergent (102 lines) and **smk/nasa/wellcome**
  never built in this sandbox. First real test is the CI matrix in steps 3/5;
  can't fully verify locally.
- **`museum/` index** currently exists only on gh-pages — reconstructing it into
  the repo is new source-of-truth work, not a copy from a branch.
- **Branding drift for `config.json`** — values are transcribed from each old
  `index.html`; a per-site diff of rendered output vs. the live page catches
  mistakes before the branches are deleted (step 3/5).

## Out of scope

- Merging `main`'s MoMA into the fleet's shared app (MoMA genuinely differs; it
  keeps its own `app.js`). If MoMA and the fleet app later converge, that is a
  separate change.
- Any change to `hpbda`.
- Reverse-proxying PostHog.
- The stale inert `pages.yml` on `distractor/smb` — moot once the branch is
  archived and deleted.
