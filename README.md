# Distractor: Berlin

One random work from the [Staatliche Museen zu Berlin's collection
search](https://recherche.smb.museum) — nineteen collections from the
Gemäldegalerie to the Neue Nationalgalerie. A sibling of Distractor: MoMA
(`main` branch); same client, different collection.

**Data is built in CI:** `api.smb.museum` is not reachable from every
sandbox, so `public/data/` on this branch is produced by the
`build-distractors` GitHub Actions workflow (or run `npm run build`
anywhere with open egress). The backend is public but undocumented — the
build logs its first response and fails loudly if the shape changes.

## Legal

SMB publishes images of public-domain works under CC BY-SA 4.0 /
Public Domain Mark (site-wide policy); credit "Staatliche Museen zu
Berlin" plus the collection shown in the caption.
