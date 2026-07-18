# Distractor: Smithsonian 3D

One random 3D object from [Smithsonian Open Access](https://3d.si.edu),
full screen and spinnable, with almost no interface. A sibling of
Distractor: MoMA (`main` branch) — same idea, one more dimension.

- `Space` / `R` for another object · `I` toggles the caption · drag to orbit · `?id=<n>` permalinks (best-effort across rebuilds).

## How it works

`build.mjs` anonymously lists the public `smithsonian-open-access` S3
bucket under `3d/`, picks a ~1 MB low-LOD GLB and poster image per
package, and reads each `scene.svx.json` for the object's title and EDAN
record. The bucket serves everything with `Access-Control-Allow-Origin: *`,
so the vendored [`<model-viewer>`](https://modelviewer.dev) web component
loads the models cross-origin from a purely static page.

## Build

```sh
npm install
npm run build   # lists the bucket + reads ~2,300 scene files
python3 -m http.server 8000 -d public
```

## Legal

Smithsonian Open Access 3D models and metadata are released CC0.
Models and posters are loaded from the Smithsonian's bucket; nothing is
rehosted except the viewer component.
