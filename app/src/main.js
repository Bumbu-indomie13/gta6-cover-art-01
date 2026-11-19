// main.js — wires the page: load photos from disk (FileReader, never uploaded), tweak each panel's
// crop/zoom/position, edit the caption, pick a grade and an export size, and write a PNG via
// canvas.toBlob. A `?shot=` query drives a fixed scene for screenshots (./shots.js).
import { renderCover, panelRects } from './cover.js';
import { runShot } from './shots.js';

const EXPORT_SIZES = {
  '1080x1080': { w: 1080, h: 1080 },
  '1080x1350': { w: 1080, h: 1350 },
  '1920x1080': { w: 1920, h: 1080 },
};

// Per-panel defaults: staggered zooms and pans so one photo already reads as distinct crops.
const PANEL_PRESETS = [
  { zoom: 1.05, panX: 0, panY: 0 },
  { zoom: 1.5, panX: 0.35, panY: -0.2 },
  { zoom: 1.2, panX: -0.35, panY: 0.15 },
  { zoom: 1.65, panX: -0.15, panY: 0.25 },
  { zoom: 1.3, panX: 0.3, panY: 0.15 },
];

const state = {
  photos: [], // [{ img: Image, thumb: string(dataURL) }]
  panels: [], // [{ photo: index|-1, zoom, panX, panY }]
  caption: 'Sunset Heist',
  grade: 'sunset',
  grain: true,
  selected: 0,
  exportSize: '1080x1080',
};

const $ = (id) => document.getElementById(id);
const canvas = $('preview');
const ctx = canvas.getContext('2d');

// ---------------------------------------------------------------- panel state

function makePanels(n) {
  return Array.from({ length: n }, (_, i) => ({
    photo: state.photos.length ? 0 : -1,
    ...PANEL_PRESETS[i % PANEL_PRESETS.length],
  }));
}

function setPanelCount(n) {
  const old = state.panels;
  state.panels = Array.from({ length: n }, (_, i) =>
    old[i] ? { ...old[i] } : { photo: state.photos.length ? 0 : -1, ...PANEL_PRESETS[i % PANEL_PRESETS.length] },
  );
  if (state.selected >= n) state.selected = n - 1;
  renderTabs();
  syncPanelControls();
  redraw();
}

// ---------------------------------------------------------------- rendering

function previewSize() {
  const s = EXPORT_SIZES[state.exportSize];
  const full = document.body.classList.contains('shot-cover');
  const scale = full ? 1 : Math.min(720 / s.w, 720 / s.h);
  return { w: Math.round(s.w * scale), h: Math.round(s.h * scale) };
}

function applyPreview() {
  const { w, h } = previewSize();
  canvas.width = w;
  canvas.height = h;
  if (document.body.classList.contains('shot-cover')) {
    canvas.style.width = '';
    canvas.style.height = '';
  } else {
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }
  redraw();
}

function redraw() {
  renderCover(ctx, canvas.width, canvas.height, state);
}

// ---------------------------------------------------------------- photos

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = src;
  });
}

function makeThumb(img, size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const cx = c.getContext('2d');
  const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  cx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return c.toDataURL('image/jpeg', 0.72);
}

async function loadPhotos(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    try {
      const dataUrl = await readAsDataURL(file);
      const img = await loadImage(dataUrl);
      state.photos.push({ img, thumb: makeThumb(img, 72) });
    } catch (err) {
      console.warn('Skipped a photo:', err);
    }
  }
  if (state.photos.length) {
    state.panels.forEach((p) => {
      if (p.photo < 0) p.photo = 0;
    });
  }
  renderThumbs();
  renderTabs();
  syncPanelControls();
  redraw();
}

// ---------------------------------------------------------------- controls UI

const stripsEl = $('strips');
const tabsEl = $('panel-tabs');

function renderThumbs() {
  stripsEl.innerHTML = '';
  if (!state.photos.length) {
    stripsEl.innerHTML = '<p class="hint">No photos yet — add some to fill the panels.</p>';
    return;
  }
  state.photos.forEach((photo, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'thumb' + (state.panels[state.selected]?.photo === i ? ' active' : '');
    btn.title = 'Use on the selected panel';
    const img = document.createElement('img');
    img.src = photo.thumb;
    img.alt = `Photo ${i + 1}`;
    btn.appendChild(img);
    btn.addEventListener('click', () => {
      state.panels[state.selected].photo = i;
      renderThumbs();
      renderTabs();
      redraw();
    });
    stripsEl.appendChild(btn);
  });
}

function renderTabs() {
  tabsEl.innerHTML = '';
  state.panels.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab' + (i === state.selected ? ' active' : '');
    btn.title = `Edit panel ${i + 1}`;
    const photo = state.photos[p.photo];
    if (photo) {
      const img = document.createElement('img');
      img.src = photo.thumb;
      img.alt = `Panel ${i + 1}`;
      btn.appendChild(img);
    } else {
      btn.textContent = `P${i + 1}`;
    }
    btn.addEventListener('click', () => {
      state.selected = i;
      renderTabs();
      syncPanelControls();
      redraw();
    });
    tabsEl.appendChild(btn);
  });
}

const zoomInput = $('zoom');
const panxInput = $('panx');
const panyInput = $('pany');

function syncPanelControls() {
  const p = state.panels[state.selected];
  $('panel-label').textContent = String(state.selected + 1);
  $('panel-of').textContent = `/ ${state.panels.length}`;
  zoomInput.value = String(Math.round(p.zoom * 100));
  $('zoom-val').textContent = `${p.zoom.toFixed(2)}\u00d7`;
  panxInput.value = String(Math.round(p.panX * 100));
  panyInput.value = String(Math.round(p.panY * 100));
  $('panx-val').textContent = String(Math.round(p.panX * 100));
  $('pany-val').textContent = String(Math.round(p.panY * 100));
  renderThumbs();
}

function markActive(container, active) {
  [...container.children].forEach((c) => c.classList.toggle('active', c === active));
}

function bindSegments() {
  const counts = $('panel-count');
  const setCount = (n) => {
    const btn = counts.querySelector(`button[data-n="${n}"]`);
    markActive(counts, btn);
    setPanelCount(n);
  };
  counts.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-n]');
    if (btn) setCount(Number(btn.dataset.n));
  });

  const grades = $('grade');
  grades.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-g]');
    if (!btn) return;
    state.grade = btn.dataset.g;
    markActive(grades, btn);
    redraw();
  });
}

// ---------------------------------------------------------------- canvas input

let dragging = false;
let lastX = 0;
let lastY = 0;

function eventPos(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
}

function panelAt(pos) {
  const rects = panelRects(state.panels.length, canvas.width, canvas.height);
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h) return i;
  }
  return -1;
}

canvas.addEventListener('pointerdown', (e) => {
  const pos = eventPos(e);
  const i = panelAt(pos);
  if (i < 0) return;
  state.selected = i;
  syncPanelControls();
  renderTabs();
  redraw();
  dragging = true;
  lastX = pos.x;
  lastY = pos.y;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const pos = eventPos(e);
  const p = state.panels[state.selected];
  const r = panelRects(state.panels.length, canvas.width, canvas.height)[state.selected];
  if (r && r.w > 0 && r.h > 0) {
    p.panX -= (pos.x - lastX) / r.w;
    p.panY -= (pos.y - lastY) / r.h;
    p.panX = Math.max(-0.5, Math.min(0.5, p.panX));
    p.panY = Math.max(-0.5, Math.min(0.5, p.panY));
  }
  lastX = pos.x;
  lastY = pos.y;
  syncPanelControls();
  redraw();
});

const endDrag = () => {
  dragging = false;
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// ---------------------------------------------------------------- wiring

zoomInput.addEventListener('input', () => {
  const v = Number(zoomInput.value) / 100;
  state.panels[state.selected].zoom = v;
  $('zoom-val').textContent = `${v.toFixed(2)}\u00d7`;
  redraw();
});
panxInput.addEventListener('input', () => {
  state.panels[state.selected].panX = Number(panxInput.value) / 100;
  $('panx-val').textContent = panxInput.value;
  redraw();
});
panyInput.addEventListener('input', () => {
  state.panels[state.selected].panY = Number(panyInput.value) / 100;
  $('pany-val').textContent = panyInput.value;
  redraw();
});

$('caption').addEventListener('input', (e) => {
  state.caption = e.target.value;
  redraw();
});

$('grain').addEventListener('change', (e) => {
  state.grain = e.target.checked;
  redraw();
});

$('fill-all').addEventListener('click', () => {
  const p = state.panels[state.selected];
  if (!p || p.photo < 0) {
    $('status').textContent = 'Add a photo first.';
    return;
  }
  const idx = p.photo;
  state.panels.forEach((q) => {
    q.photo = idx;
  });
  renderTabs();
  renderThumbs();
  redraw();
});

$('photos').addEventListener('change', (e) => {
  loadPhotos(e.target.files);
  e.target.value = '';
});

$('export-size').addEventListener('change', (e) => {
  state.exportSize = e.target.value;
  applyPreview();
});

$('export').addEventListener('click', () => {
  const s = EXPORT_SIZES[state.exportSize];
  const out = document.createElement('canvas');
  out.width = s.w;
  out.height = s.h;
  renderCover(out.getContext('2d'), s.w, s.h, state);
  out.toBlob((blob) => {
    if (!blob) {
      $('status').textContent = 'Export failed.';
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cover-${s.w}x${s.h}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
    $('status').textContent = `Saved cover-${s.w}x${s.h}.png`;
  }, 'image/png');
});

async function ensureFont() {
  try {
    await document.fonts.load('120px "Anton"');
    await document.fonts.ready;
  } catch (err) {
    // Fall back to the system sans-serif stack.
  }
}

async function init() {
  await ensureFont();
  state.panels = makePanels(5);
  bindSegments();
  renderTabs();
  syncPanelControls();
  applyPreview();

  const qs = new URLSearchParams(location.search);
  const shot = qs.get('shot');
  if (shot) {
    await runShot(shot, qs, async (sample, text) => {
      const img = await loadImage(sample);
      state.photos = [{ img, thumb: makeThumb(img, 72) }];
      state.panels.forEach((p) => {
        p.photo = 0;
      });
      state.caption = text;
      $('caption').value = text;
      renderThumbs();
      renderTabs();
      syncPanelControls();
      applyPreview();
    });
  }
  redraw();
}

init();
