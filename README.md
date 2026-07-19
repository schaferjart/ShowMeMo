# Distractor: Cambridge

One random work from the [Fitzwilliam Museum's CC0 raw-data
dump](https://github.com/FitzwilliamMuseum/fitz-collection-raw-data), full
screen, with almost no interface. A sibling of Distractor: MoMA (`main`
branch); same client, different collection.

- `Space` / `R` for another work · `I` toggles the caption · `?id=<id>` permalinks.

## Build

```sh
npm install
npm run build   # downloads the ~22 MB objects.csv.gz, writes public/data/
python3 -m http.server 8000 -d public
```

The museum's live API is auth-gated; the GitHub dump is the sanctioned
open channel. Images are hotlinked from the museum's imagestore.

## Legal

Metadata is CC0. Collection images are published under the museum's
site-wide CC BY-NC-SA 4.0 policy — displayed verbatim here with credit,
non-commercially.
