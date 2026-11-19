// Vice Cover — a GTA-style cover-poster maker, handed in as a static web app
// (Node 22, standard library only, no build step, no network). The app lives in
// app/ and runs offline in a desktop browser: app/index.html plus its ES modules
// (src/main.js, src/cover.js, src/shots.js) turn a photo and a caption into a
// collage of 3-5 diagonal sliced panels — each panel with its own crop/zoom/
// offset, set by dragging on the poster or with sliders — under a warm sunset
// grade, palm silhouettes, a retro sun, halftone + grain print texture and a bold
// Anton caption (app/assets/Anton-Regular.ttf, OFL 1.1, vendored locally). One
// 2D-canvas engine renders the live preview and the exports: PNGs at 1080x1080,
// 1080x1350 and 1920x1080 via canvas.toBlob, all offline, no library, no CDN.
//
// This program hands the entry in: it copies app/ and screenshots/ from beside
// this file to /output (or MAKEFUN_OUTPUT_DIR) and writes dossier.json, the
// summary the judge reads, with the vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

if (!existsSync(join(here, 'app', 'index.html'))) {
  console.error('app/index.html is missing: the entry needs its offline web app.');
  process.exit(1);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in app/ or 48 MiB of app
// files, in all, or a path under app/ over 1000 bytes).
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

const shots = existsSync(join(here, 'screenshots'))
  ? readdirSync(join(here, 'screenshots')).filter((n) => !n.startsWith('.')).sort()
  : [];
console.log(`Vice Cover entry written to ${out}`);
console.log(`  app/          -> ${out}/app`);
console.log(`  screenshots/  -> ${out}/screenshots (${shots.length} image${shots.length === 1 ? '' : 's'})`);
console.log(`  dossier.json  -> ${out}/dossier.json (${dossier.length} bytes)`);
