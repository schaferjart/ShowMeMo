# Distractor: Washington

One random open-access work from the [National Gallery of Art's open
data](https://github.com/NationalGalleryOfArt/opendata), full screen, with
almost no interface. A sibling of Distractor: MoMA (`main` branch); same
client, different collection.

- `Space` / `R` for another work · `I` toggles the caption · `?id=<id>` permalinks.

## Build

```sh
npm install
npm run build   # downloads objects.csv + published_images.csv, writes public/data/
python3 -m http.server 8000 -d public
```

Images are served from the gallery's IIIF endpoint, fit inside 800px;
nothing is rehosted.

## Legal

The dataset is CC0; only objects whose primary image is flagged open
access are included.
