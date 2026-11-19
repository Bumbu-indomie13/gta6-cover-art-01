// main.js — wires the editor UI to the cover engine (./cover.js). A `?shot=`
// query hands control to ./shots.js instead, which sets up a fixed scene for a
// screenshot.

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
  { zoom: 1.8, ox: 0.30, oy: -0.20 },
  { zoom: 1.45, ox: -0.10, oy: 0.32 },
  { zoom: 1.9, ox: 0.25, oy: 0.12 },
  { zoom: 1.6, ox: -0.28, oy: -0.28 },
];

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

/** A fresh panel object, using the photo list round-robin when it has any. */
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
    try {
      const img = await loadImage(URL.createObjectURL(file));
      state.photos.push({ img, name: file.name || `photo ${state.photos.length + 1}` });
    } catch {
      /* skip unreadable file */
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
  drawPanelOutlines();
  syncPanelEditor();
}

// Thin outline on every panel so the user can see the slices; the selected
// panel's index tag is surfaced through the editor label.
function drawPanelOutlines() {
  const n = state.panels.length;
  if (!n) return;
  const polys = panelLayout(canvas.width, canvas.height, n);
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 140, 66, 0.95)';
  for (const poly of polys) {
    ctx.beginPath();
    poly.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
  }
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
    thumb.width = 52;
    thumb.height = 52;
    thumb.className = 'thumb';
    thumb.title = entry.name;
    if (entry.img === activePhoto) thumb.classList.add('on');

    // cover-fit thumbnail
    const c = thumb.getContext('2d');
    const s = Math.max(52 / entry.img.width, 52 / entry.img.height);
    const dw = entry.img.width * s;
    const dh = entry.img.height * s;
    c.drawImage(entry.img, (52 - dw) / 2, (52 - dh) / 2, dw, dh);

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

function selectPanel(i) {
  state.active = clamp(i, 0, state.panels.length - 1);
  syncPanelEditor();
  render();
}

// ---------------------------------------------------------------------------
// Pointer dragging (pan the selected panel by hand)
// ---------------------------------------------------------------------------

let dragging = null; // { startX, startY, startOx, startOy }

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
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const { x, y } = eventPos(e);
  const p = state.panels[state.active];
  // Dragging the full canvas width sweeps the whole ox range ([-1, 1]).
  p.ox = clamp(dragging.startOx + ((x - dragging.startX) / canvas.width) * 2, -1, 1);
  p.oy = clamp(dragging.startOy + ((y - dragging.startY) / canvas.height) * 2, -1, 1);
  render();
});

canvas.addEventListener('pointerup', () => { dragging = null; });

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

byId('export-sq').addEventListener('click', () => exportCover(1080, 1080));
byId('export-st').addEventListener('click', () => exportCover(1080, 1350));
byId('export-w').addEventListener('click', () => exportCover(1920, 1080));

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
