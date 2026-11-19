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

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

if (!existsSync(join(repoRoot, 'app', 'index.html'))) {
  console.error('app/index.html is missing: the entry needs its offline web app.');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'app'), join(outDir, 'app'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in app/ or 48 MiB of app
// files, in all, or a path under app/ over 1000 bytes).
const dossier: Uint8Array = ((): Uint8Array => {
  try {
    return buildDossier(outDir, {
      text_max_bytes: 163840,
      screenshots: { max: 4, max_bytes: 262144 },
      app_max_files: 993,
      app_max_bytes: 50331648,
      app_path_max_bytes: 1000,
    });
  } catch (err) {
    console.error(`dossier: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
    throw err; // unreachable: process.exit does not return
  }
})();
writeFileSync(join(outDir, 'dossier.json'), dossier);

const IMAGE_EXT = /\.(?:jpe?g|png)$/i;
const shotNames = existsSync(join(repoRoot, 'screenshots'))
  ? readdirSync(join(repoRoot, 'screenshots'))
      .filter((n) => !n.startsWith('.') && IMAGE_EXT.test(n))
      .sort()
  : [];
console.log(`Vice Cover entry written to ${outDir}`);
console.log(`  app/          -> ${outDir}/app`);
console.log(`  screenshots/  -> ${outDir}/screenshots (${shotNames.length} image${shotNames.length === 1 ? '' : 's'})`);
console.log(`  dossier.json  -> ${outDir}/dossier.json (${dossier.length} bytes)`);
