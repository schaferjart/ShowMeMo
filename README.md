# Distractor: Finna

One random freely reusable image from Finnish museums, archives and
libraries, via the [Finna.fi](https://api.finna.fi) aggregator's keyless
API. A sibling of Distractor: MoMA (`main` branch); same client,
different collection.

**Data is built in CI:** `api.finna.fi` is not reachable from every
sandbox, so `public/data/` on this branch is produced by the
`build-distractors` GitHub Actions workflow (or run `npm run build`
anywhere with open egress). The harvest filters to images that are
free-online with usage rights `usage_B` (CC0/PD) or `usage_A` (CC BY),
and each caption carries the per-record license and holding institution.

## Legal

Finna metadata is CC0; every included image carries a machine-readable
free-reuse license, shown in the caption.
