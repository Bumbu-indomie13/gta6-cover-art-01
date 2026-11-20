// main.js — wires the editor UI to the cover engine (./cover.js). A `?shot=`
// query hands control to ./shots.js instead, which stages a fixed scene for a
// screenshot capture.

import { renderCover, panelAt, panelLayout, PANEL_MIN, PANEL_MAX } from './cover.js';
import { runShot } from './shots.js';

// ---------------------------------------------------------------------------
// DOM handles
// ---------------------------------------------------------------------------

const byId = (id) => document.getElementById(id);

const canvas = byId('preview');
const ctx = canvas.getContext('2d');

const els = {
  photos: byId('photos'),
  drop: byId('drop'),
  caption: byId('caption'),
  sub: byId('sub'),
  warmth: byId('warmth'),
  panelCount: byId('panelCount'),
  panelLabel: byId('panelLabel'),
  prevPanel: byId('prevPanel'),
  nextPanel: byId('nextPanel'),
  photoPick: byId('photoPick'),
  zoom: byId('zoom'),
  offsetX: byId('offsetX'),
  offsetY: byId('offsetY'),
  zoomVal: byId('zoomVal'),
  oxVal: byId('oxVal'),
  oyVal: byId('oyVal'),
  status: byId('status'),
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  photos: [],                 // [{ img: Image, name: string }]
  panels: [],                 // [{ photo: Image|null, zoom, ox, oy }]
  panelCount: 4,
  caption: 'SUNSET HEIST',
  sub: '',
  warmth: 62,
  active: 0,
};

// Varied defaults so a fresh collage already looks composed, not tiled.
const PANEL_DEFAULTS = [
  { zoom: 1.5, ox: -0.35, oy: 0.18 },
  { zoom: 1.8, ox: 0.3, oy: -0.2 },
  { zoom: 1.45, ox: -0.1, oy: 0.32 },
  { zoom: 1.9, ox: 0.25, oy: 0.12 },
  { zoom: 1.6, ox: -0.28, oy: -0.28 },
];

// The square thumbnails in the photo picker, in CSS pixels.
const THUMB_SIZE = 52;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** The subset of state the cover engine consumes. */
function coverState() {
  return {
    panels: state.panels,
    caption: state.caption,
    sub: state.sub,
    warmth: state.warmth,
  };
}

/** A fresh panel object, round-robining the photo list when it has any. */
function makePanel(index) {
  const d = PANEL_DEFAULTS[index % PANEL_DEFAULTS.length];
  return {
    photo: state.photos.length ? state.photos[index % state.photos.length].img : null,
    zoom: d.zoom,
    ox: d.ox,
    oy: d.oy,
  };
}

// ---------------------------------------------------------------------------
// Image loading
// ---------------------------------------------------------------------------

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

async function addPhotoFiles(fileList) {
  for (const file of fileList) {
    if (!file.type.startsWith('image/')) continue;
    // A Blob URL is handed back to the browser once the image has decoded.
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      state.photos.push({ img, name: file.name || `photo ${state.photos.length + 1}` });
    } catch {
      /* skip unreadable file */
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (!state.photos.length) return;
  if (!state.panels.length) initPanels();
  else assignMissingPanels();
  render();
}

// Assign a photo to every panel that still has none; with several photos,
// round-robin so each gets a different one.
function assignMissingPanels() {
  state.panels.forEach((p, i) => {
    if (!p.photo) p.photo = state.photos[i % state.photos.length].img;
  });
}

function initPanels() {
  state.panels = [];
  for (let i = 0; i < state.panelCount; i++) state.panels.push(makePanel(i));
}

function setPanelCount(n) {
  n = clamp(Math.round(n), PANEL_MIN, PANEL_MAX);
  state.panelCount = n;
  while (state.panels.length < n) state.panels.push(makePanel(state.panels.length));
  state.panels.length = n;
  state.active = clamp(state.active, 0, n - 1);
  render();
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function render() {
  renderCover(canvas, coverState());
  // The poster is drawn clean for the full-bleed cover capture; the panel
  // outlines are an editor affordance only, so they are skipped in ?shot=cover.
  if (!document.body.classList.contains('shot-cover')) drawPanelOutlines();
  syncPanelEditor();
}

// Thin outlines on every panel so the user can see the slices; the selected
// panel glows brighter and thicker than the rest.
function drawPanelOutlines() {
  const n = state.panels.length;
  if (!n) return;
  const polys = panelLayout(canvas.width, canvas.height, n);
  ctx.save();
  polys.forEach((poly, i) => {
    ctx.lineWidth = i === state.active ? 3 : 1.5;
    ctx.strokeStyle = i === state.active ? 'rgba(255, 214, 140, 0.95)' : 'rgba(255, 140, 66, 0.55)';
    ctx.beginPath();
    poly.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
  });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Panel editor
// ---------------------------------------------------------------------------

function syncPanelEditor() {
  const i = state.active;
  const p = state.panels[i];
  els.panelLabel.textContent = `Panel ${i + 1} of ${state.panels.length}`;
  els.zoom.value = p.zoom;
  els.offsetX.value = Math.round(p.ox * 100);
  els.offsetY.value = Math.round(p.oy * 100);
  els.zoomVal.textContent = `${p.zoom.toFixed(2)}\u00d7`;
  els.oxVal.textContent = `${Math.round(p.ox * 100)}`;
  els.oyVal.textContent = `${Math.round(p.oy * 100)}`;
  rebuildPhotoPick();
}

function rebuildPhotoPick() {
  els.photoPick.textContent = '';
  const activePhoto = state.panels[state.active].photo;

  state.photos.forEach((entry) => {
    const thumb = document.createElement('canvas');
    thumb.width = THUMB_SIZE;
    thumb.height = THUMB_SIZE;
    thumb.className = 'thumb';
    thumb.title = entry.name;
    if (entry.img === activePhoto) thumb.classList.add('on');

    // cover-fit thumbnail, sized from the decoded (natural) dimensions
    const c = thumb.getContext('2d');
    const s = Math.max(THUMB_SIZE / entry.img.naturalWidth, THUMB_SIZE / entry.img.naturalHeight);
    const dw = entry.img.naturalWidth * s;
    const dh = entry.img.naturalHeight * s;
    c.drawImage(entry.img, (THUMB_SIZE - dw) / 2, (THUMB_SIZE - dh) / 2, dw, dh);

    thumb.addEventListener('click', () => {
      state.panels[state.active].photo = entry.img;
      render();
    });
    els.photoPick.appendChild(thumb);
  });
}

function applyPanel() {
  const p = state.panels[state.active];
  p.zoom = clamp(parseFloat(els.zoom.value), 1, 3.5);
  p.ox = clamp(parseFloat(els.offsetX.value) / 100, -1, 1);
  p.oy = clamp(parseFloat(els.offsetY.value) / 100, -1, 1);
  render();
}

/** Reset the active panel to its default crop/zoom/offset. */
function resetActivePanel() {
  const d = PANEL_DEFAULTS[state.active % PANEL_DEFAULTS.length];
  const p = state.panels[state.active];
  p.zoom = d.zoom;
  p.ox = d.ox;
  p.oy = d.oy;
  render();
}

function selectPanel(i) {
  state.active = clamp(i, 0, state.panels.length - 1);
  render(); // render() syncs the panel editor as its last step
}

// ---------------------------------------------------------------------------
// Pointer dragging (pan the selected panel by hand)
// ---------------------------------------------------------------------------

let dragging = null; // { startX, startY, startOx, startOy }
let dragFrame = null; // pending requestAnimationFrame id while dragging

function eventPos(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width / r.width),
    y: (e.clientY - r.top) * (canvas.height / r.height),
  };
}

canvas.addEventListener('pointerdown', (e) => {
  const { x, y } = eventPos(e);
  const i = panelAt(x, y, canvas.width, canvas.height, state.panels.length);
  if (i >= 0) selectPanel(i);
  const p = state.panels[state.active];
  dragging = { startX: x, startY: y, startOx: p.ox, startOy: p.oy };
  // Keep receiving moves even when the pointer leaves the canvas; the CSS
  // touch-action: none already stops the gesture from scrolling the page.
  if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  e.preventDefault();
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const { x, y } = eventPos(e);
  const p = state.panels[state.active];
  // Dragging the full canvas width sweeps the whole ox range ([-1, 1]).
  p.ox = clamp(dragging.startOx + ((x - dragging.startX) / canvas.width) * 2, -1, 1);
  p.oy = clamp(dragging.startOy + ((y - dragging.startY) / canvas.height) * 2, -1, 1);
  e.preventDefault();
  // Coalesce redraws into one per animation frame, so a fast drag never runs
  // the full render several times inside a single frame.
  if (!dragFrame) dragFrame = requestAnimationFrame(() => (dragFrame = null, render()));
});

function endDrag() {
  dragging = null;
  if (dragFrame) {
    cancelAnimationFrame(dragFrame);
    dragFrame = null;
    render();
  }
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// Double-click resets the active panel to its default crop/zoom/offset.
canvas.addEventListener('dblclick', resetActivePanel);

// Arrow keys cycle panels, unless the user is typing in a field.
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    selectPanel(state.active - 1);
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    selectPanel(state.active + 1);
  }
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function exportCover(w, h) {
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  renderCover(off, coverState());
  off.toBlob((blob) => {
    if (!blob) {
      els.status.textContent = 'Export failed';
      return;
    }
    const name = `vice-cover-${w}x${h}.png`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    els.status.textContent = `Saved ${name} (${Math.round(blob.size / 1024)} KB)`;
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

els.photos.addEventListener('change', (e) => addPhotoFiles(e.target.files));
['dragover', 'dragenter'].forEach((ev) =>
  els.drop.addEventListener(ev, (e) => e.preventDefault()));
els.drop.addEventListener('drop', (e) => {
  e.preventDefault();
  addPhotoFiles(e.dataTransfer.files);
});

els.caption.addEventListener('input', () => {
  state.caption = els.caption.value;
  render();
});
els.sub.addEventListener('input', () => {
  state.sub = els.sub.value;
  render();
});
els.warmth.addEventListener('input', () => {
  state.warmth = parseInt(els.warmth.value, 10);
  render();
});

els.panelCount.querySelectorAll('button').forEach((b) =>
  b.addEventListener('click', () => {
    setPanelCount(parseInt(b.dataset.n, 10));
    els.panelCount.querySelectorAll('button').forEach((x) =>
      x.classList.toggle('on', x === b));
  }));

els.prevPanel.addEventListener('click', () => selectPanel(state.active - 1));
els.nextPanel.addEventListener('click', () => selectPanel(state.active + 1));
els.zoom.addEventListener('input', applyPanel);
els.offsetX.addEventListener('input', applyPanel);
els.offsetY.addEventListener('input', applyPanel);

// Export buttons -> pixel sizes, wired from one table so adding a format is a
// one-line change.
const EXPORT_FORMATS = {
  'export-sq': [1080, 1080],
  'export-st': [1080, 1350],
  'export-w': [1920, 1080],
};
for (const [id, [w, h]] of Object.entries(EXPORT_FORMATS)) {
  byId(id).addEventListener('click', () => exportCover(w, h));
}

// ---------------------------------------------------------------------------
// Font readiness + boot
// ---------------------------------------------------------------------------

export function fontsReady() {
  return document.fonts.load('16px "Anton"').then(() => document.fonts.ready);
}

async function boot() {
  try {
    await fontsReady();
  } catch {
    /* fall back to system font */
  }

  const params = new URLSearchParams(location.search);
  const shot = params.get('shot');
  if (shot) {
    runShot(shot, params, {
      state,
      canvas,
      render,
      loadImage,
      setPanelCount,
      fontsReady,
    });
    return;
  }

  if (!state.panels.length) initPanels();
  render();
}

boot();
