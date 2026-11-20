// shots.js — fixed scenes for screenshots (v1.1.0). `?shot=editor` shows the
// editor with a sample photo loaded; `?shot=cover` shows a cover rendered
// full-bleed at the viewport size. `photo`/`caption`/`sub`/`warmth`/`panels`
// tune the scene. window.__shotReady is set once the poster is painted and the
// fonts are in.

import { PANEL_MIN, PANEL_MAX } from './cover.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export async function runShot(shot, query, api) {
  const photoName = query.get('photo') ?? 'pier';
  const caption = query.get('caption') ?? 'SUNSET HEIST';
  const sub = query.get('sub') ?? 'WELCOME TO THE COAST';

  // Query values are clamped rather than trusted: a bad URL must not be able
  // to ask for 0 panels or a NaN warmth and break the scene.
  const warmthRaw = Number.parseInt(query.get('warmth') ?? '', 10);
  const warmth = clamp(Number.isFinite(warmthRaw) ? warmthRaw : 62, 0, 100);

  const panelsRaw = Number.parseInt(query.get('panels') ?? '', 10);
  const panels = clamp(Number.isFinite(panelsRaw) ? panelsRaw : 4, PANEL_MIN, PANEL_MAX);

  // A bad `photo` name must not strand the scene: fall back to the pier sample
  // (which ships with the app) if the requested one cannot be loaded.
  let img;
  try {
    img = await api.loadImage(`samples/${photoName}.jpg`);
  } catch {
    img = await api.loadImage('samples/pier.jpg');
  }

  // Populate the shared state for this scene, one photo across every panel.
  api.state.photos = [{ img, name: photoName }];
  api.state.caption = caption;
  api.state.sub = sub;
  api.state.warmth = warmth;
  api.state.active = 0;
  api.setPanelCount(panels);
  api.state.panels.forEach((panel) => { panel.photo = img; });
  api.render();

  if (shot === 'cover') {
    document.body.classList.add('shot-cover');
    // Match the canvas backing store to the viewport, scaled by the device
    // pixel ratio, so a capture stays crisp on a retina screen (and byte-stable
    // at DPR 1 in a headless browser).
    // Cap the ratio at 2 so a 4K/retina viewport never forces a 4x canvas that
    // would be slower to paint and huge to encode — 2x is already retina-sharp.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    api.canvas.width = Math.round(window.innerWidth * dpr);
    api.canvas.height = Math.round(window.innerHeight * dpr);
  }

  try { await api.fontsReady(); } catch { /* fall back to system font */ }
  api.render();

  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      window.__shotReady = true;
    })
  );
}
