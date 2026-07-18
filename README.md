# Distractor: Baltimore

One random work from the [Walters Art Museum's open-access
files](https://github.com/WaltersArtMuseum/api-thewalters-org), full
screen, with almost no interface. A sibling of Distractor: MoMA (`main`
branch); same client, different collection.

- `Space` / `R` for another work · `I` toggles the caption · `?id=<id>` permalinks.

## Build

```sh
npm install
npm run build   # shallow-clones the ~40 MB data repo, writes public/data/
python3 -m http.server 8000 -d public
```

Note: the Walters' v1 API was retired in 2023; these CSVs are the
museum's interim data product, so the dataset is a frozen snapshot.

## Legal

The Walters releases its collection data and images under CC0, including
commercial use. Images are hotlinked from art.thewalters.org.
