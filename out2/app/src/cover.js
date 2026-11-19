// cover.js — draws the multi-panel GTA-style poster onto a canvas 2D context at any size.
// Everything is expressed in fractions of the canvas so one layout scales to every export size:
// the preview canvas and the full-resolution export canvas run the exact same code path.

// Panel layouts: vertical slices (fraction x and width), full height. The thin borders between
// panels are drawn, not reserved, so slices butt against each other.
const LAYOUT = {
  3: [ { x: 0.00, w: 0.40 }, { x: 0.40, w: 0.26 }, { x: 0.66, w: 0.34 } ],
  4: [ { x: 0.00, w: 0.30 }, { x: 0.30, w: 0.22 }, { x: 0.52, w: 0.24 }, { x: 0.76, w: 0.24 } ],
  5: [ { x: 0.00, w: 0.24 }, { x: 0.24, w: 0.18 }, { x: 0.42, w: 0.18 }, { x: 0.60, w: 0.20 }, { x: 0.80, w: 0.20 } ],
};

// Colour grades: a Vice City sunset ramp and a teal/pink neon ramp. `bg` paints the background
// (and the border grid), `tints` cycles per panel for its grade and its caption slice.
const GRADES = {
  sunset: {
    bg: ['#2b0a4d', '#7a1a63', '#ff5e3a', '#ffc23d'],
    tints: ['#ffa050', '#ff8c5f', '#ff7d6e', '#ff7180', '#ff6a8f'],
    glow: 'rgba(255, 130, 84, 0.20)',
    top: 'rgba(88, 28, 150, 0.42)',
    mid: 'rgba(255, 150, 100, 0.07)',
    bottom: 'rgba(255, 105, 115, 0.32)',
  },
  neon: {
    bg: ['#050014', '#101d52', '#009e94', '#ff2ea6'],
    tints: ['#00e5c3', '#ff2ea6', '#00b3ff', '#b300ff', '#00ffd5'],
    glow: 'rgba(0, 229, 195, 0.22)',
    top: 'rgba(20, 210, 210, 0.35)',
    mid: 'rgba(10, 20, 60, 0.15)',
    bottom: 'rgba(255, 40, 170, 0.50)',
  },
};

const FONT = '"Anton", "Arial Black", "Arial", sans-serif';

/** A hex colour as rgba() with an alpha. */
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** The border width in pixels for a canvas of width W. */
export function borderOf(W) {
  return Math.max(2, Math.round(W * 0.003));
}

/** The panel rectangles (outer, full-height slices) in pixels, for hit-testing. */
export function panelRects(count, W, H) {
  const slices = LAYOUT[count] ?? LAYOUT[5];
  return slices.map((s) => ({ x: s.x * W, y: 0, w: s.w * W, h: H }));
}

function drawBackground(ctx, W, H, grade) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  const stops = GRADES[grade].bg;
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.6, 0, W / 2, H * 0.6, Math.max(W, H) * 0.8);
  glow.addColorStop(0, GRADES[grade].glow);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

/** Cover-fits `img` into the box, then applies zoom (>=1) and pan (each in -0.5..0.5). */
function drawPhoto(ctx, img, x, y, w, h, zoom, panX, panY) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const pa = w / h;
  const ia = iw / ih;
  let sw;
  let sh;
  if (ia > pa) {
    sh = ih;
    sw = ih * pa;
  } else {
    sw = iw;
    sh = iw / pa;
  }
  sw /= zoom;
  sh /= zoom;
  const sx = ((iw - sw) / 2) * (1 + 2 * panX);
  const sy = ((ih - sh) / 2) * (1 + 2 * panY);
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawPlaceholder(ctx, x, y, w, h, tint) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(20, 8, 40, 0.92)');
  g.addColorStop(1, rgba(tint, 0.26));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = rgba(tint, 0.5);
  ctx.lineWidth = Math.max(1, w * 0.02);
  ctx.setLineDash([h * 0.18, h * 0.12]);
  ctx.beginPath();
  ctx.moveTo(x - h, y + h);
  ctx.lineTo(x + w + h, y - h);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.max(10, Math.min(w, h) * 0.11)}px ${FONT}`;
  ctx.fillText('ADD PHOTO', x + w / 2, y + h / 2);
  ctx.restore();
}

/** A per-panel duotone grade: the panel's tint fading to a cool dark at the foot. */
function gradePanel(ctx, x, y, w, h, tint) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalCompositeOperation = 'soft-light';
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, rgba(tint, 0.85));
  g.addColorStop(0.55, rgba(tint, 0.12));
  g.addColorStop(1, 'rgba(12, 5, 28, 0.4)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

/** A full-canvas grade laid over the assembled panels. */
function gradeGlobal(ctx, W, H, grade) {
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, GRADES[grade].top);
  g.addColorStop(0.55, GRADES[grade].mid);
  g.addColorStop(1, GRADES[grade].bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

/** Splits `text` into display lines: newlines first, then greedy word wrap to `maxWidth`. */
function fitLines(ctx, text, maxWidth) {
  const raw = text.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
  const out = [];
  for (const line of raw.length ? raw : ['']) {
    const words = line.split(/\s+/);
    if (words.length <= 1) {
      out.push(line);
      continue;
    }
    let cur = words[0];
    for (let i = 1; i < words.length; i++) {
      const next = `${cur} ${words[i]}`;
      if (ctx.measureText(next).width > maxWidth) {
        out.push(cur);
        cur = words[i];
      } else {
        cur = next;
      }
    }
    out.push(cur);
  }
  return out;
}

/** The bold caption, drawn once per panel with a clip and an alternating colour so the borders split it. */
function drawCaption(ctx, W, H, caption, count, grade) {
  const raw = (caption ?? '').trim();
  if (!raw) return;
  const tints = GRADES[grade].tints;
  const slices = LAYOUT[count] ?? LAYOUT[5];
  let size = H * 0.15;
  const font = (s) => `${s}px ${FONT}`;
  ctx.font = font(size);
  const lines = fitLines(ctx, raw.toUpperCase(), W * 0.9);
  for (;;) {
    ctx.font = font(size);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (widest <= W * 0.9 || size <= 8) break;
    size -= 2;
  }
  ctx.font = font(size);
  const lineHeight = size * 1.04;
  const blockTop = H * 0.80 - (lineHeight * (lines.length - 1)) / 2;

  // Two neon rules flanking the caption block.
  ctx.save();
  ctx.lineWidth = Math.max(2, H * 0.004);
  ctx.strokeStyle = rgba(tints[1 % tints.length], 0.9);
  ctx.beginPath();
  ctx.moveTo(W * 0.05, blockTop - size * 0.55);
  ctx.lineTo(W * 0.95, blockTop - size * 0.55);
  ctx.moveTo(W * 0.05, blockTop + (lines.length - 1) * lineHeight + size * 0.3);
  ctx.lineTo(W * 0.95, blockTop + (lines.length - 1) * lineHeight + size * 0.3);
  ctx.stroke();
  ctx.restore();

  slices.forEach((s, i) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(s.x * W, 0, s.w * W, H);
    ctx.clip();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size * 0.07);
    ctx.strokeStyle = 'rgba(8, 4, 18, 0.92)';
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : tints[i % tints.length];
    lines.forEach((line, li) => {
      const yy = blockTop + li * lineHeight;
      ctx.strokeText(line, W / 2, yy);
      ctx.fillText(line, W / 2, yy);
    });
    ctx.restore();
  });
}

/** The dark frame and a thin neon rim around every panel. */
function drawBorders(ctx, W, H, count, grade) {
  const slices = LAYOUT[count] ?? LAYOUT[5];
  const b = borderOf(W);
  const tints = GRADES[grade].tints;
  slices.forEach((s, i) => {
    const x = s.x * W;
    const w = s.w * W;
    ctx.strokeStyle = 'rgba(6, 2, 14, 0.85)';
    ctx.lineWidth = b;
    ctx.strokeRect(x + b / 2, b / 2, w - b, H - b);
    ctx.strokeStyle = rgba(tints[i % tints.length], 0.85);
    ctx.lineWidth = Math.max(1, b * 0.3);
    ctx.strokeRect(x + b, b, w - b * 2, H - b * 2);
  });
}

// A film-grain tile generated once and tiled, so it stays stable across redraws.
let grainTile = null;
function grainPattern() {
  if (grainTile) return grainTile;
  const t = 160;
  grainTile = document.createElement('canvas');
  grainTile.width = t;
  grainTile.height = t;
  const c = grainTile.getContext('2d');
  const img = c.createImageData(t, t);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 18;
  }
  c.putImageData(img, 0, 0);
  return grainTile;
}

function drawGrain(ctx, W, H) {
  const pat = ctx.createPattern(grainPattern(), 'repeat');
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/**
 * Renders the poster. `state` is
 *   { photos: [{ img: Image, thumb: string }], panels: [{ photo, zoom, panX, panY }],
 *     caption, grade: 'sunset'|'neon', grain: boolean }.
 */
export function renderCover(ctx, W, H, state) {
  const grade = GRADES[state.grade] ? state.grade : 'sunset';
  const count = LAYOUT[state.panels.length] ? state.panels.length : 5;
  const tints = GRADES[grade].tints;
  const b = borderOf(W);
  const slices = LAYOUT[count];

  drawBackground(ctx, W, H, grade);

  state.panels.forEach((panel, i) => {
    const s = slices[i] ?? slices[0];
    const x = s.x * W + b;
    const y = b;
    const w = s.w * W - 2 * b;
    const h = H - 2 * b;
    const img = state.photos[panel.photo]?.img;
    if (img && img.naturalWidth) {
      drawPhoto(ctx, img, x, y, w, h, panel.zoom, panel.panX, panel.panY);
    } else {
      drawPlaceholder(ctx, x, y, w, h, tints[i % tints.length]);
    }
    gradePanel(ctx, x, y, w, h, tints[i % tints.length]);
  });

  gradeGlobal(ctx, W, H, grade);
  drawCaption(ctx, W, H, state.caption, count, grade);
  drawBorders(ctx, W, H, count, grade);
  if (state.grain) drawGrain(ctx, W, H);
}
