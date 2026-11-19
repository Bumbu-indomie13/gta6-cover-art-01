// cover.js — the poster renderer for Vice Cover.
//
// Turns a list of photos (one per diagonal panel) plus a caption into a
// GTA-style cover poster. Every panel carries its own crop / zoom / offset;
// the whole canvas sits under a single warm sunset grade with palm silhouettes
// and a retro slitted sun, then halftone + film-grain print texture, a soft
// vignette, a double print border and a bold condensed caption. Pure 2D canvas
// — no libraries, no network, fully offline.
//
// renderCover paints onto whichever canvas it is handed, at that canvas's own
// pixel size, so the live preview and the 1080 / 1350 / 1920 PNG exports all
// flow through this one code path and stay composition-identical.

export const PANEL_MIN = 3;
export const PANEL_MAX = 5;

// The caption face: Anton, shipped locally under app/assets/ (OFL 1.1). The
// fallbacks keep text readable until the webfont has decoded.
const CAPTION_FACE = '"Anton", "Arial Narrow", sans-serif';

// Sunset palette, sky -> horizon. Keeping these in one place means the grade
// can be retuned without hunting through the file. The magenta stays on the
// rose side (never a hot pink) so the wash warms the art instead of reddening it.
const PALETTE = {
  sky: '#2a0e3f',
  magenta: '#e0527d',
  orange: '#ff8c42',
  gold: '#ffd166',
};

// How far the diagonal slices lean, as a fraction of the canvas width.
const SLANT = 0.16;

// The grade strength used when the caller hands none. Named so the default
// lives beside the code that reads it, not as a bare number at the call site.
const DEFAULT_WARMTH = 60;

// Composition anchors, as fractions of the canvas, so the layout is retunable
// from one place (mirroring PALETTE and SLANT above).
const SUN_X = 0.74;
const SUN_Y = 0.3;
const CAPTION_BASELINE = 0.88;
const PALM_BASE = 1.02;
const PALMS = [
  { x: 0.08, height: 0.5, lean: 0.1 },
  { x: 0.94, height: 0.42, lean: -0.08 },
];

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// A tiny deterministic PRNG (splitmix-style) so the film grain — and therefore
// the exported poster — is byte-stable for identical inputs across runs.
let grainSeed = 0x9e3779b9;
const rand01 = () => {
  grainSeed = (grainSeed * 1664525 + 1013904223) >>> 0;
  return grainSeed / 0xffffffff;
};

// ---------------------------------------------------------------------------
// Panel geometry
// ---------------------------------------------------------------------------

/**
 * The N diagonal strips that tile the canvas. Adjacent strips share an edge and
 * their union is exactly the canvas, so nothing is drawn twice and no seam can
 * show. Panel i spans boundary lines i and i+1, where boundary i runs from
 * (i*(w+s)/n - s, 0) down to (i*(w+s)/n, h) with s = SLANT * w. Each polygon is
 * returned as [[x,y], ...] in clockwise order.
 */
export function panelLayout(w, h, n) {
  if (!Number.isFinite(n) || n < 1) return [];
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

/** The panel index (0..n-1) that contains (x, y); -1 when off-canvas. */
export function panelAt(x, y, w, h, n) {
  if (x < 0 || x > w || y < 0 || y > h) return -1;
  if (!Number.isFinite(n) || n < 1) return -1;
  const s = w * SLANT;
  const step = (w + s) / n;
  const i = (x + s * (1 - y / h)) / step;
  return clamp(Math.floor(i), 0, n - 1);
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

/**
 * Clip to a panel's parallelogram and draw `img` cover-fit inside it, scaled
 * by zoom (>= 1) and panned by ox/oy (each in [-1, 1], a fraction of the
 * overflow along that axis). A missing or not-yet-decoded image falls back to a
 * sunset placeholder so a fresh poster never shows an empty strip.
 */
function drawPanelPhoto(ctx, img, poly, zoom, ox, oy) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.save();
  tracePolygon(ctx, poly);
  ctx.clip();

  if (img && img.naturalWidth > 0) {
    const z = Math.max(1, Number.isFinite(zoom) ? zoom : 1);
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * z;
    const iw = img.naturalWidth * scale;
    const ih = img.naturalHeight * scale;
    const oxf = clamp(Number.isFinite(ox) ? ox : 0, -1, 1);
    const oyf = clamp(Number.isFinite(oy) ? oy : 0, -1, 1);
    // Centre the cover-fit image, then shift by the pan fraction of the
    // overflow along each axis (the difference between the drawn and canvas
    // sizes — zero when the image fills the canvas exactly).
    const dx = (w - iw) / 2 + (oxf * (iw - w)) / 2;
    const dy = (h - ih) / 2 + (oyf * (ih - h)) / 2;
    // High-quality smoothing keeps the 1920-wide export crisp when the source
    // photo is upscaled by zoom; the preview benefits from the same setting.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, dx, dy, iw, ih);
  } else {
    drawPlaceholder(ctx, w, h);
  }

  ctx.restore();
}

/** Start a path that traces the polygon, ready for clip() or fill(). */
function tracePolygon(ctx, poly) {
  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (let k = 1; k < poly.length; k++) ctx.lineTo(poly[k][0], poly[k][1]);
  ctx.closePath();
}

/** A warm gradient stand-in for panels that have no photo yet. */
function drawPlaceholder(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, PALETTE.sky);
  g.addColorStop(0.6, PALETTE.magenta);
  g.addColorStop(1, PALETTE.orange);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// ---------------------------------------------------------------------------
// Grade
// ---------------------------------------------------------------------------

/**
 * The warm sunset grade, applied ONCE across the whole composition rather than
 * per strip. A single pass means every panel receives the identical wash, so
 * the tint stays balanced left to right (earlier builds tinted each panel
 * separately, which let the right-hand strips drift oversaturated). A magenta
 * -> orange -> gold wash in 'overlay' keeps each photo's detail while shifting
 * its tone, then a plum 'multiply' at the base anchors the ground.
 */
function applyGrade(ctx, w, h, warmth) {
  const strength = clamp(Number.isFinite(warmth) ? warmth : 0, 0, 100) / 100;
  if (strength <= 0) return;

  ctx.save();

  const wash = ctx.createLinearGradient(0, 0, 0, h);
  wash.addColorStop(0, PALETTE.sky);
  wash.addColorStop(0.5, PALETTE.magenta);
  wash.addColorStop(0.82, PALETTE.orange);
  wash.addColorStop(1, PALETTE.gold);
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.28 + 0.18 * strength;
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);

  const shade = ctx.createLinearGradient(0, h * 0.55, 0, h);
  shade.addColorStop(0, 'rgba(26, 10, 31, 0)');
  shade.addColorStop(1, 'rgba(26, 10, 31, 0.55)');
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.34 + 0.16 * strength;
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Decor: sun, palms, texture
// ---------------------------------------------------------------------------

/** A retro sun with horizontal slits, drawn as a soft bloom over the panels. */
function drawSun(ctx, w, h) {
  const cx = w * SUN_X;
  const cy = h * SUN_Y;
  const r = Math.min(w, h) * 0.16;

  // Soft outer bloom, faint enough that it lights the right side without
  // flattening the photos underneath.
  const bloom = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 1.6);
  bloom.addColorStop(0, 'rgba(255, 210, 120, 0.5)');
  bloom.addColorStop(1, 'rgba(255, 210, 120, 0)');
  ctx.fillStyle = bloom;
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

  // Horizontal slits — negative space for the retro look.
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
  const crownX = x + lean;
  const crownY = topY + h * 0.05;

  ctx.save();
  ctx.strokeStyle = '#16081d';
  ctx.fillStyle = '#16081d';
  ctx.lineCap = 'round';

  // Trunk: a gently curved taper.
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.quadraticCurveTo(x + lean * 0.4, baseY - h * 0.55, crownX, topY + h * 0.06);
  ctx.lineWidth = h * 0.09;
  ctx.stroke();

  // Fronds fan upward and outward from the crown.
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const a = Math.PI * 1.05 + (i / (fronds - 1)) * Math.PI * 0.9;
    const len = h * 0.34;
    const tipX = crownX + Math.cos(a) * len;
    const tipY = crownY + Math.sin(a) * len;

    ctx.beginPath();
    ctx.moveTo(crownX, crownY);
    ctx.quadraticCurveTo(
      crownX + Math.cos(a + 0.25) * len * 0.5,
      crownY + Math.sin(a + 0.25) * len * 0.5,
      tipX,
      tipY,
    );
    ctx.quadraticCurveTo(
      crownX + Math.cos(a - 0.25) * len * 0.5,
      crownY + Math.sin(a - 0.25) * len * 0.5,
      crownX,
      crownY,
    );
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/** Build (once) and tile a small canvas as a repeating pattern. */
function tilePattern(ctx, size, painter) {
  const tile = document.createElement('canvas');
  tile.width = tile.height = size;
  painter(tile.getContext('2d'), size);
  return ctx.createPattern(tile, 'repeat');
}

let halftonePattern = null;
/** Halftone dot grid, printed in 'overlay' for a poster-press texture. */
function drawHalftone(ctx, w, h) {
  if (!halftonePattern) {
    halftonePattern = tilePattern(ctx, 6, (d, cell) => {
      d.fillStyle = 'rgba(255,255,255,0.5)';
      d.beginPath();
      d.arc(cell / 2, cell / 2, cell * 0.16, 0, Math.PI * 2);
      d.fill();
    });
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = halftonePattern;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

let grainPattern = null;
/** Film grain from a noise tile, tiled and blended lightly. */
function drawGrain(ctx, w, h) {
  if (!grainPattern) {
    grainPattern = tilePattern(ctx, 128, (d, cell) => {
      const id = d.createImageData(cell, cell);
      for (let i = 0; i < id.data.length; i += 4) {
        const v = 110 + Math.floor(rand01() * 90);
        id.data[i] = v;
        id.data[i + 1] = v;
        id.data[i + 2] = v;
        id.data[i + 3] = 18;
      }
      d.putImageData(id, 0, 0);
    });
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = grainPattern;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Vignette + border
// ---------------------------------------------------------------------------

/** A subtle vignette darkening the corners, drawn over the art. */
function drawVignette(ctx, w, h) {
  const inner = Math.min(w, h) * 0.4;
  const outer = Math.max(w, h) * 0.75;
  const v = ctx.createRadialGradient(w / 2, h / 2, inner, w / 2, h / 2, outer);
  v.addColorStop(0, 'rgba(10, 4, 16, 0)');
  v.addColorStop(1, 'rgba(10, 4, 16, 0.42)');
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** A double cream print border framing the poster. */
function drawBorder(ctx, w, h) {
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

// ---------------------------------------------------------------------------
// Caption
// ---------------------------------------------------------------------------

/**
 * Lays out the main caption as one line, or two stacked lines when a single
 * line would have to shrink below a readable size. Returns
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

  // Largest size at which some word split keeps both lines within maxW. Among
  // the splits that fit at a size, prefer the most balanced one (closest line
  // widths) so a wrapped title reads as a centred block instead of a long first
  // line with a short tail.
  for (let s = startSize; s >= minSize; s--) {
    ctx.font = `${s}px ${face}`;
    let best = null;
    for (let split = 1; split < words.length; split++) {
      const a = words.slice(0, split).join(' ');
      const b = words.slice(split).join(' ');
      const wa = ctx.measureText(a).width;
      const wb = ctx.measureText(b).width;
      if (wa <= maxW && wb <= maxW) {
        const balance = Math.abs(wa - wb);
        if (best === null || balance < best.balance) best = { a, b, balance };
      }
    }
    if (best) return { lines: [best.a, best.b], size: s };
  }

  // Absolute fallback: a balanced split at the minimum size.
  const mid = Math.ceil(words.length / 2);
  return {
    lines: [words.slice(0, mid).join(' '), words.slice(mid).join(' ')],
    size: minSize,
  };
}

/** Shrink a font size until `text` fits within `maxW`; returns the fitted size. */
function shrinkToFit(ctx, text, startSize, maxW, face) {
  let size = startSize;
  ctx.font = `${size}px ${face}`;
  while (ctx.measureText(text).width > maxW && size > 6) {
    size -= 1;
    ctx.font = `${size}px ${face}`;
  }
  return size;
}

/** The bold caption (and an optional smaller line) along the foot of the poster. */
function drawCaption(ctx, w, h, caption, sub) {
  const main = (caption || '').trim().toUpperCase();
  const subText = (sub || '').trim().toUpperCase();
  if (!main && !subText) return;

  const face = CAPTION_FACE;
  const baseline = h * CAPTION_BASELINE;
  let mainBlockHeight = 0;

  if (main) {
    const { lines, size } = layoutCaption(ctx, main, h * 0.115, w * 0.88, face);
    const lineHeight = size * 1.06;
    mainBlockHeight = lines.length * lineHeight;

    ctx.save();
    ctx.font = `${size}px ${face}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    // Hard drop shadow, then an outline, then a cream -> gold fill.
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
    const size = shrinkToFit(ctx, subText, h * 0.052, w * 0.8, face);
    // Sit just above the caption block when one is present, so the two lines
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

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Renders the whole poster onto `canvas` at its own pixel size.
 *   state.panels  [{ photo: Image|null, zoom, ox, oy }]
 *   state.caption string
 *   state.sub     string (optional smaller line)
 *   state.warmth  0..100
 */
export function renderCover(canvas, state) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;

  const panels = Array.isArray(state.panels) ? state.panels : [];
  const n = clamp(panels.length, PANEL_MIN, PANEL_MAX);
  const polys = panelLayout(w, h, n);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#180b1e';
  ctx.fillRect(0, 0, w, h);

  // Photos first, then a single uniform grade over the whole poster.
  for (let i = 0; i < n; i++) {
    const p = panels[i] ?? { photo: null, zoom: 1, ox: 0, oy: 0 };
    drawPanelPhoto(ctx, p.photo, polys[i], p.zoom ?? 1, p.ox ?? 0, p.oy ?? 0);
  }
  applyGrade(ctx, w, h, state.warmth ?? DEFAULT_WARMTH);
  drawSun(ctx, w, h);
  for (const palm of PALMS) {
    drawPalm(ctx, w * palm.x, h * PALM_BASE, h * palm.height, w * palm.lean);
  }
  drawHalftone(ctx, w, h);
  drawGrain(ctx, w, h);
  drawVignette(ctx, w, h);
  drawBorder(ctx, w, h);
  drawCaption(ctx, w, h, state.caption, state.sub);
}
