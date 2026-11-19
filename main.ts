// A working gta6-cover-art-01 entry (Node 22, standard library only): the app is this directory's app/ folder, plain
// static files a desktop browser loads offline (app/index.html and its ES modules, no library and no network
// request), and the program hands it in. It copies app/ and screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored make.fun library. Only the plumbing, not the
// cover art the bounty asks for: Cover Snap, a plain one-photo square cover with a sunset tint and a bold caption,
// exported as a 1080 x 1080 PNG. Its two sample photos (app/samples/) were made for make.fun with an image model and
// are free to use. Build your own GTA-style cover maker in its place, put your 3 or 4 PNG or JPEG screenshots in
// screenshots/ (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// v1.1.0 — softened the sunset grade in app/src/cover.js (less red, orange-to-pink spread).

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fail fast, before any copying, if either half of the entry is missing: the app's entry page or
// the screenshots folder. A clear message up front beats a dossier build failure further in.
for (const [path, what] of [
  [join(here, 'app', 'index.html'), 'app/index.html'],
  [join(here, 'screenshots'), 'screenshots/'],
] as const) {
  if (!existsSync(path)) {
    throw new Error(
      `missing ${what} — an entry needs app/index.html and screenshots/ ` +
        '(3 or 4 renders, the first by name the cover)',
    );
  }
}

const shots = readdirSync(join(here, 'screenshots'), { withFileTypes: true })
  .filter((d) => d.isFile())
  .map((d) => d.name);
if (shots.length < 3 || shots.length > 4) {
  throw new Error(
    `screenshots/ must hold 3 or 4 files, found ${shots.length}` +
      ' — the first by name is the cover',
  );
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in app/ or 48 MiB of app
// files, in all, or a path under app/ over 1000 bytes: app/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);

console.log(
  `Hand-in ready at ${out}: app/ + ${shots.length} screenshots (${shots.join(', ')}) + dossier.json`,
);
