# Distractor: Chicago

One random public-domain work from the [Art Institute of Chicago's data
dump](https://github.com/art-institute-of-chicago/api-data), full screen,
with almost no interface. A sibling of Distractor: MoMA (`main` branch);
same client, different collection.

- `Space` / `R` for another work · `I` toggles the caption · `?id=<id>` permalinks · `?onview=1` restricts to works on view.

## Build

```sh
npm install
npm run build   # downloads the ~115 MB dump, writes public/data/
python3 -m http.server 8000 -d public
```

Images are served from the museum's IIIF endpoint at their recommended
843px reuse size; nothing is rehosted.

## Legal

Metadata is CC0-equivalent; only works flagged `is_public_domain` are
included, per the museum's open-access guidance.
