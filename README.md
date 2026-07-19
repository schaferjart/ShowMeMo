# Distractor: NASA

One random image from the [NASA Image and Video Library](https://images.nasa.gov).
A sibling of Distractor: MoMA (`main` branch); same client, different
collection.

**Data is built in CI:** `images-api.nasa.gov` is not reachable from every
sandbox, so `public/data/` on this branch is produced by the
`build-distractors` GitHub Actions workflow (or run `npm run build`
anywhere with open egress). The build sweeps twenty topic queries through
the keyless search API and dedupes by `nasa_id`.

## Legal

NASA media is generally public domain; items whose descriptions assert
third-party copyright are skipped, and NASA insignia rules still apply.
