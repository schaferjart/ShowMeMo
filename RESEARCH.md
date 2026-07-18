# Database options for new Distractors

Research into open datasets that could power sibling sites to Distractor: MoMA,
verified July 2026.

## What the current build needs from a dataset

`build.mjs` works because MoMA's dataset has three properties. Any replacement
needs the same three:

1. **Bulk-downloadable metadata** — a CSV/JSON dump (GitHub, S3, data package)
   or, second best, a free keyless API that can be paged through at build time.
2. **Direct image URLs** — either stored in the records or derivable from a
   field (e.g. an IIIF pattern from an `image_id`), and hotlinkable from a
   browser.
3. **Open license** — CC0/public-domain metadata; images public domain or at
   least free for non-commercial display with credit.

Everything below is sorted by how well it meets those three.

---

## Tier 1 — drop-in fits (bulk dump + image URLs + CC0, no key)

### Art

| Dataset | Size (with images) | Data access | Images | Notes |
|---|---|---|---|---|
| **Cleveland Museum of Art** | ~61k records, ~30–37k w/ images | [GitHub `data.csv`/`data.json`](https://github.com/ClevelandMuseumArt/openaccess) (Git LFS, like MoMA) | Direct URLs **in the dump** (web/print/full renditions) | CC0 metadata; per-record `share_license_status` flags CC0 images. **Lowest-friction option — nearly a find-and-replace on `build.mjs`.** |
| **Art Institute of Chicago** | ~120k+ artworks | [GitHub api-data](https://github.com/art-institute-of-chicago/api-data) → full `allArtworks.jsonl` tar.bz2 on S3 (~115 MB), refreshed monthly | Build IIIF URL from `image_id`: `https://www.artic.edu/iiif/2/{image_id}/full/843,/0/default.jpg` | CC0-equivalent; filter `is_public_domain: true`. Deterministic image URLs are perfect for shards. |
| **National Gallery of Art (Washington)** | 130k+ objects, ~50k+ open images | [GitHub opendata](https://github.com/NationalGalleryOfArt/opendata) CSVs, updated ~daily | IIIF/thumb URLs in `published_images.csv`, join on object ID | CC0. One join step at build time; includes Wikidata IDs. |
| **Minneapolis Institute of Art** | ~90k+ objects | [GitHub artsmia/collection](https://github.com/artsmia/collection), one JSON per object, daily commits — clone at build time | Predictable: `https://api.artsmia.org/images/{id}/large.jpg` (800px) | CC0 data; filter `restricted: 0`. Image-use language leans non-commercial — fine for this project. |

### Architecture & other domains

| Dataset | Content | Data access | Images | Notes |
|---|---|---|---|---|
| **Library of Congress — HABS/HAER/HALS** | Historic American Buildings Survey: measured drawings + large-format photos of US buildings, bridges, landscapes; ~40k+ sites, hundreds of thousands of images | Keyless JSON API: [`loc.gov/collections/historic-american-buildings-landscapes-and-engineering-records/?fo=json`](https://www.loc.gov/collections/historic-american-buildings-landscapes-and-engineering-records/?fo=json), paginate with `sp=`; throttle (~3s between requests, segment by facet past 100k items) | `image_url` array per record + IIIF on `tile.loc.gov`; hotlinkable, but tile.loc.gov has bot protection — safer to harvest URLs at build and consider mirroring | US-government documentation → public domain. **Top architecture pick.** |
| **LoC Sanborn Fire Insurance Maps** | ~50k atlases / 440k gorgeous colored urban map sheets | **Pre-built CSV *and* JSON data package**: [data.labs.loc.gov/sanborn](https://data.labs.loc.gov/sanborn/) (also on [AWS Open Data](https://registry.opendata.aws/loc-sanborn-maps/)) | IIIF + direct download URLs in records | Public domain. The prebuilt package is exactly the MoMA-CSV workflow. |
| **NASA Image and Video Library** | 100k+ curated NASA photos | Keyless: `https://images-api.nasa.gov/search?q=...&media_type=image&page_size=100` | Direct `images-assets.nasa.gov` URLs via `/asset/{nasa_id}` — S3-backed, hotlink-friendly | Public domain (watch rare third-party items). |
| **Wellcome Collection** | Millions of medical/anatomical/botanical/scientific illustrations | Keyless modern JSON API: `https://api.wellcomecollection.org/catalogue/v2/works?include=items&pageSize=100`; full IIIF | IIIF at `iiif.wellcomecollection.org`, hotlinkable | Per-item license field — filter `license=cc0\|pdm` in the query. Arguably the easiest keyless API on this list. |
| **Wikidata + Wikimedia Commons** | Effectively infinite; the strongest "architecture with structured captions" source (building, architect, year, coordinates) | SPARQL at build time: `https://query.wikidata.org/sparql?format=json` (e.g. buildings with image P18); chunk queries by country/type, 60s timeout | Hotlinking `upload.wikimedia.org` is explicitly allowed; robust pattern: `https://commons.wikimedia.org/wiki/Special:FilePath/{File}?width=1200` (survives renames) | Per-file license (mostly CC-BY-SA/CC-BY/PD) — capture author + license into the caption. |
| **Internet Archive (vetted PD collections)** | Posters, book plates, photos — e.g. WPA posters, **USDA Pomological Watercolors** (~7.5k public-domain fruit watercolors, a delightful tightly-scoped shard) | Keyless bulk scrape API: `https://archive.org/services/search/v1/scrape?q=collection:X&count=1000&cursor=...` | `https://archive.org/services/img/{id}` thumbs; `https://archive.org/download/{id}/{file}` full — hotlinkable but slow | License is per collection — build shards only from vetted PD collections. |

## Tier 2 — usable with caveats

- **The Met** — 470k+ records, [`MetObjects.csv` on GitHub](https://github.com/metmuseum/openaccess) (Git LFS), CC0, `Is Public Domain` flag. Catch: **image URLs are not in the CSV**; each must be fetched from the free keyless API (`collectionapi.metmuseum.org/.../objects/{id}` → `primaryImage`). Feasible as a one-time enrichment crawl whose output gets committed, but it's hundreds of thousands of calls.
- **Rijksmuseum** — full collection via [data.rijksmuseum.nl](https://data.rijksmuseum.nl/) data dumps + **keyless IIIF images**; CC0/PD "wherever possible." Best non-US art option, but linked-data formats mean more build plumbing than a CSV, and OAI-PMH harvesting still needs a free key.
- **Victoria & Albert Museum** — keyless API v2 with CSV export and IIIF images (`framemark.vam.ac.uk`), but no bulk dump (page the API) and **not CC0** — V&A terms, non-commercial with attribution.
- **Smithsonian Open Access** — ~5M CC0 records with media across 19 museums. The **GitHub repo was archived May 2026**; use the S3 bulk data instead ([registry.opendata.aws/smithsonian-open-access](https://registry.opendata.aws/smithsonian-open-access/)). Huge but heterogeneous — heavy filtering needed to isolate artworks with images.
- **Biodiversity Heritage Library** — 300k+ pre-1923 natural-history illustrations, mostly PD. Bulk metadata + page images on [AWS Open Data](https://registry.opendata.aws/bhl-open-data/); page images at `biodiversitylibrary.org/pageimage/{pageID}`. Caveat: metadata is page/book-level, so surfacing *good illustration pages* takes curation (their ~320k-image Flickr set is the pre-curated shortcut, but Flickr harvesting needs a key).
- **NYPL Digital Collections** — the [NYPL-publicdomain GitHub dump](https://github.com/NYPL-publicdomain/data-and-utilities) has ~190k CC0 items as flat CSV/JSON with `images.nypl.org` URLs, no key — but it's a frozen 2016 snapshot; the live API needs a (free) token.
- **RCE Beeldbank (Netherlands)** — ~750k–1M photos of Dutch monuments, CC-BY-SA 4.0, keyless OAI-PMH harvest ([opendata.picturae.com](https://opendata.picturae.com/dataset/rce_oai_webservice)). Best European architecture source; XML harvesting is extra tooling.
- **Walters Art Museum** — ~10k CC0 records with image URLs in static CSVs ([GitHub](https://github.com/WaltersArtMuseum/api-thewalters-org)); fine as a small add-on, but the API is dead and the files are a frozen snapshot.
- **Europeana** — 50M+ EU records incl. architecture; free self-service key since 2025; filter `reusability:open`. Images live on hundreds of provider servers, so hotlinking is flaky — use their thumbnail proxy or mirror.
- **NASA APOD** — great essayistic captions; needs a free key and you must drop items with a `copyright` field (astrophotographers' work). The main NASA Images API is the better default.
- **David Rumsey Map Collection** — 150k+ superb historical maps via IIIF, but CC-BY-**NC** and no sanctioned bulk dump. Prefer LoC maps.
- **Openverse / DPLA** — aggregators with bulk access, but image URLs point at scattered third-party hosts (link rot, tiny thumbs). Go straight to the underlying sources instead.

## Dead ends — do not build on these

- **Carnegie Museum of Art** — the famous CC0 dump repo (`github.com/cmoa/collection`) has been **deleted**; only unofficial Kaggle mirrors remain.
- **Tate** — [`tategallery/collection`](https://github.com/tategallery/collection) frozen since **2014**, explicitly won't resume, and contains **no image URLs**; Tate images require paid licensing.
- **Cooper Hewitt** — GitHub dump last touched **2017**, no image URLs. (Its objects are inside Smithsonian Open Access anyway.)
- **Harvard Art Museums** — key required, non-commercial, 2,500 calls/day, and terms **forbid caching content longer than two weeks** — directly incompatible with baked static shards.
- **Canmore (Scotland)** — switched off June 2025; successor trove.scot requires per-use image licensing.
- **Historic England Archive** — listing *data* is open, but the photographs are a paid licensing service.
- **Cover Art Archive / ArchDaily / editorial sites** — in-copyright imagery.

## Recommendations

Ranked by effort-to-payoff for a sibling Distractor:

1. **Cleveland Museum of Art** — image URLs are already in a single CSV/JSON dump; closest to a find-and-replace on the current `build.mjs`.
2. **Art Institute of Chicago** — JSONL dump + deterministic IIIF URLs; monthly auto-refresh.
3. **LoC Sanborn maps** *(non-art)* — prebuilt CSV/JSON package, public domain, visually striking.
4. **LoC HABS/HAER** *(architecture)* — keyless JSON API, public domain, rich captions; needs polite throttled harvesting at build time.
5. **NASA Images** or **Wellcome** — keyless APIs with hotlinkable images for space and medical/scientific illustration flavors.
6. **Wikidata → Commons** — the general-purpose engine if a future Distractor needs any theme (bridges, brutalism, lighthouses…) with structured captions.

A note on verification: dataset locations and rate limits above were verified
against official docs and repos in July 2026, but a smoke test of the top
pick's download + image URLs is worth doing before committing to a build.
