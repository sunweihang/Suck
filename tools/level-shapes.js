'use strict';

/** Per-level wall sculptures. '#' is the wrapped body; other letters are accents. */

function P(id, name, paint) {
  return { id, name, paint };
}

function canvas(cols, rows) {
  return { cols, rows, g: new Array(cols * rows).fill('.') };
}

function put(c, x, y, ch) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= c.cols || y >= c.rows) return;
  c.g[y * c.cols + x] = ch;
}

function get(c, x, y) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= c.cols || y >= c.rows) return '.';
  return c.g[y * c.cols + x];
}

function box(c) {
  const px = Math.max(1, Math.round(c.cols * 0.05));
  const py = Math.max(1, Math.round(c.rows * 0.06));
  return { x0: px, y0: py, x1: c.cols - 1 - px, y1: c.rows - 1 - py };
}

function toXY(c, u, v) {
  const b = box(c);
  return [b.x0 + u * (b.x1 - b.x0), b.y0 + v * (b.y1 - b.y0)];
}

function U(u, flip) {
  return flip ? 1 - u : u;
}

function eachUV(c, fn) {
  const b = box(c);
  const w = Math.max(1e-6, b.x1 - b.x0);
  const h = Math.max(1e-6, b.y1 - b.y0);
  for (let y = 0; y < c.rows; y++) {
    for (let x = 0; x < c.cols; x++) {
      fn(x, y, (x - b.x0) / w, (y - b.y0) / h);
    }
  }
}

function fillWhere(c, ch, pred) {
  eachUV(c, (x, y, u, v) => {
    if (pred(u, v, x, y)) put(c, x, y, ch);
  });
}

function disk(c, cu, cv, ru, rv, ch) {
  const rx = Math.max(0.02, ru);
  const ry = Math.max(0.02, rv);
  fillWhere(c, ch, (u, v) => {
    const du = (u - cu) / rx;
    const dv = (v - cv) / ry;
    return du * du + dv * dv <= 1;
  });
}

function cut(c, cu, cv, ru, rv) {
  disk(c, cu, cv, ru, rv, '.');
}

function rect(c, u0, v0, u1, v1, ch) {
  const a = Math.min(u0, u1);
  const b = Math.max(u0, u1);
  const d = Math.min(v0, v1);
  const e = Math.max(v0, v1);
  fillWhere(c, ch, (u, v) => u >= a && u <= b && v >= d && v <= e);
}

function thickLine(c, u0, v0, u1, v1, r, ch) {
  const dx = u1 - u0;
  const dy = v1 - v0;
  const len = Math.hypot(dx, dy) || 1e-6;
  fillWhere(c, ch, (u, v) => {
    const t = Math.max(0, Math.min(1, ((u - u0) * dx + (v - v0) * dy) / (len * len)));
    const px = u0 + dx * t;
    const py = v0 + dy * t;
    return Math.hypot(u - px, v - py) <= r;
  });
}

function poly(c, pts, ch) {
  fillWhere(c, ch, (u, v) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0];
      const yi = pts[i][1];
      const xj = pts[j][0];
      const yj = pts[j][1];
      const hit = ((yi > v) !== (yj > v)) && (u < (xj - xi) * (v - yi) / ((yj - yi) || 1e-6) + xi);
      if (hit) inside = !inside;
    }
    return inside;
  });
}

function stemLeaf(c, flip, su, sv, leafSide = 1) {
  const s = U(su, flip);
  thickLine(c, s, sv, s, sv + 0.16, 0.028, 'T');
  disk(c, U(su + 0.13 * leafSide, flip), sv + 0.14, 0.13, 0.075, 'L');
}

function wheels(c, flip, xs, v, r) {
  for (const x of xs) cut(c, U(x, flip), v, r, r * 1.05);
}

function eyes(c, flip, xs, v, r = 0.045) {
  for (const x of xs) disk(c, U(x, flip), v, r, r * 1.1, 'E');
}

/* ---------- fruits ---------- */

function paintApple(c, flip) {
  disk(c, U(0.42, flip), 0.44, 0.34, 0.36, '#');
  disk(c, U(0.6, flip), 0.44, 0.32, 0.34, '#');
  cut(c, U(0.52, flip), 0.84, 0.12, 0.1);
  stemLeaf(c, flip, 0.5, 0.76, 1);
}

function paintBanana(c, flip) {
  fillWhere(c, '#', (u, v) => {
    const x = U(u, flip);
    const t = Math.max(0, Math.min(1, (v - 0.1) / 0.78));
    const cx = 0.16 + t * 0.58 + t * t * 0.08;
    const cy = 0.12 + t * 0.74;
    const r = 0.13 + 0.05 * Math.sin(t * Math.PI);
    return Math.hypot(x - cx, v - cy) <= r;
  });
  fillWhere(c, 'H', (u, v) => {
    const x = U(u, flip);
    const t = Math.max(0, Math.min(1, (v - 0.1) / 0.78));
    const cx = 0.2 + t * 0.52 + t * t * 0.06;
    const cy = 0.16 + t * 0.7;
    const d = Math.hypot(x - cx, v - cy);
    return d <= 0.09 && d >= 0.01;
  });
}

function paintStrawberry(c, flip) {
  poly(c, [
    [U(0.5, flip), 0.08],
    [U(0.12, flip), 0.62],
    [U(0.18, flip), 0.78],
    [U(0.82, flip), 0.78],
    [U(0.88, flip), 0.62],
  ], '#');
  disk(c, U(0.5, flip), 0.7, 0.34, 0.16, '#');
  disk(c, U(0.32, flip), 0.88, 0.12, 0.1, 'L');
  disk(c, U(0.5, flip), 0.92, 0.13, 0.11, 'L');
  disk(c, U(0.68, flip), 0.88, 0.12, 0.1, 'L');
  thickLine(c, U(0.5, flip), 0.86, U(0.5, flip), 0.98, 0.02, 'T');
  for (const [x, y] of [[0.38, 0.36], [0.58, 0.32], [0.46, 0.5], [0.62, 0.48], [0.34, 0.58]]) {
    cut(c, U(x, flip), y, 0.025, 0.02);
  }
}

function paintPear(c, flip) {
  disk(c, U(0.5, flip), 0.32, 0.32, 0.28, '#');
  disk(c, U(0.5, flip), 0.62, 0.2, 0.24, '#');
  stemLeaf(c, flip, 0.5, 0.8, 1);
}

function paintCherry(c, flip) {
  disk(c, U(0.28, flip), 0.3, 0.18, 0.18, '#');
  disk(c, U(0.72, flip), 0.28, 0.18, 0.18, '#');
  thickLine(c, U(0.28, flip), 0.46, U(0.5, flip), 0.92, 0.03, 'T');
  thickLine(c, U(0.72, flip), 0.44, U(0.5, flip), 0.92, 0.03, 'T');
  disk(c, U(0.62, flip), 0.94, 0.12, 0.07, 'L');
}

function paintOrange(c, flip) {
  disk(c, U(0.5, flip), 0.44, 0.4, 0.4, '#');
  stemLeaf(c, flip, 0.5, 0.8, 1);
  cut(c, U(0.5, flip), 0.44, 0.06, 0.05);
}

function paintGrapes(c, flip) {
  const rows = [
    [3, 0.66, 0.11],
    [4, 0.48, 0.11],
    [3, 0.30, 0.105],
    [2, 0.16, 0.10],
    [1, 0.06, 0.09],
  ];
  for (const [n, y, r] of rows) {
    const span = 0.18 * (n - 1);
    for (let i = 0; i < n; i++) {
      disk(c, U(0.5 - span / 2 + i * 0.18, flip), y, r, r * 0.94, i === 1 && n > 2 ? 'H' : '#');
    }
  }
  disk(c, U(0.64, flip), 0.88, 0.11, 0.05, 'L');
  disk(c, U(0.40, flip), 0.86, 0.07, 0.04, 'L');
  thickLine(c, U(0.50, flip), 0.64, U(0.50, flip), 0.84, 0.02, 'T');
}

function paintLemon(c, flip) {
  fillWhere(c, '#', (u, v) => {
    const x = (U(u, flip) - 0.5) / 0.22;
    const y = (v - 0.46) / 0.42;
    return x * x + y * y <= 1;
  });
  stemLeaf(c, flip, 0.5, 0.86, 1);
}

function paintWatermelon(c, flip) {
  fillWhere(c, '#', (u, v) => {
    const x = (U(u, flip) - 0.5) / 0.46;
    const y = (v - 0.12) / 0.72;
    return x * x + y * y <= 1 && v >= 0.12;
  });
  fillWhere(c, 'H', (u, v) => {
    const x = (U(u, flip) - 0.5) / 0.46;
    const y = (v - 0.12) / 0.72;
    const r = Math.hypot(x, y);
    return r <= 1 && r >= 0.78 && v >= 0.12;
  });
  for (const [x, y] of [[0.38, 0.36], [0.58, 0.32], [0.46, 0.52], [0.62, 0.5]]) {
    cut(c, U(x, flip), y, 0.03, 0.022);
  }
}

function paintPineapple(c, flip) {
  disk(c, U(0.5, flip), 0.38, 0.26, 0.34, '#');
  for (let i = 0; i < 5; i++) {
    const v = 0.18 + i * 0.1;
    thickLine(c, U(0.32, flip), v, U(0.68, flip), v + 0.06, 0.012, 'H');
  }
  for (const x of [0.38, 0.5, 0.62]) {
    thickLine(c, U(x, flip), 0.7, U(x + (x - 0.5) * 0.4, flip), 0.98, 0.035, 'L');
  }
}

/* ---------- plants ---------- */

function paintTree(c, flip) {
  rect(c, U(0.34, flip), 0.04, U(0.66, flip), 0.42, 'T');
  disk(c, U(0.5, flip), 0.08, 0.22, 0.1, 'T');
  disk(c, U(0.38, flip), 0.58, 0.26, 0.22, 'L');
  disk(c, U(0.62, flip), 0.58, 0.26, 0.22, 'L');
  disk(c, U(0.5, flip), 0.76, 0.28, 0.22, 'L');
}

function paintPine(c, flip) {
  rect(c, U(0.45, flip), 0.04, U(0.55, flip), 0.28, 'T');
  poly(c, [[U(0.5, flip), 0.96], [U(0.22, flip), 0.62], [U(0.78, flip), 0.62]], 'L');
  poly(c, [[U(0.5, flip), 0.78], [U(0.16, flip), 0.4], [U(0.84, flip), 0.4]], 'L');
  poly(c, [[U(0.5, flip), 0.52], [U(0.12, flip), 0.18], [U(0.88, flip), 0.18]], 'L');
}

function paintFlower(c, flip) {
  for (const a of [0, 60, 120, 180, 240, 300]) {
    const rad = (a * Math.PI) / 180;
    disk(c, U(0.5 + Math.cos(rad) * 0.28, flip), 0.58 + Math.sin(rad) * 0.24, 0.16, 0.14, '#');
  }
  disk(c, U(0.5, flip), 0.58, 0.14, 0.13, 'H');
  rect(c, U(0.47, flip), 0.04, U(0.53, flip), 0.4, 'T');
}

function paintCactus(c, flip) {
  rect(c, U(0.42, flip), 0.06, U(0.58, flip), 0.86, '#');
  rect(c, U(0.58, flip), 0.52, U(0.82, flip), 0.66, '#');
  rect(c, U(0.74, flip), 0.52, U(0.86, flip), 0.8, '#');
  rect(c, U(0.18, flip), 0.36, U(0.42, flip), 0.5, '#');
  rect(c, U(0.14, flip), 0.36, U(0.26, flip), 0.62, '#');
  disk(c, U(0.5, flip), 0.9, 0.1, 0.08, 'L');
}

function paintMushroom(c, flip) {
  disk(c, U(0.5, flip), 0.62, 0.4, 0.28, '#');
  fillWhere(c, '#', (u, v) => v >= 0.5 && v <= 0.72 && Math.abs(U(u, flip) - 0.5) < 0.42);
  rect(c, U(0.4, flip), 0.08, U(0.6, flip), 0.58, 'T');
  disk(c, U(0.34, flip), 0.7, 0.08, 0.06, 'H');
  disk(c, U(0.58, flip), 0.76, 0.07, 0.05, 'H');
}

function paintTulip(c, flip) {
  poly(c, [
    [U(0.5, flip), 0.96],
    [U(0.18, flip), 0.62],
    [U(0.32, flip), 0.5],
    [U(0.5, flip), 0.58],
    [U(0.68, flip), 0.5],
    [U(0.82, flip), 0.62],
  ], '#');
  rect(c, U(0.47, flip), 0.06, U(0.53, flip), 0.56, 'T');
  disk(c, U(0.28, flip), 0.28, 0.12, 0.06, 'L');
  disk(c, U(0.72, flip), 0.24, 0.12, 0.06, 'L');
}

function paintSunflower(c, flip) {
  for (const a of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const rad = (a * Math.PI) / 180;
    disk(c, U(0.5 + Math.cos(rad) * 0.26, flip), 0.62 + Math.sin(rad) * 0.22, 0.12, 0.1, '#');
  }
  disk(c, U(0.5, flip), 0.62, 0.16, 0.14, 'H');
  rect(c, U(0.47, flip), 0.06, U(0.53, flip), 0.44, 'T');
}

function paintLeaf(c, flip) {
  fillWhere(c, 'L', (u, v) => {
    const x = U(u, flip) - 0.5;
    const y = v - 0.5;
    const rx = x * 0.85 + y * 0.35;
    const ry = -x * 0.35 + y * 0.85;
    return (rx * rx) / 0.16 + (ry * ry) / 0.38 <= 1;
  });
  thickLine(c, U(0.22, flip), 0.18, U(0.72, flip), 0.82, 0.02, 'T');
}

function paintPalm(c, flip) {
  thickLine(c, U(0.48, flip), 0.06, U(0.56, flip), 0.58, 0.05, 'T');
  for (const [x, y] of [[0.22, 0.78], [0.4, 0.9], [0.62, 0.9], [0.8, 0.76]]) {
    thickLine(c, U(0.54, flip), 0.6, U(x, flip), y, 0.045, 'L');
    disk(c, U(x, flip), y, 0.1, 0.07, 'L');
  }
}

function paintClover(c, flip) {
  disk(c, U(0.32, flip), 0.62, 0.18, 0.16, 'L');
  disk(c, U(0.68, flip), 0.62, 0.18, 0.16, 'L');
  disk(c, U(0.5, flip), 0.82, 0.18, 0.16, 'L');
  disk(c, U(0.5, flip), 0.42, 0.18, 0.16, 'L');
  rect(c, U(0.47, flip), 0.06, U(0.53, flip), 0.4, 'T');
}

/* ---------- animals ---------- */

function paintCat(c, flip) {
  disk(c, U(0.5, flip), 0.38, 0.36, 0.3, '#');
  disk(c, U(0.5, flip), 0.66, 0.28, 0.24, '#');
  poly(c, [[U(0.28, flip), 0.78], [U(0.22, flip), 0.98], [U(0.4, flip), 0.82]], '#');
  poly(c, [[U(0.72, flip), 0.78], [U(0.78, flip), 0.98], [U(0.6, flip), 0.82]], '#');
  disk(c, U(0.5, flip), 0.32, 0.2, 0.18, 'H');
  eyes(c, flip, [0.4, 0.6], 0.68, 0.05);
  disk(c, U(0.5, flip), 0.58, 0.035, 0.025, 'N');
  rect(c, U(0.28, flip), 0.06, U(0.4, flip), 0.2, '#');
  rect(c, U(0.6, flip), 0.06, U(0.72, flip), 0.2, '#');
  thickLine(c, U(0.82, flip), 0.28, U(0.96, flip), 0.5, 0.04, '#');
}

function paintDog(c, flip) {
  disk(c, U(0.48, flip), 0.4, 0.34, 0.26, '#');
  disk(c, U(0.78, flip), 0.58, 0.2, 0.18, '#');
  disk(c, U(0.88, flip), 0.48, 0.1, 0.08, 'N');
  disk(c, U(0.72, flip), 0.74, 0.1, 0.14, '#');
  eyes(c, flip, [0.74], 0.6, 0.04);
  rect(c, U(0.28, flip), 0.06, U(0.4, flip), 0.22, '#');
  rect(c, U(0.56, flip), 0.06, U(0.68, flip), 0.22, '#');
  thickLine(c, U(0.18, flip), 0.4, U(0.08, flip), 0.62, 0.045, '#');
}

function paintBunny(c, flip) {
  disk(c, U(0.5, flip), 0.32, 0.3, 0.26, '#');
  disk(c, U(0.5, flip), 0.58, 0.22, 0.2, '#');
  disk(c, U(0.4, flip), 0.86, 0.08, 0.2, '#');
  disk(c, U(0.6, flip), 0.86, 0.08, 0.2, '#');
  eyes(c, flip, [0.42, 0.58], 0.6, 0.04);
  disk(c, U(0.5, flip), 0.5, 0.03, 0.025, 'N');
  rect(c, U(0.34, flip), 0.06, U(0.44, flip), 0.16, '#');
  rect(c, U(0.56, flip), 0.06, U(0.66, flip), 0.16, '#');
}

function paintChick(c, flip) {
  disk(c, U(0.5, flip), 0.36, 0.28, 0.26, '#');
  disk(c, U(0.5, flip), 0.66, 0.2, 0.2, '#');
  poly(c, [[U(0.68, flip), 0.66], [U(0.86, flip), 0.62], [U(0.68, flip), 0.56]], 'N');
  eyes(c, flip, [0.56], 0.7, 0.04);
  rect(c, U(0.4, flip), 0.06, U(0.46, flip), 0.16, 'N');
  rect(c, U(0.54, flip), 0.06, U(0.6, flip), 0.16, 'N');
}

function paintMouse(c, flip) {
  disk(c, U(0.55, flip), 0.36, 0.32, 0.24, '#');
  disk(c, U(0.78, flip), 0.48, 0.16, 0.16, '#');
  disk(c, U(0.38, flip), 0.62, 0.1, 0.1, '#');
  disk(c, U(0.58, flip), 0.66, 0.1, 0.1, '#');
  eyes(c, flip, [0.8], 0.52, 0.035);
  thickLine(c, U(0.22, flip), 0.3, U(0.06, flip), 0.18, 0.03, '#');
  rect(c, U(0.4, flip), 0.06, U(0.5, flip), 0.16, '#');
  rect(c, U(0.62, flip), 0.06, U(0.72, flip), 0.16, '#');
}

function paintFrog(c, flip) {
  disk(c, U(0.5, flip), 0.36, 0.38, 0.26, '#');
  disk(c, U(0.32, flip), 0.62, 0.12, 0.12, '#');
  disk(c, U(0.68, flip), 0.62, 0.12, 0.12, '#');
  eyes(c, flip, [0.32, 0.68], 0.64, 0.05);
  disk(c, U(0.22, flip), 0.16, 0.12, 0.08, '#');
  disk(c, U(0.78, flip), 0.16, 0.12, 0.08, '#');
}

function paintOwl(c, flip) {
  disk(c, U(0.5, flip), 0.42, 0.3, 0.38, '#');
  disk(c, U(0.36, flip), 0.72, 0.12, 0.12, '#');
  disk(c, U(0.64, flip), 0.72, 0.12, 0.12, '#');
  eyes(c, flip, [0.36, 0.64], 0.7, 0.07);
  poly(c, [[U(0.5, flip), 0.52], [U(0.42, flip), 0.42], [U(0.58, flip), 0.42]], 'N');
}

function paintFox(c, flip) {
  disk(c, U(0.5, flip), 0.36, 0.32, 0.26, '#');
  disk(c, U(0.5, flip), 0.64, 0.24, 0.2, '#');
  poly(c, [[U(0.3, flip), 0.78], [U(0.18, flip), 0.98], [U(0.42, flip), 0.8]], '#');
  poly(c, [[U(0.7, flip), 0.78], [U(0.82, flip), 0.98], [U(0.58, flip), 0.8]], '#');
  eyes(c, flip, [0.4, 0.6], 0.66, 0.04);
  disk(c, U(0.5, flip), 0.54, 0.08, 0.05, 'N');
  thickLine(c, U(0.8, flip), 0.28, U(0.96, flip), 0.2, 0.04, '#');
  rect(c, U(0.32, flip), 0.06, U(0.42, flip), 0.16, '#');
  rect(c, U(0.58, flip), 0.06, U(0.68, flip), 0.16, '#');
}

function paintPig(c, flip) {
  disk(c, U(0.5, flip), 0.4, 0.36, 0.28, '#');
  disk(c, U(0.78, flip), 0.48, 0.16, 0.14, '#');
  disk(c, U(0.8, flip), 0.44, 0.08, 0.06, 'N');
  disk(c, U(0.38, flip), 0.68, 0.08, 0.08, '#');
  disk(c, U(0.58, flip), 0.7, 0.08, 0.08, '#');
  eyes(c, flip, [0.74], 0.54, 0.035);
  rect(c, U(0.3, flip), 0.06, U(0.4, flip), 0.18, '#');
  rect(c, U(0.58, flip), 0.06, U(0.68, flip), 0.18, '#');
}

function paintBear(c, flip) {
  disk(c, U(0.5, flip), 0.38, 0.36, 0.3, '#');
  disk(c, U(0.5, flip), 0.66, 0.26, 0.22, '#');
  disk(c, U(0.3, flip), 0.84, 0.1, 0.1, '#');
  disk(c, U(0.7, flip), 0.84, 0.1, 0.1, '#');
  eyes(c, flip, [0.4, 0.6], 0.68, 0.045);
  disk(c, U(0.5, flip), 0.56, 0.07, 0.05, 'N');
  rect(c, U(0.3, flip), 0.06, U(0.42, flip), 0.18, '#');
  rect(c, U(0.58, flip), 0.06, U(0.7, flip), 0.18, '#');
}

/* ---------- vehicles ---------- */

function paintCar(c, flip) {
  rect(c, U(0.08, flip), 0.22, U(0.92, flip), 0.5, '#');
  poly(c, [
    [U(0.22, flip), 0.5],
    [U(0.34, flip), 0.78],
    [U(0.7, flip), 0.78],
    [U(0.84, flip), 0.5],
  ], 'H');
  rect(c, U(0.36, flip), 0.54, U(0.68, flip), 0.74, 'E');
  wheels(c, flip, [0.26, 0.74], 0.2, 0.11);
}

function paintBus(c, flip) {
  rect(c, U(0.06, flip), 0.2, U(0.94, flip), 0.78, '#');
  for (const x of [0.2, 0.38, 0.56, 0.74]) rect(c, U(x, flip), 0.5, U(x + 0.12, flip), 0.7, 'E');
  wheels(c, flip, [0.22, 0.78], 0.18, 0.1);
}

function paintTrain(c, flip) {
  rect(c, U(0.06, flip), 0.22, U(0.48, flip), 0.72, '#');
  rect(c, U(0.52, flip), 0.22, U(0.94, flip), 0.64, '#');
  rect(c, U(0.16, flip), 0.48, U(0.38, flip), 0.66, 'E');
  rect(c, U(0.6, flip), 0.42, U(0.86, flip), 0.58, 'E');
  rect(c, U(0.2, flip), 0.72, U(0.3, flip), 0.9, 'T');
  wheels(c, flip, [0.18, 0.38, 0.64, 0.84], 0.18, 0.08);
}

function paintPlane(c, flip) {
  disk(c, U(0.5, flip), 0.5, 0.42, 0.12, '#');
  rect(c, U(0.12, flip), 0.44, U(0.88, flip), 0.56, '#');
  rect(c, U(0.32, flip), 0.22, U(0.68, flip), 0.78, '#');
  poly(c, [[U(0.86, flip), 0.5], [U(0.98, flip), 0.62], [U(0.98, flip), 0.38]], '#');
  disk(c, U(0.22, flip), 0.5, 0.06, 0.05, 'E');
}

function paintBoat(c, flip) {
  poly(c, [
    [U(0.08, flip), 0.38],
    [U(0.92, flip), 0.38],
    [U(0.78, flip), 0.16],
    [U(0.22, flip), 0.16],
  ], '#');
  poly(c, [
    [U(0.5, flip), 0.38],
    [U(0.5, flip), 0.92],
    [U(0.78, flip), 0.38],
  ], 'H');
  rect(c, U(0.48, flip), 0.38, U(0.52, flip), 0.92, 'T');
}

function paintRocket(c, flip) {
  poly(c, [[U(0.5, flip), 0.98], [U(0.32, flip), 0.7], [U(0.68, flip), 0.7]], '#');
  rect(c, U(0.34, flip), 0.22, U(0.66, flip), 0.72, '#');
  disk(c, U(0.5, flip), 0.52, 0.08, 0.08, 'E');
  poly(c, [[U(0.34, flip), 0.28], [U(0.18, flip), 0.08], [U(0.34, flip), 0.16]], 'H');
  poly(c, [[U(0.66, flip), 0.28], [U(0.82, flip), 0.08], [U(0.66, flip), 0.16]], 'H');
  disk(c, U(0.5, flip), 0.14, 0.1, 0.1, 'N');
}

function paintBike(c, flip) {
  cut(c, U(0.26, flip), 0.28, 0.16, 0.16);
  disk(c, U(0.26, flip), 0.28, 0.16, 0.16, '#');
  cut(c, U(0.26, flip), 0.28, 0.1, 0.1);
  disk(c, U(0.74, flip), 0.28, 0.16, 0.16, '#');
  cut(c, U(0.74, flip), 0.28, 0.1, 0.1);
  thickLine(c, U(0.26, flip), 0.28, U(0.5, flip), 0.62, 0.035, 'T');
  thickLine(c, U(0.74, flip), 0.28, U(0.52, flip), 0.7, 0.035, 'T');
  thickLine(c, U(0.5, flip), 0.62, U(0.72, flip), 0.72, 0.03, 'T');
  disk(c, U(0.5, flip), 0.72, 0.08, 0.06, '#');
}

function paintTruck(c, flip) {
  rect(c, U(0.06, flip), 0.22, U(0.62, flip), 0.7, '#');
  rect(c, U(0.62, flip), 0.22, U(0.94, flip), 0.52, '#');
  rect(c, U(0.7, flip), 0.36, U(0.88, flip), 0.5, 'E');
  wheels(c, flip, [0.22, 0.48, 0.8], 0.18, 0.1);
}

function paintHelicopter(c, flip) {
  disk(c, U(0.48, flip), 0.42, 0.3, 0.18, '#');
  rect(c, U(0.7, flip), 0.38, U(0.96, flip), 0.48, '#');
  rect(c, U(0.08, flip), 0.7, U(0.9, flip), 0.78, 'T');
  rect(c, U(0.46, flip), 0.48, U(0.52, flip), 0.72, 'T');
  rect(c, U(0.36, flip), 0.36, U(0.56, flip), 0.5, 'E');
  rect(c, U(0.4, flip), 0.16, U(0.6, flip), 0.26, '#');
}

function paintTaxi(c, flip) {
  paintCar(c, flip);
  rect(c, U(0.42, flip), 0.78, U(0.58, flip), 0.88, 'H');
}

/* ---------- animals 2 ---------- */

function paintElephant(c, flip) {
  disk(c, U(0.48, flip), 0.42, 0.34, 0.3, '#');
  disk(c, U(0.72, flip), 0.58, 0.18, 0.18, '#');
  thickLine(c, U(0.86, flip), 0.5, U(0.78, flip), 0.16, 0.055, 'N');
  disk(c, U(0.3, flip), 0.74, 0.12, 0.14, 'H');
  disk(c, U(0.58, flip), 0.78, 0.1, 0.12, 'H');
  eyes(c, flip, [0.78], 0.64, 0.04);
  rect(c, U(0.28, flip), 0.06, U(0.4, flip), 0.2, '#');
  rect(c, U(0.52, flip), 0.06, U(0.64, flip), 0.2, '#');
}

function paintGiraffe(c, flip) {
  rect(c, U(0.42, flip), 0.06, U(0.52, flip), 0.36, '#');
  rect(c, U(0.56, flip), 0.06, U(0.66, flip), 0.36, '#');
  disk(c, U(0.56, flip), 0.42, 0.2, 0.16, '#');
  rect(c, U(0.62, flip), 0.42, U(0.7, flip), 0.88, '#');
  disk(c, U(0.72, flip), 0.9, 0.12, 0.1, '#');
  eyes(c, flip, [0.76], 0.9, 0.03);
  disk(c, U(0.68, flip), 0.98, 0.03, 0.04, 'N');
  disk(c, U(0.48, flip), 0.5, 0.05, 0.04, 'H');
  disk(c, U(0.6, flip), 0.36, 0.05, 0.04, 'H');
}

function paintPenguin(c, flip) {
  disk(c, U(0.5, flip), 0.44, 0.26, 0.4, '#');
  disk(c, U(0.5, flip), 0.4, 0.16, 0.28, 'H');
  disk(c, U(0.5, flip), 0.8, 0.16, 0.14, '#');
  eyes(c, flip, [0.42, 0.58], 0.82, 0.035);
  poly(c, [[U(0.5, flip), 0.74], [U(0.42, flip), 0.66], [U(0.58, flip), 0.66]], 'N');
  disk(c, U(0.32, flip), 0.12, 0.1, 0.06, 'N');
  disk(c, U(0.68, flip), 0.12, 0.1, 0.06, 'N');
}

function paintDuck(c, flip) {
  disk(c, U(0.42, flip), 0.34, 0.3, 0.22, '#');
  disk(c, U(0.7, flip), 0.56, 0.16, 0.16, '#');
  poly(c, [[U(0.84, flip), 0.56], [U(0.98, flip), 0.52], [U(0.84, flip), 0.46]], 'N');
  eyes(c, flip, [0.74], 0.6, 0.035);
  rect(c, U(0.3, flip), 0.08, U(0.4, flip), 0.16, 'N');
  rect(c, U(0.48, flip), 0.08, U(0.58, flip), 0.16, 'N');
}

function paintHorse(c, flip) {
  disk(c, U(0.46, flip), 0.4, 0.28, 0.2, '#');
  rect(c, U(0.62, flip), 0.4, U(0.7, flip), 0.78, '#');
  disk(c, U(0.76, flip), 0.82, 0.14, 0.12, '#');
  thickLine(c, U(0.28, flip), 0.42, U(0.12, flip), 0.28, 0.04, '#');
  eyes(c, flip, [0.8], 0.84, 0.03);
  rect(c, U(0.32, flip), 0.06, U(0.42, flip), 0.24, '#');
  rect(c, U(0.52, flip), 0.06, U(0.62, flip), 0.24, '#');
}

function paintCow(c, flip) {
  disk(c, U(0.48, flip), 0.4, 0.32, 0.24, '#');
  disk(c, U(0.76, flip), 0.58, 0.16, 0.16, '#');
  disk(c, U(0.36, flip), 0.64, 0.08, 0.1, '#');
  disk(c, U(0.56, flip), 0.66, 0.08, 0.1, '#');
  eyes(c, flip, [0.8], 0.62, 0.035);
  disk(c, U(0.88, flip), 0.5, 0.06, 0.05, 'N');
  disk(c, U(0.4, flip), 0.46, 0.07, 0.06, 'H');
  disk(c, U(0.58, flip), 0.32, 0.06, 0.05, 'H');
  rect(c, U(0.3, flip), 0.06, U(0.4, flip), 0.2, '#');
  rect(c, U(0.54, flip), 0.06, U(0.64, flip), 0.2, '#');
}

function paintHedgehog(c, flip) {
  disk(c, U(0.48, flip), 0.36, 0.34, 0.26, '#');
  fillWhere(c, 'H', (u, v) => {
    const x = U(u, flip);
    const dx = (x - 0.46) / 0.36;
    const dy = (v - 0.5) / 0.28;
    return dx * dx + dy * dy <= 1 && v > 0.4 && (Math.round(x * 18 + v * 10) % 2 === 0);
  });
  disk(c, U(0.78, flip), 0.34, 0.12, 0.1, '#');
  eyes(c, flip, [0.8], 0.36, 0.03);
  rect(c, U(0.3, flip), 0.08, U(0.4, flip), 0.16, '#');
  rect(c, U(0.52, flip), 0.08, U(0.62, flip), 0.16, '#');
}

function paintSnail(c, flip) {
  disk(c, U(0.4, flip), 0.52, 0.26, 0.28, '#');
  disk(c, U(0.4, flip), 0.52, 0.12, 0.12, 'H');
  disk(c, U(0.72, flip), 0.28, 0.22, 0.14, '#');
  thickLine(c, U(0.82, flip), 0.36, U(0.88, flip), 0.62, 0.03, '#');
  eyes(c, flip, [0.86, 0.92], 0.66, 0.03);
}

function paintPanda(c, flip) {
  paintBear(c, flip);
  disk(c, U(0.38, flip), 0.7, 0.08, 0.08, 'E');
  disk(c, U(0.62, flip), 0.7, 0.08, 0.08, 'E');
}

function paintButterfly(c, flip) {
  disk(c, U(0.28, flip), 0.68, 0.22, 0.22, '#');
  disk(c, U(0.72, flip), 0.68, 0.22, 0.22, '#');
  disk(c, U(0.26, flip), 0.32, 0.2, 0.2, 'H');
  disk(c, U(0.74, flip), 0.32, 0.2, 0.2, 'H');
  rect(c, U(0.48, flip), 0.2, U(0.52, flip), 0.82, 'T');
  disk(c, U(0.5, flip), 0.86, 0.05, 0.05, 'T');
}

/* ---------- food ---------- */

function paintIcecream(c, flip) {
  disk(c, U(0.5, flip), 0.68, 0.26, 0.22, '#');
  disk(c, U(0.38, flip), 0.72, 0.14, 0.12, 'H');
  disk(c, U(0.62, flip), 0.74, 0.14, 0.12, 'L');
  poly(c, [[U(0.28, flip), 0.56], [U(0.72, flip), 0.56], [U(0.5, flip), 0.06]], 'N');
}

function paintCupcake(c, flip) {
  disk(c, U(0.5, flip), 0.62, 0.3, 0.2, '#');
  poly(c, [
    [U(0.28, flip), 0.52],
    [U(0.72, flip), 0.52],
    [U(0.64, flip), 0.16],
    [U(0.36, flip), 0.16],
  ], 'T');
  for (const x of [0.34, 0.46, 0.58, 0.66]) rect(c, U(x, flip), 0.28, U(x + 0.04, flip), 0.48, 'H');
  disk(c, U(0.5, flip), 0.82, 0.06, 0.06, 'L');
}

function paintDonut(c, flip) {
  disk(c, U(0.5, flip), 0.5, 0.36, 0.32, '#');
  cut(c, U(0.5, flip), 0.5, 0.14, 0.12);
  fillWhere(c, 'H', (u, v) => {
    const x = (U(u, flip) - 0.5) / 0.36;
    const y = (v - 0.5) / 0.32;
    const r = Math.hypot(x, y);
    return r <= 1 && r >= 0.72;
  });
}

function paintCake(c, flip) {
  rect(c, U(0.16, flip), 0.12, U(0.84, flip), 0.4, '#');
  rect(c, U(0.2, flip), 0.4, U(0.8, flip), 0.64, 'H');
  rect(c, U(0.26, flip), 0.64, U(0.74, flip), 0.82, 'L');
  rect(c, U(0.48, flip), 0.82, U(0.52, flip), 0.96, 'T');
  disk(c, U(0.5, flip), 0.98, 0.04, 0.04, 'N');
}

function paintCandy(c, flip) {
  disk(c, U(0.5, flip), 0.5, 0.22, 0.2, '#');
  poly(c, [[U(0.28, flip), 0.5], [U(0.06, flip), 0.72], [U(0.06, flip), 0.28]], 'H');
  poly(c, [[U(0.72, flip), 0.5], [U(0.94, flip), 0.72], [U(0.94, flip), 0.28]], 'H');
  rect(c, U(0.36, flip), 0.42, U(0.64, flip), 0.58, 'L');
}

function paintLollipop(c, flip) {
  disk(c, U(0.5, flip), 0.68, 0.26, 0.24, '#');
  disk(c, U(0.5, flip), 0.68, 0.12, 0.11, 'H');
  rect(c, U(0.47, flip), 0.06, U(0.53, flip), 0.48, 'T');
}

function paintPopcorn(c, flip) {
  disk(c, U(0.36, flip), 0.72, 0.16, 0.14, '#');
  disk(c, U(0.54, flip), 0.8, 0.16, 0.14, '#');
  disk(c, U(0.68, flip), 0.7, 0.15, 0.13, '#');
  poly(c, [
    [U(0.28, flip), 0.62],
    [U(0.74, flip), 0.62],
    [U(0.68, flip), 0.12],
    [U(0.34, flip), 0.12],
  ], 'H');
  for (const x of [0.36, 0.48, 0.6]) rect(c, U(x, flip), 0.2, U(x + 0.05, flip), 0.56, 'T');
}

function paintBread(c, flip) {
  disk(c, U(0.5, flip), 0.42, 0.4, 0.28, '#');
  disk(c, U(0.32, flip), 0.58, 0.12, 0.08, 'H');
  disk(c, U(0.5, flip), 0.62, 0.12, 0.08, 'H');
  disk(c, U(0.68, flip), 0.56, 0.12, 0.08, 'H');
}

function paintPretzel(c, flip) {
  disk(c, U(0.32, flip), 0.62, 0.2, 0.2, '#');
  disk(c, U(0.68, flip), 0.62, 0.2, 0.2, '#');
  disk(c, U(0.5, flip), 0.32, 0.22, 0.18, '#');
  cut(c, U(0.32, flip), 0.62, 0.08, 0.08);
  cut(c, U(0.68, flip), 0.62, 0.08, 0.08);
  cut(c, U(0.5, flip), 0.32, 0.08, 0.07);
  thickLine(c, U(0.4, flip), 0.5, U(0.6, flip), 0.5, 0.04, '#');
}

function paintHotdog(c, flip) {
  disk(c, U(0.5, flip), 0.42, 0.44, 0.18, '#');
  disk(c, U(0.5, flip), 0.5, 0.4, 0.1, 'H');
  thickLine(c, U(0.22, flip), 0.56, U(0.78, flip), 0.36, 0.02, 'L');
}

/* ---------- sea ---------- */

function paintFish(c, flip) {
  disk(c, U(0.46, flip), 0.5, 0.32, 0.22, '#');
  poly(c, [[U(0.16, flip), 0.5], [U(0.0, flip), 0.72], [U(0.0, flip), 0.28]], '#');
  disk(c, U(0.44, flip), 0.46, 0.16, 0.12, 'H');
  eyes(c, flip, [0.68], 0.54, 0.045);
  disk(c, U(0.46, flip), 0.72, 0.1, 0.08, '#');
}

function paintWhale(c, flip) {
  disk(c, U(0.46, flip), 0.4, 0.4, 0.22, '#');
  poly(c, [[U(0.12, flip), 0.42], [U(0.0, flip), 0.7], [U(0.16, flip), 0.58]], '#');
  rect(c, U(0.72, flip), 0.42, U(0.92, flip), 0.72, '#');
  eyes(c, flip, [0.72], 0.48, 0.04);
  disk(c, U(0.4, flip), 0.22, 0.08, 0.05, 'H');
}

function paintTurtle(c, flip) {
  disk(c, U(0.5, flip), 0.48, 0.3, 0.24, '#');
  disk(c, U(0.5, flip), 0.48, 0.18, 0.14, 'H');
  disk(c, U(0.78, flip), 0.5, 0.12, 0.1, '#');
  disk(c, U(0.22, flip), 0.36, 0.1, 0.08, '#');
  disk(c, U(0.78, flip), 0.3, 0.1, 0.08, '#');
  disk(c, U(0.32, flip), 0.22, 0.1, 0.08, '#');
  disk(c, U(0.62, flip), 0.22, 0.1, 0.08, '#');
  eyes(c, flip, [0.84], 0.54, 0.03);
}

function paintCrab(c, flip) {
  disk(c, U(0.5, flip), 0.42, 0.28, 0.2, '#');
  thickLine(c, U(0.22, flip), 0.5, U(0.08, flip), 0.72, 0.045, '#');
  thickLine(c, U(0.78, flip), 0.5, U(0.92, flip), 0.72, 0.045, '#');
  disk(c, U(0.06, flip), 0.76, 0.08, 0.08, '#');
  disk(c, U(0.94, flip), 0.76, 0.08, 0.08, '#');
  for (const x of [0.32, 0.44, 0.56, 0.68]) {
    thickLine(c, U(x, flip), 0.28, U(x, flip), 0.1, 0.02, '#');
  }
  eyes(c, flip, [0.4, 0.6], 0.52, 0.04);
}

function paintSeahorse(c, flip) {
  disk(c, U(0.58, flip), 0.78, 0.14, 0.14, '#');
  thickLine(c, U(0.52, flip), 0.68, U(0.4, flip), 0.36, 0.07, '#');
  thickLine(c, U(0.4, flip), 0.36, U(0.56, flip), 0.16, 0.06, '#');
  disk(c, U(0.7, flip), 0.8, 0.06, 0.04, 'N');
  eyes(c, flip, [0.62], 0.82, 0.03);
  disk(c, U(0.36, flip), 0.5, 0.08, 0.1, 'H');
}

function paintOctopus(c, flip) {
  disk(c, U(0.5, flip), 0.62, 0.28, 0.22, '#');
  eyes(c, flip, [0.4, 0.6], 0.66, 0.05);
  for (const [x0, x1] of [[0.22, 0.1], [0.38, 0.22], [0.54, 0.4], [0.7, 0.58], [0.84, 0.78]]) {
    thickLine(c, U(x0 + 0.08, flip), 0.46, U(x1, flip), 0.08, 0.045, '#');
  }
}

function paintStarfish(c, flip) {
  fillWhere(c, '#', (u, v) => {
    const x = U(u, flip) - 0.5;
    const y = v - 0.5;
    const ang = Math.atan2(y, x);
    const r = Math.hypot(x, y);
    const a = ((ang + Math.PI) / (Math.PI * 2)) * 5;
    const f = Math.abs(a - Math.floor(a) - 0.5) * 2;
    return r <= 0.16 + 0.34 * (1 - f);
  });
  disk(c, U(0.5, flip), 0.5, 0.08, 0.08, 'H');
}

function paintJellyfish(c, flip) {
  disk(c, U(0.5, flip), 0.68, 0.3, 0.2, '#');
  fillWhere(c, '#', (u, v) => v >= 0.58 && v <= 0.72 && Math.abs(U(u, flip) - 0.5) < 0.3);
  for (const x of [0.32, 0.44, 0.56, 0.68]) {
    thickLine(c, U(x, flip), 0.56, U(x + (x - 0.5) * 0.2, flip), 0.1, 0.03, 'H');
  }
}

function paintDolphin(c, flip) {
  disk(c, U(0.48, flip), 0.42, 0.36, 0.18, '#');
  poly(c, [[U(0.16, flip), 0.42], [U(0.02, flip), 0.64], [U(0.18, flip), 0.52]], '#');
  poly(c, [[U(0.5, flip), 0.56], [U(0.42, flip), 0.78], [U(0.6, flip), 0.56]], '#');
  eyes(c, flip, [0.72], 0.46, 0.035);
}

function paintSubmarine(c, flip) {
  disk(c, U(0.5, flip), 0.4, 0.4, 0.18, '#');
  rect(c, U(0.42, flip), 0.52, U(0.62, flip), 0.72, '#');
  rect(c, U(0.5, flip), 0.72, U(0.54, flip), 0.9, 'T');
  disk(c, U(0.28, flip), 0.42, 0.06, 0.06, 'E');
  disk(c, U(0.42, flip), 0.42, 0.06, 0.06, 'E');
  disk(c, U(0.72, flip), 0.4, 0.05, 0.05, 'E');
}

/* ---------- objects ---------- */

function paintHouse(c, flip) {
  rect(c, U(0.18, flip), 0.08, U(0.82, flip), 0.52, '#');
  poly(c, [[U(0.1, flip), 0.52], [U(0.5, flip), 0.92], [U(0.9, flip), 0.52]], 'T');
  rect(c, U(0.42, flip), 0.08, U(0.58, flip), 0.36, 'N');
  rect(c, U(0.24, flip), 0.3, U(0.36, flip), 0.44, 'E');
  rect(c, U(0.64, flip), 0.3, U(0.76, flip), 0.44, 'E');
}

function paintCastle(c, flip) {
  rect(c, U(0.16, flip), 0.08, U(0.84, flip), 0.62, '#');
  rect(c, U(0.12, flip), 0.5, U(0.28, flip), 0.86, '#');
  rect(c, U(0.72, flip), 0.5, U(0.88, flip), 0.86, '#');
  rect(c, U(0.4, flip), 0.62, U(0.6, flip), 0.8, '#');
  rect(c, U(0.44, flip), 0.08, U(0.56, flip), 0.36, 'N');
  rect(c, U(0.22, flip), 0.36, U(0.32, flip), 0.5, 'E');
  rect(c, U(0.68, flip), 0.36, U(0.78, flip), 0.5, 'E');
}

function paintCrown(c, flip) {
  poly(c, [
    [U(0.08, flip), 0.28],
    [U(0.2, flip), 0.82],
    [U(0.36, flip), 0.48],
    [U(0.5, flip), 0.92],
    [U(0.64, flip), 0.48],
    [U(0.8, flip), 0.82],
    [U(0.92, flip), 0.28],
  ], '#');
  rect(c, U(0.1, flip), 0.16, U(0.9, flip), 0.32, '#');
  disk(c, U(0.2, flip), 0.84, 0.05, 0.05, 'H');
  disk(c, U(0.5, flip), 0.94, 0.06, 0.06, 'H');
  disk(c, U(0.8, flip), 0.84, 0.05, 0.05, 'H');
}

function paintGift(c, flip) {
  rect(c, U(0.2, flip), 0.1, U(0.8, flip), 0.7, '#');
  rect(c, U(0.46, flip), 0.1, U(0.54, flip), 0.7, 'R');
  rect(c, U(0.2, flip), 0.36, U(0.8, flip), 0.46, 'R');
  disk(c, U(0.4, flip), 0.8, 0.12, 0.1, 'R');
  disk(c, U(0.6, flip), 0.8, 0.12, 0.1, 'R');
}

function paintBalloon(c, flip) {
  disk(c, U(0.5, flip), 0.62, 0.28, 0.32, '#');
  disk(c, U(0.4, flip), 0.72, 0.08, 0.1, 'H');
  poly(c, [[U(0.44, flip), 0.32], [U(0.56, flip), 0.32], [U(0.5, flip), 0.22]], '#');
  thickLine(c, U(0.5, flip), 0.22, U(0.46, flip), 0.06, 0.02, 'T');
}

function paintUmbrella(c, flip) {
  disk(c, U(0.5, flip), 0.42, 0.42, 0.32, '#');
  fillWhere(c, '.', (u, v) => v < 0.42);
  rect(c, U(0.48, flip), 0.08, U(0.52, flip), 0.5, 'T');
  disk(c, U(0.6, flip), 0.12, 0.08, 0.05, 'T');
}

function paintGuitar(c, flip) {
  disk(c, U(0.38, flip), 0.32, 0.22, 0.2, '#');
  disk(c, U(0.5, flip), 0.48, 0.16, 0.16, '#');
  cut(c, U(0.4, flip), 0.34, 0.07, 0.06);
  thickLine(c, U(0.58, flip), 0.56, U(0.86, flip), 0.9, 0.04, 'T');
  rect(c, U(0.8, flip), 0.84, U(0.94, flip), 0.96, 'H');
}

function paintTeapot(c, flip) {
  disk(c, U(0.48, flip), 0.42, 0.3, 0.26, '#');
  disk(c, U(0.48, flip), 0.7, 0.1, 0.08, 'T');
  thickLine(c, U(0.76, flip), 0.5, U(0.92, flip), 0.62, 0.04, '#');
  thickLine(c, U(0.18, flip), 0.36, U(0.18, flip), 0.56, 0.035, '#');
  thickLine(c, U(0.18, flip), 0.56, U(0.3, flip), 0.56, 0.03, '#');
}

function paintBell(c, flip) {
  disk(c, U(0.5, flip), 0.62, 0.18, 0.16, '#');
  poly(c, [[U(0.32, flip), 0.62], [U(0.68, flip), 0.62], [U(0.8, flip), 0.22], [U(0.2, flip), 0.22]], '#');
  disk(c, U(0.5, flip), 0.16, 0.07, 0.07, 'H');
  rect(c, U(0.47, flip), 0.76, U(0.53, flip), 0.9, 'T');
}

function paintKey(c, flip) {
  disk(c, U(0.24, flip), 0.5, 0.18, 0.18, '#');
  cut(c, U(0.24, flip), 0.5, 0.07, 0.07);
  rect(c, U(0.36, flip), 0.44, U(0.88, flip), 0.56, '#');
  rect(c, U(0.72, flip), 0.28, U(0.8, flip), 0.44, '#');
  rect(c, U(0.82, flip), 0.32, U(0.9, flip), 0.44, '#');
}

/* ---------- sky ---------- */

function paintBird(c, flip) {
  disk(c, U(0.5, flip), 0.42, 0.22, 0.16, '#');
  poly(c, [[U(0.28, flip), 0.42], [U(0.04, flip), 0.62], [U(0.2, flip), 0.36]], '#');
  poly(c, [[U(0.72, flip), 0.42], [U(0.96, flip), 0.64], [U(0.78, flip), 0.36]], '#');
  disk(c, U(0.66, flip), 0.5, 0.1, 0.1, '#');
  poly(c, [[U(0.76, flip), 0.5], [U(0.9, flip), 0.46], [U(0.76, flip), 0.42]], 'N');
  eyes(c, flip, [0.68], 0.54, 0.03);
}

function paintSun(c, flip) {
  disk(c, U(0.5, flip), 0.5, 0.26, 0.26, '#');
  for (const a of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const rad = (a * Math.PI) / 180;
    thickLine(
      c,
      U(0.5 + Math.cos(rad) * 0.3, flip),
      0.5 + Math.sin(rad) * 0.3,
      U(0.5 + Math.cos(rad) * 0.48, flip),
      0.5 + Math.sin(rad) * 0.48,
      0.04,
      'H',
    );
  }
}

function paintMoon(c, flip) {
  disk(c, U(0.52, flip), 0.5, 0.32, 0.34, '#');
  cut(c, U(0.7, flip), 0.58, 0.24, 0.26);
}

function paintCloud(c, flip) {
  disk(c, U(0.32, flip), 0.42, 0.22, 0.18, '#');
  disk(c, U(0.5, flip), 0.54, 0.26, 0.2, '#');
  disk(c, U(0.7, flip), 0.42, 0.22, 0.18, '#');
  disk(c, U(0.5, flip), 0.32, 0.3, 0.16, '#');
}

function paintStar(c, flip) {
  fillWhere(c, '#', (u, v) => {
    const x = U(u, flip) - 0.5;
    const y = v - 0.5;
    const ang = Math.atan2(y, x);
    const r = Math.hypot(x, y);
    const a = ((ang + Math.PI) / (Math.PI * 2)) * 5;
    const f = Math.abs(a - Math.floor(a) - 0.5) * 2;
    return r <= 0.14 + 0.36 * (1 - f);
  });
}

function paintHeart(c, flip) {
  fillWhere(c, '#', (u, v) => {
    const x = (U(u, flip) - 0.5) * 2.15;
    const y = (v - 0.42) * -2.05;
    const a = x * x + y * y - 0.36;
    return a * a * a - x * x * y * y * y < 0;
  });
}

function paintRainbow(c, flip) {
  fillWhere(c, '#', (u, v) => {
    const x = (U(u, flip) - 0.5) / 0.48;
    const y = (v - 0.12) / 0.7;
    const r = Math.hypot(x, y);
    return r <= 1 && r >= 0.55 && v >= 0.12;
  });
  fillWhere(c, 'H', (u, v) => {
    const x = (U(u, flip) - 0.5) / 0.48;
    const y = (v - 0.12) / 0.7;
    const r = Math.hypot(x, y);
    return r <= 0.86 && r >= 0.7 && v >= 0.12;
  });
  fillWhere(c, 'L', (u, v) => {
    const x = (U(u, flip) - 0.5) / 0.48;
    const y = (v - 0.12) / 0.7;
    const r = Math.hypot(x, y);
    return r <= 0.7 && r >= 0.55 && v >= 0.12;
  });
}

function paintLightning(c, flip) {
  poly(c, [
    [U(0.58, flip), 0.96],
    [U(0.28, flip), 0.54],
    [U(0.48, flip), 0.54],
    [U(0.36, flip), 0.06],
    [U(0.72, flip), 0.5],
    [U(0.5, flip), 0.5],
  ], '#');
}

function paintComet(c, flip) {
  disk(c, U(0.74, flip), 0.7, 0.16, 0.16, '#');
  disk(c, U(0.74, flip), 0.7, 0.07, 0.07, 'H');
  thickLine(c, U(0.62, flip), 0.6, U(0.12, flip), 0.16, 0.08, '#');
  thickLine(c, U(0.6, flip), 0.66, U(0.2, flip), 0.28, 0.045, 'H');
}

function paintBouquet(c, flip) {
  disk(c, U(0.28, flip), 0.78, 0.12, 0.12, '#');
  disk(c, U(0.5, flip), 0.86, 0.12, 0.12, 'H');
  disk(c, U(0.72, flip), 0.78, 0.12, 0.12, 'L');
  thickLine(c, U(0.28, flip), 0.68, U(0.5, flip), 0.16, 0.03, 'T');
  thickLine(c, U(0.5, flip), 0.74, U(0.5, flip), 0.16, 0.03, 'T');
  thickLine(c, U(0.72, flip), 0.68, U(0.5, flip), 0.16, 0.03, 'T');
  disk(c, U(0.5, flip), 0.12, 0.1, 0.06, 'T');
}

/* ---------- mix ---------- */

function paintScooter(c, flip) {
  rect(c, U(0.16, flip), 0.22, U(0.78, flip), 0.34, '#');
  rect(c, U(0.7, flip), 0.22, U(0.78, flip), 0.78, 'T');
  thickLine(c, U(0.74, flip), 0.78, U(0.58, flip), 0.86, 0.03, 'T');
  wheels(c, flip, [0.26, 0.74], 0.18, 0.1);
}

function paintSwan(c, flip) {
  disk(c, U(0.42, flip), 0.32, 0.3, 0.2, '#');
  thickLine(c, U(0.62, flip), 0.42, U(0.72, flip), 0.78, 0.055, '#');
  disk(c, U(0.78, flip), 0.84, 0.1, 0.08, '#');
  poly(c, [[U(0.86, flip), 0.84], [U(0.98, flip), 0.8], [U(0.86, flip), 0.76]], 'N');
  eyes(c, flip, [0.8], 0.86, 0.025);
}

function paintCactusBall(c, flip) {
  disk(c, U(0.5, flip), 0.42, 0.32, 0.32, '#');
  for (const a of [20, 70, 110, 160]) {
    const rad = (a * Math.PI) / 180;
    thickLine(
      c,
      U(0.5 + Math.cos(rad) * 0.28, flip),
      0.42 + Math.sin(rad) * 0.28,
      U(0.5 + Math.cos(rad) * 0.42, flip),
      0.42 + Math.sin(rad) * 0.42,
      0.02,
      'L',
    );
  }
  rect(c, U(0.46, flip), 0.06, U(0.54, flip), 0.16, 'T');
}

function paintGreenApple(c, flip) {
  paintApple(c, flip);
}

function paintShip(c, flip) {
  poly(c, [[U(0.5, flip), 0.98], [U(0.28, flip), 0.62], [U(0.72, flip), 0.62]], '#');
  rect(c, U(0.3, flip), 0.22, U(0.7, flip), 0.64, '#');
  disk(c, U(0.5, flip), 0.48, 0.1, 0.08, 'E');
  poly(c, [[U(0.3, flip), 0.26], [U(0.12, flip), 0.08], [U(0.3, flip), 0.14]], 'H');
  poly(c, [[U(0.7, flip), 0.26], [U(0.88, flip), 0.08], [U(0.7, flip), 0.14]], 'H');
}

function paintBigCrab(c, flip) {
  paintCrab(c, flip);
}

function paintFruitTree(c, flip) {
  paintTree(c, flip);
  disk(c, U(0.32, flip), 0.62, 0.06, 0.06, 'H');
  disk(c, U(0.62, flip), 0.7, 0.06, 0.06, 'H');
  disk(c, U(0.5, flip), 0.5, 0.06, 0.06, 'H');
}

function paintSportCar(c, flip) {
  rect(c, U(0.06, flip), 0.2, U(0.94, flip), 0.42, '#');
  poly(c, [
    [U(0.28, flip), 0.42],
    [U(0.4, flip), 0.68],
    [U(0.7, flip), 0.68],
    [U(0.86, flip), 0.42],
  ], '#');
  rect(c, U(0.42, flip), 0.46, U(0.68, flip), 0.64, 'E');
  wheels(c, flip, [0.24, 0.76], 0.18, 0.1);
}

function paintBabyPenguin(c, flip) {
  paintPenguin(c, flip);
}

function paintKingCrown(c, flip) {
  paintCrown(c, flip);
}

const FRUITS = [
  P('apple', '苹果', paintApple),
  P('banana', '香蕉', paintBanana),
  P('strawberry', '草莓', paintStrawberry),
  P('pear', '梨', paintPear),
  P('cherry', '樱桃', paintCherry),
  P('orange', '橙子', paintOrange),
  P('grapes', '葡萄', paintGrapes),
  P('lemon', '柠檬', paintLemon),
  P('watermelon', '西瓜', paintWatermelon),
  P('pineapple', '菠萝', paintPineapple),
];

const PLANTS = [
  P('tree', '大树', paintTree),
  P('pine', '松树', paintPine),
  P('flower', '花朵', paintFlower),
  P('cactus', '仙人掌', paintCactus),
  P('mushroom', '蘑菇', paintMushroom),
  P('tulip', '郁金香', paintTulip),
  P('sunflower', '向日葵', paintSunflower),
  P('leaf', '叶子', paintLeaf),
  P('palm', '棕榈', paintPalm),
  P('clover', '四叶草', paintClover),
];

const ANIMALS = [
  P('cat', '猫咪', paintCat),
  P('dog', '小狗', paintDog),
  P('bunny', '兔子', paintBunny),
  P('chick', '小鸡', paintChick),
  P('mouse', '老鼠', paintMouse),
  P('frog', '青蛙', paintFrog),
  P('owl', '猫头鹰', paintOwl),
  P('fox', '狐狸', paintFox),
  P('pig', '小猪', paintPig),
  P('bear', '熊', paintBear),
];

const VEHICLES = [
  P('car', '小汽车', paintCar),
  P('bus', '巴士', paintBus),
  P('train', '火车', paintTrain),
  P('plane', '飞机', paintPlane),
  P('boat', '帆船', paintBoat),
  P('rocket', '火箭', paintRocket),
  P('bike', '自行车', paintBike),
  P('truck', '卡车', paintTruck),
  P('helicopter', '直升机', paintHelicopter),
  P('taxi', '出租车', paintTaxi),
];

const ANIMALS2 = [
  P('elephant', '大象', paintElephant),
  P('giraffe', '长颈鹿', paintGiraffe),
  P('penguin', '企鹅', paintPenguin),
  P('duck', '鸭子', paintDuck),
  P('horse', '小马', paintHorse),
  P('cow', '奶牛', paintCow),
  P('hedgehog', '刺猬', paintHedgehog),
  P('snail', '蜗牛', paintSnail),
  P('panda', '熊猫', paintPanda),
  P('butterfly', '蝴蝶', paintButterfly),
];

const FOOD = [
  P('icecream', '冰淇淋', paintIcecream),
  P('cupcake', '纸杯蛋糕', paintCupcake),
  P('donut', '甜甜圈', paintDonut),
  P('cake', '蛋糕', paintCake),
  P('candy', '糖果', paintCandy),
  P('lollipop', '棒棒糖', paintLollipop),
  P('popcorn', '爆米花', paintPopcorn),
  P('bread', '面包', paintBread),
  P('pretzel', '蝴蝶饼', paintPretzel),
  P('hotdog', '热狗', paintHotdog),
];

const SEA = [
  P('fish', '小鱼', paintFish),
  P('whale', '鲸鱼', paintWhale),
  P('turtle', '乌龟', paintTurtle),
  P('crab', '螃蟹', paintCrab),
  P('seahorse', '海马', paintSeahorse),
  P('octopus', '章鱼', paintOctopus),
  P('starfish', '海星', paintStarfish),
  P('jellyfish', '水母', paintJellyfish),
  P('dolphin', '海豚', paintDolphin),
  P('submarine', '潜水艇', paintSubmarine),
];

const OBJECTS = [
  P('house', '小房子', paintHouse),
  P('castle', '城堡', paintCastle),
  P('crown', '皇冠', paintCrown),
  P('gift', '礼物', paintGift),
  P('balloon', '气球', paintBalloon),
  P('umbrella', '雨伞', paintUmbrella),
  P('guitar', '吉他', paintGuitar),
  P('teapot', '茶壶', paintTeapot),
  P('bell', '铃铛', paintBell),
  P('key', '钥匙', paintKey),
];

const SKY = [
  P('bird', '小鸟', paintBird),
  P('sun', '太阳', paintSun),
  P('moon', '月亮', paintMoon),
  P('cloud', '云朵', paintCloud),
  P('star', '星星', paintStar),
  P('heart', '爱心', paintHeart),
  P('rainbow', '彩虹', paintRainbow),
  P('lightning', '闪电', paintLightning),
  P('comet', '彗星', paintComet),
  P('tulip2', '花束', paintBouquet),
];

const MIX = [
  P('scooter', '滑板车', paintScooter),
  P('swan', '天鹅', paintSwan),
  P('cactus2', '仙人球', paintCactusBall),
  P('apple2', '青苹果', paintGreenApple),
  P('rocket2', '飞船', paintShip),
  P('crab2', '大闸蟹', paintBigCrab),
  P('tree2', '果树', paintFruitTree),
  P('car2', '跑车', paintSportCar),
  P('penguin2', '企鹅仔', paintBabyPenguin),
  P('crown2', '王冠', paintKingCrown),
];

const THEMES = [FRUITS, PLANTS, ANIMALS, VEHICLES, ANIMALS2, FOOD, SEA, OBJECTS, SKY, MIX];

function shapeForLevel(id) {
  const d = Math.max(0, Math.min(THEMES.length - 1, Math.floor((id - 1) / 10)));
  const t = (id - 1) % 10;
  return THEMES[d][t % THEMES[d].length];
}

function occupyShape(id, cols, rows) {
  const shape = shapeForLevel(id);
  const flip = Math.floor((id - 1) / 50) % 2 === 1;
  const c = canvas(cols, rows);
  shape.paint(c, flip);
  const occ = c.g.map((ch) => ch !== '.');
  return { occ, regions: c.g, shape };
}

function stampShape(shape, cols, rows, flipX = false) {
  const c = canvas(cols, rows);
  shape.paint(c, flipX);
  return c.g.map((ch) => ch !== '.');
}

module.exports = {
  THEMES,
  shapeForLevel,
  stampShape,
  occupyShape,
};
