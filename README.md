[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/Bumbu-indomie13/gta6-cover-art-01/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/Bumbu-indomie13/gta6-cover-art-01/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

Built for the make.fun bounty [gta6-cover-art-01](https://make.fun/bounty/gta6-cover-art-01).

# Vice Cover

A GTA-style cover-poster maker that runs entirely offline in the browser. Drop in
a photo (or a different photo per panel), type a caption, and get a poster cut
into 3-5 diagonal slices under a warm sunset grade, palm silhouettes, a retro
sun, halftone + film-grain print texture and a bold condensed caption. Export a
PNG at 1080x1080, 1080x1350 or 1920x1080.

## What it does

- Diagonal sliced panels (3-5), each panel with its own crop, zoom and pan.
  Click a panel to select it, drag directly on the poster to pan its photo, or
  use the zoom / pan X / pan Y sliders.
- Warm sunset grade (sky -> magenta -> orange -> gold) blended over each panel in
  overlay, plus a plum multiply along the bottom, so neighbouring strips read as
  one balanced sunset instead of a row of tinted frames.
- Palm silhouettes and a retro slitted sun, drawn from curves.
- Halftone dots + seeded film grain for a poster-press texture, then a vignette
  and a double print border.
- Bold condensed caption (plus an optional smaller line) set in Anton, which is
  vendored locally under app/assets/ (OFL 1.1). Long captions wrap to two lines
  instead of shrinking below readable size.
- Exports PNGs at 1080x1080, 1080x1350 and 1920x1080 via canvas.toBlob. The same
  renderer draws the live preview and every export.

## How to run

It is a static web app with no build step and no network requests, so it can be
served any way you like. The repo ships a tiny local server (Node 22, standard
library only):

    node serve.ts

then open http://localhost:8080. (Use `node serve.ts --port 9000` for a
different port.)

To try it fully offline, open app/index.html directly from disk, or serve the
app/ folder with any static file server.

## How to hand it in

    mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

This copies app/ and screenshots/ into out/ and writes out/dossier.json with the
vendored make.fun library.

## Layout

    app/            the web app (index.html, style.css, src/*.js, assets/, samples/)
    app/src/cover.js   the 2D-canvas cover engine (renderCover, panelAt, panelLayout)
    app/src/main.js    editor wiring (drag, sliders, export, thumbnails)
    app/src/shots.js   fixed scenes for screenshots (?shot=cover / ?shot=editor)
    vendor/            make.fun library (vendored, unchanged)
    screenshots/       three renders of the app (the first by name is the cover)
    main.ts            hands in app/ + screenshots/ and writes dossier.json
    serve.ts           local static server for app/

## Screenshots

The three screenshots under screenshots/ are real browser captures of the app
(Playwright + Chromium). They are named for the poster or editor size they show,
and stored at sizes the entry rules allow (long side 1280 px or less):

    01-poster-1080x1350.jpg   the 4:5 story cover, rendered at 1024x1280
    02-poster-1080x1080.jpg   the square cover, rendered at 1080x1080
    03-editor-1440x900.jpg    the editor with a photo loaded, at 1280x800

All three are JPEG, each under 256 KiB.
