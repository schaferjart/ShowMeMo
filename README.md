# Distractor: Cleveland

One random CC0 work from the [Cleveland Museum of Art's open-access
dataset](https://github.com/ClevelandMuseumArt/openaccess), full screen,
with almost no interface. A sibling of Distractor: MoMA (`main` branch);
same client, different collection.

- `Space` / `R` for another work · `I` toggles the caption · `?id=<id>` permalinks.

## Build

```sh
npm install
npm run build   # downloads data.csv (~600 MB), writes public/data/
python3 -m http.server 8000 -d public
```

## Legal

Metadata and images for CC0-flagged works are dedicated to the public domain
by the Cleveland Museum of Art ([CC0](https://creativecommons.org/publicdomain/zero/1.0/)).
Images are hotlinked from the museum's servers.
