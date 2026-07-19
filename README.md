# Distractor: Smithsonian

One random CC0 work from the Smithsonian's art museums — American Art,
the National Portrait Gallery, Asian Art, the Hirshhorn, and African
Art — full screen, with almost no interface. A sibling of Distractor:
MoMA (`main` branch); same client, different collection. (For objects in
the round, see Distractor: Smithsonian 3D on `distractor/si3d`.)

- `Space` / `R` for another work · `I` toggles the caption · `?id=<n>` permalinks (best-effort across rebuilds).

## Build

```sh
npm install
npm run build   # downloads ~1,280 metadata files from the open-access S3 bucket
python3 -m http.server 8000 -d public
```

Images are hotlinked from ids.si.edu bounded to 1000px.

## Legal

Only records and media flagged CC0 in Smithsonian Open Access are
included.
