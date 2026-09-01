# Filmstrip

A photo site that scrolls sideways. One long wall of pictures, each one printed at
the height of your window, with its camera settings underneath. On a phone it
folds down into an ordinary column.

**Live:** _(added after the first deploy)_

## Adding your photos

1. Drop full-resolution JPEGs into `photos-src/`. Filenames become the ordering
   fallback, so `001.jpg`, `002.jpg`… is a fine way to control the sequence.
2. Run the build:

```bash
npm run photos
```

That reads each file's EXIF, writes web-sized copies into `img/`, and regenerates
`index.html` and `data/photos.json`. Commit and push — Vercel redeploys on its own.

Photos are sorted newest-first by capture date when the EXIF has one; otherwise
they keep filename order.

### Captions

Captions are built from EXIF — camera, aperture, shutter, focal length, ISO. To
override one, drop a JSON file next to the photo with the same name:

```json
// photos-src/003.json
{
  "alt": "Frost on the allotment gate",
  "caption": "Leica Q, ƒ1.7, 1/320 sec, 28mm, ISO 100"
}
```

### Site text

Everything in the left-hand pane — title, bio, links — lives in
`site.config.json`. Edit it and re-run `npm run photos`.

## Commands

```bash
npm run photos   # rebuild index.html + img/ from photos-src/
npm run dev      # serve the site locally on :4321
npm run demo     # fetch a CC0 starter set (only needed once)
```

## How it's put together

Plain HTML, CSS and a little JavaScript — no framework, no build step on the
server. `scripts/build-photos.mjs` generates a static `index.html` ahead of time,
so the photos are visible even with JavaScript switched off; the script only adds
the sideways scrolling, the blur-up loading and the fullscreen viewer.

| Path | What it is |
| --- | --- |
| `photos-src/` | your originals — kept local, not committed |
| `img/` | generated web-sized copies — committed, this is what ships |
| `src/template.html` | the page shell the build fills in |
| `assets/` | stylesheet and script |
| `site.config.json` | title, bio, links |

## About the demo photos

The starter set is CC0 / public-domain work pulled from
[Openverse](https://openverse.org); each photographer is credited in the caption
and in `data/photos.json`. They're web-sized copies (around 960px), so they look
a little soft blown up to full height — your own full-resolution files won't.
Clear out `photos-src/` and re-run `npm run photos` to replace them.
