// shots.js — fixed scenes for screenshots. `?shot=editor` shows the editor with a
// sample photo loaded; `?shot=cover` shows a cover rendered full-bleed at the
// viewport size. `photo`/`caption`/`sub`/`warmth`/`panels` tune the scene.
// window.__shotReady is set once the poster is painted and the fonts are in.

export async function runShot(shot, query, api) {
  const photoName = query.get('photo') ?? 'pier';
  const caption = query.get('caption') ?? 'SUNSET HEIST';
  const sub = query.get('sub') ?? 'WELCOME TO THE COAST';
  const warmth = parseInt(query.get('warmth') ?? '62', 10);
  const panels = parseInt(query.get('panels') ?? '4', 10);

  const img = await api.loadImage(`samples/${photoName}.jpg`);

  // Set up the state for this scene.
  api.state.photos = [{ img, name: photoName }];
  api.state.caption = caption;
  api.state.sub = sub;
  api.state.warmth = warmth;
  api.state.active = 0;
  api.setPanelCount(panels);
  api.state.panels.forEach((p) => { p.photo = img; });
  api.render();

  if (shot === 'cover') {
    document.body.classList.add('shot-cover');
    // Match the canvas backing store to the viewport for a crisp 1:1 capture.
    api.canvas.width = window.innerWidth;
    api.canvas.height = window.innerHeight;
  } else {
    // Editor scene: show the first panel selected and the controls populated.
    api.state.caption = caption;
    api.state.sub = sub;
  }

  try { await api.fontsReady(); } catch { /* fall back to system font */ }
  api.render();

  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      window.__shotReady = true;
    })
  );
}
