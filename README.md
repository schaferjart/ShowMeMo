# Distractor: NYPL

One random public-domain item from [The New York Public Library's
January 2016 public-domain release](https://github.com/NYPL-publicdomain/data-and-utilities),
full screen, with almost no interface. A sibling of Distractor: MoMA
(`main` branch); same client, different collection — maps, stereographs,
menus, prints, photographs.

- `Space` / `R` for another item · `I` toggles the caption · `?id=<id>` permalinks.

## Build

```sh
npm install
npm run build   # shallow-clones the ~500 MB dump, writes public/data/
python3 -m http.server 8000 -d public
```

The dump is a frozen 2016 snapshot (~190k items); images are hotlinked
from images.nypl.org at the 760px web size.

## Legal

Everything in the release is public domain / CC0 per NYPL's dedication.
