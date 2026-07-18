# Distractor: Minneapolis

One random public-domain work from the [Minneapolis Institute of Art's
collection repo](https://github.com/artsmia/collection), full screen, with
almost no interface. A sibling of Distractor: MoMA (`main` branch); same
client, different collection.

- `Space` / `R` for another work · `I` toggles the caption · `?id=<id>` permalinks · `?onview=1` restricts to works on view.

## Build

```sh
npm install
npm run build   # shallow-clones the ~900 MB repo, writes public/data/
python3 -m http.server 8000 -d public
```

Images are hotlinked from `api.artsmia.org` at the 800px "large" size.

## Legal

Metadata is CC0; only unrestricted works whose rights type is Public
Domain are included. Mia asks for credit: Minneapolis Institute of Art.
