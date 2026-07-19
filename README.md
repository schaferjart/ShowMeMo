# Distractor: Wellcome

One random open-license image from [Wellcome Collection](https://wellcomecollection.org)
— anatomy, botany, the history of medicine. A sibling of Distractor: MoMA
(`main` branch); same client, different collection.

**Data is built in CI:** `api.wellcomecollection.org` is not reachable from
every sandbox, so `public/data/` on this branch is produced by the
`build-distractors` GitHub Actions workflow (or run `npm run build`
anywhere with open egress). The API caps each result set at 10,000, so the
harvest runs once per license (CC0 + Public Domain Mark).

## Legal

Only images whose location license is CC0 or Public Domain Mark are
included; images are served from Wellcome's IIIF endpoint.
