# Database options for new Distractors

Research into open datasets that could power sibling sites to Distractor: MoMA,
verified July 2026.

> **Now on view** — five of these datasets are no longer hypothetical; working
> Distractors are deployed from their own branches:
> [Cleveland](https://schaferjart.github.io/ShowMeMo/cleveland/) (`distractor/cleveland`) ·
> [Chicago](https://schaferjart.github.io/ShowMeMo/artic/) (`distractor/artic`) ·
> [Washington](https://schaferjart.github.io/ShowMeMo/nga/) (`distractor/nga`) ·
> [Minneapolis](https://schaferjart.github.io/ShowMeMo/mia/) (`distractor/mia`) ·
> [Smithsonian 3D](https://schaferjart.github.io/ShowMeMo/3d/) (`distractor/si3d`) ·
> [Baltimore/Walters](https://schaferjart.github.io/ShowMeMo/walters/) (`distractor/walters`) ·
> [NYPL](https://schaferjart.github.io/ShowMeMo/nypl/) (`distractor/nypl`) ·
> [Smithsonian 2D](https://schaferjart.github.io/ShowMeMo/smithsonian/) (`distractor/smithsonian`).
> Three more — **SMK** (`distractor/smk`), **NASA** (`distractor/nasa`), and
> **Wellcome** (`distractor/wellcome`) — ship complete build scripts but their
> APIs are unreachable from this sandbox; the `build-distractors` GitHub
> Actions workflow (see the PR from `claude/build-distractors-workflow`)
> builds them on GitHub's runners and deploys `/smk/`, `/nasa/`,
> `/wellcome/`. Paris Musées still needs a self-service account token.
>
> The European wing has since grown: **Fitzwilliam/Cambridge is live**
> ([site](https://schaferjart.github.io/ShowMeMo/fitzwilliam/),
> `distractor/fitzwilliam`, built from the museum's CC0 GitHub dump — the
> live API is now auth-gated), and **Städel** (`distractor/staedel`),
> **Finna** (`distractor/finna`) and **SMB Berlin** (`distractor/smb`) join
> SMK/NASA/Wellcome in the CI workflow matrix.
>
> **Migros Museum für Gegenwartskunst (Zürich), verified:** ~1,300 works
> online as plain web pages (MuseumPlus-backed), no API or open data, and a
> contemporary collection that is almost entirely in copyright; the
> "library" is a shop of printed exhibition catalogues, not a digitized
> archive. Label-only — nothing buildable.

> Prefer to wander? The same research hangs as an exhibition in
> [`research.html`](research.html) — *The Museum of Possible Museums* — every
> dataset as a wall label, sorted into rooms, with a Space/R shuffle like the
> Distractor itself. Open it in any browser; this file remains the catalogue
> of record with full details and sources.

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
- **Smithsonian Open Access** — ~5M CC0 records with media across 19 museums. The **GitHub repo was archived May 2026**; use the S3 bulk data instead ([registry.opendata.aws/smithsonian-open-access](https://registry.opendata.aws/smithsonian-open-access/)). Huge but heterogeneous — heavy filtering needed to isolate artworks with images. **The same bucket also holds the open-access 3D models — see the 3D section below.**
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

## 3D objects — Distractor in three dimensions

Extending the idea from a random *image* to a random *3D object* is viable, and
one source stands far above the rest.

### Smithsonian Open Access 3D — the clear winner (live-verified)

The Smithsonian's 3D digitization program mirrors its open-access models into a
**public, anonymously listable, CORS-enabled S3 bucket** — which means the
whole MoMA pattern transfers almost unchanged:

- **Enumerate at build time, no key:**
  `https://smithsonian-open-access.s3.us-west-2.amazonaws.com/?list-type=2&delimiter=/&prefix=3d/&max-keys=1000`
  (follow `NextContinuationToken`). Currently **~2,360 3D packages** under
  `3d/<uuid>/`.
- **Per package:** multiple GLB levels of detail (`-1024-low.glb` ≈ 1.1 MB,
  `-2048-medium.glb` ≈ 1.9 MB, `-4096-high.glb` larger; Draco-compressed),
  plus OBJ/PLY/FBX, poster thumbnails (`scene-image-thumb/low/...jpg`), and a
  `scene.svx.json` carrying title and `edanRecordId` for captions.
- **Hotlinkable in the browser:** GLBs return
  `Access-Control-Allow-Origin: *`, so Google's `<model-viewer>` web component
  (one ESM file, orbit controls, on-the-fly USDZ for iOS AR) loads them
  cross-origin from a purely static page — no server, no proxy.
- **License:** the open-access set is CC0. Caveat for the crawler: confirm
  per-record CC0 status via the EDAN record (free api.data.gov key, build time
  only) so frozen shards contain only confirmed-CC0 objects.
- **Bandwidth:** ~1–2 MB per object at low/medium LOD — roughly 10× a JPEG but
  fine for one object per pageview; show the poster JPEG first and use the
  `-low` GLB.

Build shape: crawl the bucket once → record `{uuid, glb_url, poster_url,
title, edanRecordId}` per package → shard to static JSON → client random-picks
→ `<model-viewer>`. (The 2D Smithsonian open-access metadata lives in the same
bucket under `metadata/edan/` — see Tier 2 above.)

### Other 3D sources, briefly

- **Three D Scans (threedscans.com, Oliver Laric)** — ~150+ superb museum
  sculpture scans, explicitly no copyright restrictions. But STL/OBJ only (no
  GLB) and no API — you'd convert and self-host. Nice curated supplement.
- **Sketchfab museum accounts** — avoid for a durable build: Epic is folding
  Sketchfab into Fab, CC0/CC-BY-SA/NC/ND licenses don't exist on Fab, affected
  models lose their downloads, and the download API's future is explicitly
  temporary. Use the Smithsonian's own bucket rather than SI-on-Sketchfab.
- **Scan the World (MyMiniFactory)** — 2,000+ CC/CC0 community scans, but
  auth-gated STL downloads and uneven quality. Marginal.
- **MorphoSource** — ~13k open-access biological specimens (fossils, bones,
  CT); real REST API but gated downloads and a narrow aesthetic. Niche.
- **British Museum on Sketchfab / Zamani Project** — skip: NC licensing +
  Sketchfab wind-down; Zamani is request-only access.

## ETH Zürich collections

ETH-Bibliothek has a genuine open-data program; the catch is plumbing, not
licensing.

- **E-Pics Bildarchiv** (`ba.e-pics.ethz.ch`) — crossed **1 million digitized
  images** in Nov 2024: Swissair aerial photography, Comet Photo press archive,
  Luftbild Schweiz, science/ETH history, portraits. Open data since 2015:
  Public Domain Mark or CC BY-SA 4.0, ~93% freely downloadable at highest
  resolution. **Weak point:** no public OAI-PMH/IIIF for E-Pics itself — bulk
  metadata needs the ETH Library Developer Portal Discovery API (free
  registration key), and the Canto-CDN image URLs are only medium-stability.
- **The practical route: Wikimedia Commons mirror** —
  [Category:Media contributed by the ETH-Bibliothek](https://commons.wikimedia.org/wiki/Category:Media_contributed_by_the_ETH-Bibliothek),
  ~60k files directly (134k+ targeted in the upload cooperation), PD and
  CC BY-SA only, machine-readable license per file, keyless bulk API, and the
  same hotlink-friendly `upload.wikimedia.org`/`Special:FilePath` URLs as any
  Commons source. **One category harvest gives a ready shard set.**
- **e-rara.ch** — 100k+ digitized rare prints/maps/books (15th–19th c.,
  ETH-Bibliothek operated). Keyless **OAI-PMH** (`e-rara.ch/oai`) + full
  **IIIF** image API; public domain. Excellent fit — caveat is that records
  are book *pages*, so mine it for plates, maps, and title pages.
- **e-manuscripta.ch** — same stack (OAI-PMH + IIIF), mostly public-domain
  manuscripts/drawings/maps; good but visually niche.
- **Graphische Sammlung ETH** — ~160k prints and drawings, ~61k records online,
  but the eMuseumPlus catalogue has no API/IIIF/dump. Skip for now; some works
  surface via the Commons category above.
- **Thomas-Mann-Archiv** — 2,000+ copyright-free photographs on the E-Pics
  stack, and Mann's works entered the public domain on 1 Jan 2026 with the
  archive publishing openly since — a charming niche add-on.
- **Not usable:** ETH Research Collection (publications, not imagery) and ETH
  computer-vision datasets like ScanNet (signed non-commercial research
  agreements only).

## Europe — museum by museum

A dedicated sweep of European institutions (verified July 2026). The pattern
that emerges: the famous flagship museums (Louvre, Prado, Uffizi, British
Museum, Vatican Museums, KHM Wien) are mostly *closed* — no bulk data, no open
images — while national galleries and city museums in Denmark, Paris, Frankfurt,
Berlin, and Vienna are genuinely open. For the closed flagships, Wikimedia
Commons is the de-facto open channel for their public-domain works.

### The European stars

| Dataset | Content | Data access | Images | License |
|---|---|---|---|---|
| **SMK — Statens Museum for Kunst (Denmark)** | 88k+ works, ~40k with images — Denmark's national gallery | Keyless JSON API: `https://api.smk.dk/api/v1/art/search/?keys=*&rows=1000` + offset paging (full crawl ≈ 90 requests); filters like `[has_image:true],[public_domain:true]` | `image_native` direct JPEG per record **plus** IIIF — hotlinkable | **CC0** for reproductions of PD works; per-record `public_domain` flag. **Best in Europe — MoMA-grade ergonomics.** |
| **Paris Musées Open Content** | ~150k HD reproductions across the 14 City of Paris museums (Carnavalet, Petit Palais, Musée d'Art Moderne…) | GraphQL API at `apicollections.parismusees.paris.fr`; token is **free and self-service** (create account → generate token); the API is the bulk channel | Direct URLs, several sizes + HD, hotlinkable | **CC0** for PD works. Anchor dataset for France. |
| **Städel Museum (Frankfurt)** | 22k+ public-domain works with downloadable images | Keyless **OAI-PMH**: `https://sammlung.staedelmuseum.de/api/oai` (Dublin Core or LIDO) — fully harvestable | Direct CDN URLs referenced in records | Metadata **CC0**; images of PD works CC BY-SA 4.0 (credit "Städel Museum"). Cleanest German single-museum source. |
| **Staatliche Museen zu Berlin** | ~270k records across 19 collections | Keyless JSON: `https://api.smb.museum/search/` (+ GraphQL); public-but-undocumented — pin queries | Deterministic hotlinks: `https://recherche.smb.museum/images/{asset_id}_4000x4000.jpg` | CC BY-SA 4.0 / PDM subset, per-record license field. |
| **Wien Museum** | 134k records / 210k images of Vienna city history and art | The catch: MuseumPlus-backed site with an *undocumented* JSON backend — probe it or harvest via their Wikimedia Commons uploads; a CSV dataset has appeared on data.gv.at | High-res CC0 downloads for PD works | **CC0 including commercial use** — the best-licensed Austrian source; perfect licenses, weakest pipe of this table. |
| **Biblioteca Digital Hispánica (BNE, Spain)** | 200k+ digitized PD items — books, drawings, engravings, maps, photos | Keyless: BNElab bulk datasets (`bnelab.bne.es`), IIIF, SPARQL at datos.bne.es | IIIF, hotlinkable | Images of PD works **CC BY 4.0** (credit BNE), commercial included. |
| **BnF Gallica (France)** | ~10M digitized documents, mostly PD | Keyless IIIF + SRU search + OAI-PMH — best-in-class infrastructure | IIIF hotlinking, any size | PD works, but BnF terms: free **non-commercial** reuse with credit; commercial use of the scans is fee-licensed. |
| **Science Museum Group (UK)** | 500k+ objects of science/industry/design | Keyless JSON:API **plus prebuilt CSV exports of records with CC images** at `coimages.sciencemuseumgroup.org.uk/datasets/` — the MoMA workflow ready-made | Hotlinkable | Metadata CC0/CC-BY; images **CC BY-NC-SA** (flag non-commercial). |
| **Finna.fi (Finland)** | Millions of records from Finnish museums/archives | Keyless REST API (`api.finna.fi/v1/search`), CORS open, CC0 metadata; filter the usage-rights facet to free-use + has-image | Service-style URLs, hotlinkable | Per-record; CC0/PD subset filterable. |
| **Museo Egizio (Turin)** | ~3k objects + ~5.5k images — Italy's one true open-access museum | Via its Wikimedia Commons category / Wikidata (formal cooperation) — keyless bulk API | `upload.wikimedia.org`, hotlink-friendly | **CC0**. |

### Usable with caveats

- **DigitaltMuseum / KulturIT (Norway + Sweden)** — 4M+ objects from hundreds of museums, clean hotlink pattern `https://dms01.dimu.org/image/{id}?dimension=max`; needs a free API key from KulturIT and per-item license filtering. Also currently the *only* route to **Nasjonalmuseet Norway** (its own API v1 was retired January 2025; metadata CC0, photos CC BY 4.0).
- **Nationalmuseum Sweden** — ~3k hand-picked PD paintings on Wikimedia Commons with a companion TSV on GitHub: a zero-risk static bonus. Full-collection access runs through the K-samsök aggregator, which is being replaced end of 2026 — don't build a rebuild pipeline on it.
- **DigiVatLib (Vatican Apostolic Library)** — ~25k+ fully digitized manuscripts with first-class IIIF (`digi.vatlib.it/iiif/MSS_{shelfmark}/manifest.json`); no dump, but shelfmark lists and Biblissima's aggregation are harvestable. **CC BY-NC** — non-commercial only, flag prominently. The closest thing to "the Vatican" that's actually open.
- **Deutsche Digitale Bibliothek** — ~50M-record German aggregator, free self-service API key, per-record license facet; but images are heterogeneous (small DDB previews vs. provider-hosted originals of varying reliability).
- **MDZ / Bayerische Staatsbibliothek** — ~3.2M items over keyless IIIF at massive scale, mostly Public Domain Mark; content is books/manuscripts/maps, so best as a supplement (illuminated manuscripts, prints).
- **Bodleian (Oxford)** — excellent keyless IIIF + JSON data API; images mostly **CC BY-NC**.
- **Fitzwilliam (Cambridge)** — ~267k objects, keyless paged JSON API, CC0 metadata, direct JPEGs; images are per-record and lean CC BY-NC-ND — displayable verbatim with credit (which is all a Distractor does), but check the rights field.
- **Museum Data Service (museumdata.uk)** — new UK aggregator (launched Sept 2024, ~3M records from 21 museums, targeting 100M); free API tokens, per-museum licensing, uneven image coverage. Watchlist rather than build target.
- **British Library** — its own data services are still crippled by the October 2023 ransomware attack (metadata not restored as of 2026); but the **~1.07M public-domain "Mechanical Curator" book illustrations on Flickr Commons** are stable and hotlinkable (Flickr API key needed to harvest).
- **Natural History Museum London** — best-in-class open data (keyless CKAN API, CC0 data, CC BY images, 5M+ records) — specimens rather than artworks, but a great fit if the concept stretches to natural history.
- **Belvedere (Vienna)** and **Kunstmuseum Basel** — genuine open-content policies (CC BY-SA / PD images, IIIF behind the viewers) but no documented bulk API; endpoint spelunking or the Wikimedia Commons route required.
- **POP / Joconde (France)** — 600k+ records of French museum holdings as open CSV on data.gouv.fr, but the *images* are mostly rights-reserved: metadata-only, join to Wikimedia for pictures.
- **ICCD Catalogo (Italy)** — millions of heritage records via keyless SPARQL (`dati.beniculturali.it/sparql`), metadata CC BY-SA; images CC BY-**NC** and patchy.
- **Albertina (Vienna)** — ~200k objects online but no API/bulk/IIIF; reach it via Europeana.

### Closed flagships — use Wikimedia Commons instead

No bulk data and/or no open images as of 2026: **Louvre** (per-object JSON exists but no enumeration; images restricted to private/educational use), **Musée d'Orsay**, **Centre Pompidou** (modern art = in-copyright, structurally closed), **Vatican Museums** (browse-only catalogue, no API), **Uffizi** (browse-only, fee-based reproduction regime), **Prado** (commercial image bank), **British Museum** (no API or dump, CC BY-NC-SA, SPARQL endpoint long-unreliable), **National Portrait Gallery London** (no API, restrictive), **KHM Wien** (non-commercial only, no API), **National Gallery London** (CC0 data but CC BY-NC-ND images and a still-unstable API transition). Public-domain works from all of these are abundantly available on **Wikimedia Commons** via third-party photography — the Wikidata→Commons pipeline from Tier 1 is the practical way to build "a random Louvre/Prado painting" site.

## Architecture — dedicated archives

Beyond LoC HABS, Sanborn, RCE, and the Wikidata route (Tier 1 above), a sweep
of the specialist architecture museums and archives (verified July 2026). The
sobering pattern: most *dedicated* architecture institutions — RIBA, CCA
Montreal, TU München, Cité de l'architecture, Az W Wien, and the architect
foundations (Le Corbusier, Frank Lloyd Wright, Aalto, Bauhaus-Archiv) — are
closed: image licensing is commercial or on-request, and 20th-century
architects' estates keep copyright in force (Corbusier until 2036). What *is*
open:

### Ship-ready

- **Architekturmuseum der TU Berlin** — **the best find**: ~163k catalogued
  works, of which **~92k are downloadable 3000px JPGs under Public Domain
  Mark** (creators dead >70 years; Schinkel-era Berlin especially strong).
  Search results export as **CSV**, per-object LIDO XML, no key. Essentially
  the MoMA workflow for architectural drawings. (Verify the CSV export
  parameters and image URL pattern by hand — the site blocked this sandbox's
  proxy; fallback: the same objects flow into Deutsche Fotothek/DDB.)
- **Deutsche Fotothek (SLUB Dresden)** — ~2.5M images online with vast
  architecture photography, plus a dedicated **architectural & engineering
  drawings portal (~108k sheets** aggregating SLUB, TU Berlin, TU München,
  Mecklenburg). Keyless OAI-PMH (`digital.slub-dresden.de/oai`); licenses are
  per-record (PDM / CC BY-SA / rights-reserved) so filter on the rights field;
  the ~250k images donated to Wikimedia Commons (`Fotothek df_*`, CC BY-SA)
  are the lowest-friction subset.
- **Nasjonalmuseet Norway's architecture collection (NMK-A)** via the
  DigitaltMuseum API — Sverre Fehn et al.; CC0 metadata, CC BY photo files,
  stable resizable image URLs; needs the free KulturIT key (see Europe
  section).
- **Getty — Julius Shulman Photography Archive** — 48k+ digitized high-res
  photos of mid-century modern architecture; Getty holds the copyright and
  explicitly allows free download and publication with credit; IIIF-served.
  No tidy dump — budget a one-time catalogue scrape.
- **Stadsarchief Amsterdam Beeldbank** — ~500k photos, prints, and
  **construction drawings** of Amsterdam; keyless OpenSearch API (registered
  open dataset), high-res downloads, free reuse with credit. City-scoped but
  squarely on-topic.
- **K-samsök / Bebyggelseregistret (Sweden)** — buildings-register and county
  museum photography via the free aggregator API; CC0 metadata, per-record CC
  image licenses (but note the platform is being replaced end of 2026 — see
  Europe section).

### Needs a spike first

- **Het Nieuwe Instituut (Rotterdam)** — the ~4M-item Dutch national
  architecture collection now has a Linked Open Data platform + SPARQL
  endpoint (`collectiedata.hetnieuweinstituut.nl`), metadata open — but image
  availability and licensing are per-object and unconfirmed. Prototype a
  SPARQL query filtering for openly licensed reproductions before committing.
- **Royal Danish Library — Samlingen af Arkitekturtegninger** — ~300k Danish
  architectural drawings, keyless API + OAI-PMH (`api.kb.dk`), but rights are
  per-record, not blanket-open. Its "Danmark set fra luften" aerial-photo API
  (free with credit) is a safe adjacent win.

### Flagged closed (verified)

**RIBApix** (rights-managed, paid publication licenses), **CCA Montreal**
(fee-based reproductions, no API), **Architekturmuseum TU München** (CC
BY-NC-ND *plus* written-permission clause — metadata harvestable via OAI-PMH,
images unusable; its PD sheets surface in Deutsche Fotothek instead), **Cité
de l'architecture**, **Az W Wien** (prepaid reproduction fees), **Fondation Le
Corbusier** (ADAGP rights until 2036), **Frank Lloyd Wright/Avery**
(JSTOR-gated), **Alvar Aalto Foundation** (paid research service),
**Bauhaus-Archiv** (~500 works online, no licensing), **SAH Archipedia** (open
to read, no bulk, per-image rights), **Mapillary** (CC BY-SA but API image
URLs are time-limited signed URLs — breaks static hotlinking), **Denmark FBB**
(login-gated exports, image-poor).

## Recommendations

Ranked by effort-to-payoff for a sibling Distractor:

1. **Cleveland Museum of Art** — image URLs are already in a single CSV/JSON dump; closest to a find-and-replace on the current `build.mjs`.
2. **Art Institute of Chicago** — JSONL dump + deterministic IIIF URLs; monthly auto-refresh.
3. **LoC Sanborn maps** *(non-art)* — prebuilt CSV/JSON package, public domain, visually striking.
4. **LoC HABS/HAER** *(architecture)* — keyless JSON API, public domain, rich captions; needs polite throttled harvesting at build time.
5. **NASA Images** or **Wellcome** — keyless APIs with hotlinkable images for space and medical/scientific illustration flavors.
6. **Wikidata → Commons** — the general-purpose engine if a future Distractor needs any theme (bridges, brutalism, lighthouses…) with structured captions.
7. **Smithsonian 3D via S3 + `<model-viewer>`** *(3D)* — ~2,360 CC0 packages, keyless enumeration, CORS-enabled hotlinkable GLBs; the only 3D source that fits the static pattern cleanly.
8. **ETH via Wikimedia Commons or e-rara** *(ETH)* — the two ETH routes that are open, keyless, and bulk-harvestable today.
9. **SMK Denmark** *(Europe)* — the European source that matches Cleveland/AIC friction levels: keyless API, CC0, image URLs in the response; **Paris Musées** and **Städel** follow close behind.
10. For "a random Louvre/Prado/British Museum painting": those institutions are closed — go through **Wikimedia Commons/Wikidata** instead.
11. **TU Berlin Architekturmuseum** *(architecture)* — ~92k public-domain architectural drawings as 3000px JPGs with CSV export: the architecture-drawing counterpart to Cleveland. Pair with **LoC HABS** (photos) and **Getty Shulman** (mid-century modern) for a full architecture Distractor family.

A note on verification: dataset locations and rate limits above were verified
against official docs and repos in July 2026, but a smoke test of the top
pick's download + image URLs is worth doing before committing to a build.
