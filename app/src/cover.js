// cover.js — the cover art engine.
//
// Turns a set of photos, one per sliced panel, plus a caption, into a GTA-style
// poster: diagonal sliced panels (each panel its own crop/zoom/offset), a warm
// sunset grade, palm silhouettes, a retro sun, halftone + grain print texture
// and a bold condensed caption. Everything is drawn with the 2D canvas API, no
// libraries, no network. `renderCover` draws onto any canvas at the canvas's own
// size, so the same state renders the live preview and the 1080/1350/1920 exports.

export const PANEL_MIN = 3;
export const PANEL_MAX = 5;

// The sunset palette, top to bottom (sky -> horizon). Kept as one array so the
// grade can be tuned in a single place. The magenta is kept on the rose side of
// the spectrum (rather than a hot pink) so the grade warms without turning the
// panels red.
const SKY = '#2a0e3f';
const MAGENTA = '#e0527d';
const ORANGE = '#ff8c42';
const GOLD = '#ffd166';

// How much of the canvas width the diagonal slices lean across, in a fraction.
const SLANT = 0.16;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// A tiny deterministic PRNG so the film grain (and therefore the exported
// poster) is reproducible for the same inputs, run after run.
let grainSeed = 0x9e3779b9;
const rnd = () => {
  grainSeed = (grainSeed * 1664525 + 1013904223) >>> 0;
  return grainSeed / 0xffffffff;
};

/**
 * The N diagonal strips that tile the canvas. Each is a parallelogram; adjacent
 * strips share an edge, and their union is exactly the canvas, so nothing is
 * drawn twice and no seam shows. Panel i spans boundary lines i and i+1, where
 * boundary i runs from (i*(w+s)/n - s, 0) to (i*(w+s)/n, h) with s = SLANT*w.
 * Returned as [ [x,y], [x,y], [x,y], [x,y] ] in clockwise order.
 */
export function panelLayout(w, h, n) {
  const s = w * SLANT;
  const step = (w + s) / n;
  const polys = [];
  for (let i = 0; i < n; i++) {
    const top0 = i * step - s;
    const top1 = (i + 1) * step - s;
    const bot0 = i * step;
    const bot1 = (i + 1) * step;
    polys.push([
      [top0, 0],
      [top1, 0],
      [bot1, h],
      [bot0, h],
    ]);
  }
  return polys;
}

/** Which panel index (0..n-1) the point (x, y) falls in, or -1 when off-canvas. */
export function panelAt(x, y, w, h, n) {
  if (x < 0 || x > w || y < 0 || y > h) return -1;
  if (!Number.isFinite(n) || n < 1) return -1;
  const s = w * SLANT;
  const step = (w + s) / n;
  const i = (x + s * (1 - y / h)) / step;
  return clamp(Math.floor(i), 0, n - 1);
}

/**
 * Clips to a panel's parallelogram and draws `img` cover-fit inside it, scaled
 * by zoom (>= 1) and panned by ox/oy (each in [-1, 1], a fraction of the
 * overflow in that axis). A null image falls back to a sunset placeholder.
 */
function drawPanelPhoto(ctx, img, poly, zoom, ox, oy) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (let k = 1; k < poly.length; k++) ctx.lineTo(poly[k][0], poly[k][1]);
  ctx.closePath();
  ctx.clip();
  if (img && img.naturalWidth > 0) {
    const z = Math.max(1, zoom);
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * z;
    const iw = img.naturalWidth * scale;
    const ih = img.naturalHeight * scale;
    const oxf = clamp(ox, -1, 1);
    const oyf = clamp(oy, -1, 1);
    const dx = (w - iw) / 2 + (oxf * (iw - w)) / 2;
    const dy = (h - ih) / 2 + (oyf * (ih - h)) / 2;
    ctx.drawImage(img, dx, dy, iw, ih);
  } else {
    placeholder(ctx, w, h);
  }
  ctx.restore();
}

/** A warm gradient stand-in for panels with no photo yet. */
function placeholder(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, SKY);
  g.addColorStop(0.6, MAGENTA);
  g.addColorStop(1, ORANGE);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/**
 * The warm sunset grade for one panel, clipped to its strip. A magenta/orange
 * wash in 'overlay' keeps the photo's detail while shifting its tone. The
 * overlay alpha is deliberately modest and the per-panel hue offset small, so
 * neighbouring strips read as one balanced sunset rather than a row of
 * differently-tinted frames.
 */
function gradePanel(ctx, w, h, poly, i, n, warmth) {
  const k = clamp(warmth, 0, 100) / 100;
  if (k <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (let q = 1; q < poly.length; q++) ctx.lineTo(poly[q][0], poly[q][1]);
  ctx.closePath();
  ctx.clip();

  // A small variance so neighbouring panels are not all tinted identically.
  const hue = n <= 1 ? 0 : (i / (n - 1) - 0.5) * 0.06;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, shift(SKY, hue));
  g.addColorStop(0.5, shift(MAGENTA, hue));
  g.addColorStop(0.82, shift(ORANGE, hue));
  g.addColorStop(1, shift(GOLD, hue));
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.30 + 0.22 * k;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // A deeper plum multiply along the bottom, so the strips anchor to the ground.
  const shade = ctx.createLinearGradient(0, h * 0.55, 0, h);
  shade.addColorStop(0, 'rgba(26, 10, 31, 0)');
  shade.addColorStop(1, 'rgba(26, 10, 31, 0.55)');
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.4 + 0.2 * k;
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();
}

/** Shift a #rrggbb color's hue by a small amount toward its neighbours. */
function shift(hex, t) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // A cheap warm/cool lean: push red up and blue down as t rises.
  const nr = clamp(Math.round(r + t * 40), 0, 255);
  const nb = clamp(Math.round(b - t * 40), 0, 255);
  return `rgb(${nr}, ${g}, ${nb})`;
}

/** A retro sun with horizontal slits, drawn as a soft bloom over the panels. */
function drawSun(ctx, w, h) {
  const cx = w * 0.74;
  const cy = h * 0.30;
  const r = Math.min(w, h) * 0.16;
  const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 1.6);
  g.addColorStop(0, 'rgba(255, 210, 120, 0.55)');
  g.addColorStop(1, 'rgba(255, 210, 120, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const body = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  body.addColorStop(0, '#ffe2a8');
  body.addColorStop(1, '#ff9e4a');
  ctx.fillStyle = body;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  // Horizontal slits (negative space) for the retro look.
  ctx.fillStyle = 'rgba(42, 14, 63, 0.9)';
  for (let i = 0; i < 4; i++) {
    const y = cy + (i - 1.5) * (r * 0.32);
    const sh = r * 0.045 + i * r * 0.02;
    ctx.fillRect(cx - r, y, r * 2, sh);
  }
  ctx.restore();
}

/** A palm silhouette, drawn from curves so it stays original and vector-crisp. */
function drawPalm(ctx, x, baseY, h, lean) {
  const topY = baseY - h;
  ctx.save();
  ctx.strokeStyle = '#16081d';
  ctx.fillStyle = '#16081d';
  ctx.lineCap = 'round';
  // Trunk: a gently curved taper.
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  const midX = x + lean * 0.4;
  ctx.quadraticCurveTo(midX, baseY - h * 0.55, x + lean, topY + h * 0.06);
  ctx.lineWidth = h * 0.09;
  ctx.stroke();
  // Fronds fan upward and outward from the crown, centered on the top.
  const crownX = x + lean;
  const crownY = topY + h * 0.05;
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const a = Math.PI * 1.05 + (i / (fronds - 1)) * Math.PI * 0.9;
    const len = h * 0.34;
    const tipX = crownX + Math.cos(a) * len;
    const tipY = crownY + Math.sin(a) * len;
    ctx.beginPath();
    ctx.moveTo(crownX, crownY);
    const cxm = crownX + Math.cos(a + 0.25) * len * 0.5;
    const cym = crownY + Math.sin(a + 0.25) * len * 0.5;
    ctx.quadraticCurveTo(cxm, cym, tipX, tipY);
    const cxm2 = crownX + Math.cos(a - 0.25) * len * 0.5;
    const cym2 = crownY + Math.sin(a - 0.25) * len * 0.5;
    ctx.quadraticCurveTo(cxm2, cym2, crownX, crownY);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Halftone dot grid, printed in 'overlay' for a poster-press texture. */
let halftoneCache = null;
function halftone(ctx, w, h) {
  const cell = 6;
  if (!halftoneCache) {
    const c = document.createElement('canvas');
    c.width = c.height = cell;
    const d = c.getContext('2d');
    d.fillStyle = 'rgba(255,255,255,0.5)';
    d.beginPath();
    d.arc(cell / 2, cell / 2, cell * 0.16, 0, Math.PI * 2);
    d.fill();
    halftoneCache = ctx.createPattern(c, 'repeat');
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = halftoneCache;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Film grain from a small noise tile, tiled and blended lightly. */
let grainCache = null;
function grain(ctx, w, h) {
  const cell = 128;
  if (!grainCache) {
    const c = document.createElement('canvas');
    c.width = c.height = cell;
    const d = c.getContext('2d');
    const id = d.createImageData(cell, cell);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = 110 + Math.floor(rnd() * 90);
      id.data[i] = v;
      id.data[i + 1] = v;
      id.data[i + 2] = v;
      id.data[i + 3] = 18;
    }
    d.putImageData(id, 0, 0);
    grainCache = ctx.createPattern(c, 'repeat');
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = grainCache;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** A soft vignette plus a print border, drawn over everything but the caption. */
function frame(ctx, w, h) {
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(10, 4, 16, 0)');
  v.addColorStop(1, 'rgba(10, 4, 16, 0.5)');
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  const bw = Math.max(2, Math.min(w, h) * 0.012);
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 244, 214, 0.85)';
  ctx.lineWidth = bw;
  ctx.strokeRect(bw / 2, bw / 2, w - bw, h - bw);
  ctx.strokeStyle = 'rgba(255, 244, 214, 0.28)';
  ctx.lineWidth = bw * 0.5;
  ctx.strokeRect(bw * 1.6, bw * 1.6, w - bw * 3.2, h - bw * 3.2);
  ctx.restore();
}

/**
 * Lays out the main caption as a single line, or two stacked lines when a
 * single line would have to shrink below a readable size. Returns
 * { lines: string[], size } where `size` is the largest font that fits.
 */
function layoutCaption(ctx, text, startSize, maxW, face, minSize = 6) {
  let size = startSize;
  ctx.font = `${size}px ${face}`;
  while (ctx.measureText(text).width > maxW && size > minSize) {
    size -= 1;
    ctx.font = `${size}px ${face}`;
  }
  if (ctx.measureText(text).width <= maxW) return { lines: [text], size };

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return { lines: [text], size };
  // Largest size at which some word split keeps both lines within maxW.
  for (let s = startSize; s >= minSize; s--) {
    ctx.font = `${s}px ${face}`;
    for (let split = words.length - 1; split >= 1; split--) {
      const a = words.slice(0, split).join(' ');
      const b = words.slice(split).join(' ');
      if (ctx.measureText(a).width <= maxW && ctx.measureText(b).width <= maxW) {
        return { lines: [a, b], size: s };
      }
    }
  }
  // Absolute fallback: a balanced split at the minimum size.
  const mid = Math.ceil(words.length / 2);
  return {
    lines: [words.slice(0, mid).join(' '), words.slice(mid).join(' ')],
    size: minSize,
  };
}

/** The bold caption (and an optional smaller line) along the foot of the poster. */
function drawCaption(ctx, w, h, caption, sub) {
  const main = (caption || '').trim().toUpperCase();
  const subText = (sub || '').trim().toUpperCase();
  if (!main && !subText) return;
  const face = '"Anton", "Arial Narrow", sans-serif';
  const baseline = h * 0.88;

  let mainBlockHeight = 0;
  if (main) {
    const { lines, size } = layoutCaption(ctx, main, h * 0.115, w * 0.88, face);
    const lineHeight = size * 1.06;
    mainBlockHeight = lines.length * lineHeight;
    ctx.save();
    ctx.font = `${size}px ${face}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    // Hard drop shadow, then an outline, then a cream->gold fill.
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = size * 0.12;
    ctx.shadowOffsetY = size * 0.08;
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.09;
    ctx.strokeStyle = '#1a0a1f';
    const fill = ctx.createLinearGradient(0, baseline - mainBlockHeight, 0, baseline + size * 0.2);
    fill.addColorStop(0, '#fff6e0');
    fill.addColorStop(1, '#ffd166');
    ctx.fillStyle = fill;
    lines.forEach((line, li) => {
      const y = baseline - (lines.length - 1 - li) * lineHeight;
      ctx.strokeText(line, w / 2, y);
      ctx.fillText(line, w / 2, y);
    });
    ctx.restore();
  }

  if (subText) {
    const size = fitText(ctx, subText, h * 0.052, w * 0.8, face);
    // Sit just above the caption block's top when one is present, so the two
    // never overlap no matter how long the caption is.
    const subBaseline = baseline - mainBlockHeight - size * 0.55;
    ctx.save();
    ctx.font = `${size}px ${face}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ff9e4a';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = size * 0.2;
    ctx.fillText(subText, w / 2, subBaseline);
    ctx.restore();
  }
}

/** Shrink a font size until `text` fits within `maxW`. Returns the fitted size. */
function fitText(ctx, text, startSize, maxW, face) {
  let size = startSize;
  ctx.font = `${size}px ${face}`;
  while (ctx.measureText(text).width > maxW && size > 6) {
    size -= 1;
    ctx.font = `${size}px ${face}`;
  }
  return size;
}

/**
 * Renders the whole poster onto `canvas` at its own pixel size.
 *   state.panels  [{ photo: Image|null, zoom, ox, oy }]
 *   state.caption string
 *   state.sub     string (optional smaller line)
 *   state.warmth  0..100
 */
export function renderCover(canvas, state) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
  const panels = Array.isArray(state.panels) ? state.panels : [];
  const n = clamp(panels.length, PANEL_MIN, PANEL_MAX);
  const polys = panelLayout(w, h, n);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#180b1e';
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < n; i++) {
    const p = panels[i] ?? { photo: null, zoom: 1, ox: 0, oy: 0 };
    drawPanelPhoto(ctx, p.photo, polys[i], p.zoom ?? 1, p.ox ?? 0, p.oy ?? 0);
    gradePanel(ctx, w, h, polys[i], i, n, state.warmth ?? 60);
  }

  drawSun(ctx, w, h);
  drawPalm(ctx, w * 0.08, h * 1.02, h * 0.5, w * 0.10);
  drawPalm(ctx, w * 0.94, h * 1.02, h * 0.42, -w * 0.08);
  halftone(ctx, w, h);
  grain(ctx, w, h);
  frame(ctx, w, h);
  drawCaption(ctx, w, h, state.caption, state.sub);
}
