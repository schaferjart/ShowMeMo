# Distractor: Frankfurt

One random public-domain work from the [Städel Museum's digital
collection](https://sammlung.staedelmuseum.de/en) via its keyless OAI-PMH
interface. A sibling of Distractor: MoMA (`main` branch); same client,
different collection.

**Data is built in CI:** `sammlung.staedelmuseum.de` is not reachable from
every sandbox, so `public/data/` on this branch is produced by the
`build-distractors` GitHub Actions workflow (or run `npm run build`
anywhere with open egress). The museum asks harvesters to register a name
and email as a courtesy — see their OAI guide.

## Legal

Metadata CC0; images of public-domain works CC BY-SA 4.0, credit
"Städel Museum".
