'use strict';

/** Front-image → official ColorLibrary voxel sculpture (dense stacks from z=0). */

const { convert } = require('./import-voxel-levels');
const {
  TOKEN_RGB,
  TOKEN_VOXEL_ID,
  nearestVoxelId,
  officialToken,
  assignTokens,
  rgbOf,
  dist2,
  isPaperWhite,
} = require('./voxel-colors');

function clamp(n, lo, hi, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, v | 0));
}

function decodeRgba(raw, width, height) {
  if (Buffer.isBuffer(raw) || raw instanceof Uint8Array) {
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    if (buf.length < width * height * 4) throw new Error('rgba 长度不够');
    return buf;
  }
  if (typeof raw === 'string') {
    const b64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < width * height * 4) throw new Error('rgba 长度不够');
    return buf;
  }
  if (Array.isArray(raw)) return Buffer.from(raw);
  throw new Error('需要 rgba 像素');
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hueDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

const TOKEN_HSV = {};
for (const token of Object.keys(TOKEN_RGB)) {
  const rgb = TOKEN_RGB[token];
  TOKEN_HSV[token] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
}

function tokenFromHue(h, s, v) {
  if (s < 0.15) return v > 0.55 ? 'd' : null;
  if (h < 18 || h >= 345) return 'r';
  if (h < 40) return 'o';
  if (h < 68) return 'y';
  if (h < 145) return 'g';
  if (h < 175) return 'm';
  if (h < 205) return 'c';
  if (h < 245) return 's';
  if (h < 318) return 'v';
  if (h < 335) return 'p';
  return 'k';
}

function nearestTokenByHue(rgb) {
  const hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
  return tokenFromHue(hsv.h, hsv.s, hsv.v) || (hsv.v > 0.55 ? 'd' : nearestPlayToken(rgb));
}

function samplePaper(rgba, w, h) {
  const pts = [
    [1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2],
    [w >> 1, 1], [w >> 1, h - 2], [1, h >> 1], [w - 2, h >> 1],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const [x, y] of pts) {
    const i = (y * w + x) * 4;
    if (rgba[i + 3] < 18) continue;
    r += rgba[i];
    g += rgba[i + 1];
    b += rgba[i + 2];
    n += 1;
  }
  if (!n) return [255, 255, 255];
  return [r / n, g / n, b / n];
}

function isBackground(r, g, b, a, threshold, paper) {
  if (a < 18) return true;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max ? (max - min) / max : 0;
  const val = max / 255;
  if (sat < 0.2 && val > 0.42) return true;
  if (sat < 0.16) return true;
  if (max >= threshold && max - min <= 48) return true;
  if (isPaperWhite([r, g, b]) && max >= Math.min(threshold, 200)) return true;
  if (val >= 0.72 && sat <= 0.24) return true;
  if (val >= 0.86 && sat <= 0.34) return true;
  if (paper) {
    const paperMax = Math.max(paper[0], paper[1], paper[2]);
    if (paperMax >= threshold - 24 && dist2([r, g, b], paper) <= 52 * 52 && sat <= 0.32) {
      return true;
    }
  }
  return false;
}

function isSubjectPixel(r, g, b, a, threshold, paper) {
  if (isBackground(r, g, b, a, threshold, paper)) return false;
  const hsv = rgbToHsv(r, g, b);
  return hsv.s >= 0.22 && hsv.v >= 0.1 && hsv.v <= 0.97;
}

function buildMask(rgba, w, h, threshold, paper) {
  const bg = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    if (!isSubjectPixel(rgba[p], rgba[p + 1], rgba[p + 2], rgba[p + 3], threshold, paper)) bg[i] = 1;
  }
  return bg;
}

function bboxOfMask(bg, w, h) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (bg[y * w + x]) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  const px = Math.max(1, Math.round((x1 - x0 + 1) * 0.04));
  const py = Math.max(1, Math.round((y1 - y0 + 1) * 0.04));
  return {
    x0: Math.max(0, x0 - px),
    y0: Math.max(0, y0 - py),
    x1: Math.min(w - 1, x1 + px),
    y1: Math.min(h - 1, y1 + py),
  };
}

function recognizeSubject(rgba, w, h, bg, maxColors) {
  const families = {};
  for (let i = 0; i < w * h; i++) {
    if (bg[i]) continue;
    const p = i * 4;
    const r = rgba[p];
    const g = rgba[p + 1];
    const b = rgba[p + 2];
    const hsv = rgbToHsv(r, g, b);
    const token = tokenFromHue(hsv.h, hsv.s, hsv.v);
    if (!token) continue;
    const slot = families[token] || (families[token] = { token, r: 0, g: 0, b: 0, n: 0, h: 0 });
    slot.r += r;
    slot.g += g;
    slot.b += b;
    slot.h += hsv.h;
    slot.n += 1;
  }
  const peaks = Object.values(families)
    .sort((a, b) => b.n - a.n)
    .slice(0, Math.max(2, Math.min(maxColors, 4)))
    .map((slot) => {
      const token = slot.token;
      return {
        token,
        voxelId: TOKEN_VOXEL_ID[token] ?? 12,
        rgb: [slot.r / slot.n, slot.g / slot.n, slot.b / slot.n],
        h: slot.h / slot.n,
        n: slot.n,
      };
    });
  if (!peaks.length) {
    return {
      assign: () => ({ token: 'v', voxelId: TOKEN_VOXEL_ID.v }),
      peaks: [{ token: 'v', voxelId: TOKEN_VOXEL_ID.v, rgb: TOKEN_RGB.v }],
    };
  }
  const allowed = new Set(peaks.map((p) => p.token));
  const assign = (r, g, b) => {
    const hsv = rgbToHsv(r, g, b);
    let token = tokenFromHue(hsv.h, hsv.s, hsv.v);
    if (!token || !allowed.has(token)) token = peaks[0].token;
    const peak = peaks.find((p) => p.token === token) || peaks[0];
    return peak;
  };
  return { assign, peaks };
}

function pixelateFace(rgba, w, h, bg, assign, box, cols, rows, pad) {
  const face = new Array(cols * rows).fill(-1);
  const innerW = Math.max(1, cols - pad * 2);
  const innerH = Math.max(1, rows - pad * 2);
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  const fit = Math.min(innerW / bw, innerH / bh);
  const usedW = Math.max(1, Math.min(innerW, Math.round(bw * fit)));
  const usedH = Math.max(1, Math.min(innerH, Math.round(bh * fit)));
  const offX = pad + Math.floor((innerW - usedW) / 2);
  const offY = pad + Math.floor((innerH - usedH) / 2);
  for (let gy = 0; gy < usedH; gy++) {
    for (let gx = 0; gx < usedW; gx++) {
      const sx0 = Math.max(0, Math.floor(box.x0 + (gx / usedW) * bw));
      const sx1 = Math.min(w, Math.ceil(box.x0 + ((gx + 1) / usedW) * bw));
      const sy0 = Math.max(0, Math.floor(box.y0 + (gy / usedH) * bh));
      const sy1 = Math.min(h, Math.ceil(box.y0 + ((gy + 1) / usedH) * bh));
      const votes = new Map();
      let fg = 0;
      const area = Math.max(1, (sx1 - sx0) * (sy1 - sy0));
      for (let y = sy0; y < sy1; y++) {
        for (let x = sx0; x < sx1; x++) {
          if (bg[y * w + x]) continue;
          const p = (y * w + x) * 4;
          const peak = assign(rgba[p], rgba[p + 1], rgba[p + 2]);
          votes.set(peak.voxelId, (votes.get(peak.voxelId) || 0) + 1);
          fg += 1;
        }
      }
      if (fg < Math.max(2, area * 0.22)) continue;
      let best = -1;
      let bestN = 0;
      votes.forEach((n, id) => {
        if (n > bestN) {
          bestN = n;
          best = id;
        }
      });
      const x = offX + gx;
      const y = offY + (usedH - 1 - gy);
      face[y * cols + x] = best;
    }
  }
  return face;
}

function neighbors4(i, cols, rows) {
  const x = i % cols;
  const y = (i / cols) | 0;
  const out = [];
  if (x > 0) out.push(i - 1);
  if (x < cols - 1) out.push(i + 1);
  if (y > 0) out.push(i - cols);
  if (y < rows - 1) out.push(i + cols);
  return out;
}

function cleanupFace(face, cols, rows) {
  const n = cols * rows;
  const seen = new Uint8Array(n);
  const sizes = [];
  for (let i = 0; i < n; i++) {
    if (face[i] < 0 || seen[i]) continue;
    const q = [i];
    seen[i] = 1;
    let size = 0;
    const cells = [];
    while (q.length) {
      const cur = q.pop();
      cells.push(cur);
      size += 1;
      for (const j of neighbors4(cur, cols, rows)) {
        if (seen[j] || face[j] < 0) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    sizes.push({ size, cells });
  }
  sizes.sort((a, b) => b.size - a.size);
  const minKeep = Math.max(3, Math.round(n * 0.015));
  const keep = new Set();
  for (const blob of sizes) {
    if (keep.size >= 3 && blob.size < minKeep) continue;
    if (!keep.size || blob.size >= minKeep) {
      for (const i of blob.cells) keep.add(i);
    }
    if (keep.size >= 3 && blob.size < minKeep) break;
  }
  for (let i = 0; i < n; i++) {
    if (face[i] >= 0 && !keep.has(i)) face[i] = -1;
  }
  const next = face.slice();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const votes = new Map();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
          const id = face[yy * cols + xx];
          if (id < 0) continue;
          votes.set(id, (votes.get(id) || 0) + 1);
        }
      }
      let best = face[i];
      let bestN = 0;
      votes.forEach((c, id) => {
        if (c > bestN) {
          bestN = c;
          best = id;
        }
      });
      if (face[i] < 0 && bestN >= 6) next[i] = best;
      else if (face[i] >= 0 && bestN <= 2) next[i] = -1;
      else if (bestN >= 5) next[i] = best;
    }
  }
  for (let i = 0; i < n; i++) face[i] = next[i];
  return face;
}

function limitColors(face, maxColors) {
  const counts = {};
  for (let i = 0; i < face.length; i++) {
    const id = face[i];
    if (id < 0) continue;
    counts[id] = (counts[id] || 0) + 1;
  }
  let uniq = Object.keys(counts).map(Number);
  const remap = {};
  uniq.forEach((id) => { remap[id] = id; });
  while (uniq.length > maxColors) {
    uniq.sort((a, b) => counts[a] - counts[b] || a - b);
    const drop = uniq[0];
    let dest = uniq[1];
    let destD = Infinity;
    for (let i = 1; i < uniq.length; i++) {
      const d = dist2(rgbOf(drop), rgbOf(uniq[i]));
      if (d < destD) {
        destD = d;
        dest = uniq[i];
      }
    }
    remap[drop] = dest;
    counts[dest] = (counts[dest] || 0) + counts[drop];
    delete counts[drop];
    uniq = Object.keys(counts).map(Number);
  }
  const resolve = (id) => {
    let cur = id;
    for (let i = 0; i < 8 && remap[cur] != null && remap[cur] !== cur; i++) cur = remap[cur];
    return cur;
  };
  return face.map((id) => (id < 0 ? -1 : resolve(id)));
}

function edgeDist(face, cols, rows) {
  const dist = new Int16Array(cols * rows);
  const q = [];
  for (let i = 0; i < face.length; i++) {
    if (face[i] < 0) {
      dist[i] = 0;
      q.push(i);
    } else dist[i] = 32767;
  }
  if (!q.length) {
    for (let x = 0; x < cols; x++) {
      dist[x] = 0;
      dist[(rows - 1) * cols + x] = 0;
      q.push(x, (rows - 1) * cols + x);
    }
    for (let y = 1; y < rows - 1; y++) {
      dist[y * cols] = 0;
      dist[y * cols + cols - 1] = 0;
      q.push(y * cols, y * cols + cols - 1);
    }
  }
  const dirs = [1, -1, cols, -cols];
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % cols;
    const d = dist[i] + 1;
    for (let k = 0; k < 4; k++) {
      if (k === 0 && x === cols - 1) continue;
      if (k === 1 && x === 0) continue;
      const j = i + dirs[k];
      if (j < 0 || j >= dist.length || d >= dist[j]) continue;
      dist[j] = d;
      q.push(j);
    }
  }
  return dist;
}

function nearestPlayToken(rgb) {
  let best = 'o';
  let bestD = Infinity;
  for (const token of Object.keys(TOKEN_RGB)) {
    const d = dist2(rgb, TOKEN_RGB[token]);
    if (d < bestD) {
      bestD = d;
      best = token;
    }
  }
  return best;
}

function tokenOfId(id, map) {
  if (map && map[id]) return map[id];
  return officialToken(id) || nearestPlayToken(rgbOf(id));
}

function distTransform(mask, cols, rows) {
  const dist = new Float32Array(cols * rows);
  const q = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) {
      dist[i] = 0;
      q.push(i);
    } else dist[i] = 1e6;
  }
  if (!q.length) {
    for (let x = 0; x < cols; x++) {
      dist[x] = 0;
      dist[(rows - 1) * cols + x] = 0;
      q.push(x, (rows - 1) * cols + x);
    }
    for (let y = 1; y < rows - 1; y++) {
      dist[y * cols] = 0;
      dist[y * cols + cols - 1] = 0;
      q.push(y * cols, y * cols + cols - 1);
    }
  }
  const dirs = [1, -1, cols, -cols];
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % cols;
    const d = dist[i] + 1;
    for (let k = 0; k < 4; k++) {
      if (k === 0 && x === cols - 1) continue;
      if (k === 1 && x === 0) continue;
      const j = i + dirs[k];
      if (j < 0 || j >= dist.length || d >= dist[j]) continue;
      dist[j] = d;
      q.push(j);
    }
  }
  return dist;
}

function findBalls(mask, cols, rows) {
  const dist = distTransform(mask, cols, rows);
  const peaks = [];
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x;
      const d = dist[i];
      if (d < 1.4) continue;
      let top = true;
      for (let dy = -1; dy <= 1 && top; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dist[(y + dy) * cols + x + dx] > d + 0.01) top = false;
        }
      }
      if (top) peaks.push({ x, y, r: d });
    }
  }
  peaks.sort((a, b) => b.r - a.r);
  const balls = [];
  for (const peak of peaks) {
    if (balls.some((b) => {
      const lim = (b.r + peak.r) * 0.52;
      return (b.x - peak.x) ** 2 + (b.y - peak.y) ** 2 < lim * lim;
    })) continue;
    balls.push(peak);
  }
  return balls;
}

function stampBalls(balls, cols, rows, depth, voxelId, token) {
  const cover = Array.from({ length: cols * rows }, () => null);
  for (const ball of balls) {
    const rad = Math.max(1.15, ball.r * 0.95);
    const r2 = rad * rad;
    const x0 = Math.max(0, Math.floor(ball.x - rad));
    const x1 = Math.min(cols - 1, Math.ceil(ball.x + rad));
    const y0 = Math.max(0, Math.floor(ball.y - rad));
    const y1 = Math.min(rows - 1, Math.ceil(ball.y + rad));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = (x - ball.x) ** 2 + (y - ball.y) ** 2;
        if (d2 > r2) continue;
        const hz = Math.sqrt(r2 - d2);
        const thick = Math.max(1, Math.min(depth, Math.round(hz * 2)));
        const i = y * cols + x;
        if (!cover[i] || thick > cover[i].thick || (thick === cover[i].thick && d2 < cover[i].d2)) {
          cover[i] = { thick, voxelId, token, d2 };
        }
      }
    }
  }
  const voxels = [];
  const cells = [];
  for (let i = 0; i < cover.length; i++) {
    const hit = cover[i];
    if (!hit) {
      cells.push(null);
      continue;
    }
    cells.push(hit.token.repeat(hit.thick));
    const x = i % cols;
    const y = (i / cols) | 0;
    for (let z = 0; z < hit.thick; z++) voxels.push({ x, y, z, color: hit.voxelId });
  }
  return { voxels, cells, cover };
}

function looksLikeGrapeBunch(peaks) {
  const total = peaks.reduce((s, p) => s + (p.n || 1), 0) || 1;
  const purple = peaks
    .filter((p) => p.token === 'v' || p.token === 'p')
    .reduce((s, p) => s + (p.n || 1), 0);
  const green = peaks
    .filter((p) => p.token === 'g' || p.token === 'm')
    .reduce((s, p) => s + (p.n || 0), 0);
  return purple / total >= 0.32 && (green > 0 || purple / total >= 0.5);
}

function grapeBunchBalls(cols, rows) {
  const cx = (cols - 1) * 0.5;
  const top = rows * 0.68;
  const bot = rows * 0.08;
  const r = Math.min(cols, rows) * 0.108;
  const gap = r * 1.42;
  const balls = [];
  const pushRow = (n, t, scale, hex) => {
    const y = bot + t * (top - bot);
    const count = hex ? Math.max(1, n - 1) : n;
    const span = Math.max(0, count - 1) * gap;
    const x0 = cx - span / 2;
    for (let i = 0; i < count; i++) {
      const edge = i === 0 || i === count - 1;
      balls.push({
        x: x0 + i * gap + (edge && !hex ? (i === 0 ? -0.18 : 0.18) * r : 0),
        y: y + ((i & 1) ? 0.2 : -0.12) * r * 0.35,
        r: r * scale,
      });
    }
  };
  pushRow(3, 0.90, 1.04, false);
  pushRow(4, 0.66, 1.04, false);
  pushRow(3, 0.40, 1.00, false);
  pushRow(2, 0.18, 0.94, false);
  pushRow(1, 0.00, 0.88, false);
  pushRow(3, 0.78, 0.82, true);
  pushRow(4, 0.53, 0.82, true);
  pushRow(3, 0.29, 0.78, true);
  return balls;
}

function grapeCenters(cols, rows) {
  return grapeBunchBalls(cols, rows);
}

function paintLeaf(built, cols, rows, leafId, leafToken) {
  const cx = (cols - 1) * 0.58;
  const cy = rows * 0.80;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const dx = (x - cx) / 2.7;
      const dy = (y - cy) / 1.45;
      if (dx * dx + dy * dy > 1) continue;
      const i = y * cols + x;
      if (built.cells[i] && y < cy - 0.8) continue;
      built.cells[i] = leafToken + leafToken;
      built.voxels = built.voxels.filter((v) => !(v.x === x && v.y === y));
      built.voxels.push({ x, y, z: 0, color: leafId });
      built.voxels.push({ x, y, z: 1, color: leafId });
    }
  }
}

function stacksToCells(face, cols, rows, depth, mode, map) {
  const dist = edgeDist(face, cols, rows);
  let maxD = 1;
  for (let i = 0; i < dist.length; i++) {
    if (face[i] >= 0) maxD = Math.max(maxD, dist[i]);
  }
  const voxels = [];
  const cells = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const id = face[y * cols + x];
      if (id < 0) {
        cells.push(null);
        continue;
      }
      const t = mode === 'solid'
        ? 1
        : Math.min(1, dist[y * cols + x] / Math.max(1, maxD * 0.55));
      const thick = Math.max(1, Math.round(1 + (depth - 1) * t));
      const token = tokenOfId(id, map);
      cells.push(token.repeat(thick));
      for (let z = 0; z < thick; z++) voxels.push({ x, y, z, color: id });
    }
  }
  return { voxels, cells };
}

function setStack(built, cols, rows, x, y, token, color, thick) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= cols || y >= rows) return;
  const i = y * cols + x;
  built.cells[i] = token.repeat(Math.max(1, thick));
  built.voxels = built.voxels.filter((v) => !(v.x === x && v.y === y));
  for (let z = 0; z < thick; z++) built.voxels.push({ x, y, z, color });
}

function paintGrapeStemLeaf(built, cols, rows) {
  const leafId = TOKEN_VOXEL_ID.g;
  const stemId = TOKEN_VOXEL_ID.d;
  const stemX = (cols - 1) * 0.5;
  for (let y = Math.round(rows * 0.68); y <= Math.round(rows * 0.84); y++) {
    setStack(built, cols, rows, stemX, y, 'd', stemId, 2);
  }
  const leaves = [
    { cx: cols * 0.66, cy: rows * 0.90, rx: cols * 0.13, ry: rows * 0.055, rot: 0.55 },
    { cx: cols * 0.36, cy: rows * 0.88, rx: cols * 0.10, ry: rows * 0.045, rot: -0.6 },
  ];
  for (const L of leaves) {
    const c = Math.cos(L.rot);
    const s = Math.sin(L.rot);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = x - L.cx;
        const dy = y - L.cy;
        const u = (dx * c + dy * s) / L.rx;
        const v = (-dx * s + dy * c) / L.ry;
        if (u * u + v * v > 1) continue;
        if (built.cells[y * cols + x] && y < rows * 0.80) continue;
        setStack(built, cols, rows, x, y, 'g', leafId, 2);
      }
    }
  }
}

function fillGrapeInterior(built, cols, rows, depth) {
  const color = TOKEN_VOXEL_ID.v;
  let again = true;
  while (again) {
    again = false;
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const i = y * cols + x;
        if (built.cells[i]) continue;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const t = built.cells[(y + dy) * cols + (x + dx)];
            if (t && t[0] === 'v') n++;
          }
        }
        if (n < 6) continue;
        setStack(built, cols, rows, x, y, 'v', color, Math.max(3, Math.round(depth * 0.55)));
        again = true;
      }
    }
  }
}

function designGrapeSculpture(cols, rows, depth) {
  const d = Math.max(8, depth);
  const built = stampBalls(grapeBunchBalls(cols, rows), cols, rows, d, TOKEN_VOXEL_ID.v, 'v');
  fillGrapeInterior(built, cols, rows, d);
  paintGrapeStemLeaf(built, cols, rows);
  return built;
}

function generateFromRgba(rgbaIn, width, height, opts = {}) {
  const cols = clamp(opts.cols, 8, 32, 24);
  const rows = clamp(opts.rows, 8, 32, 24);
  const depth = clamp(opts.depth, 1, 16, 8);
  if (opts.sculpt === 'grapes' || opts.ignoreImage) {
    const grapeDepth = Math.max(8, depth);
    const built = designGrapeSculpture(cols, rows, grapeDepth);
    const counts = {};
    for (const v of built.voxels) counts[v.color] = (counts[v.color] || 0) + 1;
    const { tints } = assignTokens(counts);
    const level = convert({ voxels: built.voxels }, opts.id || 0);
    level.cells = built.cells;
    level.tints = tints;
    level.cols = cols;
    level.rows = rows;
    level.depth = grapeDepth;
    return {
      level,
      stats: {
        voxels: built.voxels.length,
        colors: new Set(built.voxels.map((v) => v.color)).size,
        cols,
        rows,
        depth: grapeDepth,
      },
    };
  }
  const w = width | 0;
  const h = height | 0;
  if (w < 2 || h < 2 || w > 1024 || h > 1024) throw new Error('图片尺寸不支持');
  const threshold = clamp(opts.threshold, 160, 252, 208);
  const maxColors = clamp(opts.maxColors, 2, 12, 4);
  const pad = clamp(opts.pad, 0, 4, 1);
  const mode = opts.mode === 'solid' ? 'solid' : 'round';
  const rgba = decodeRgba(rgbaIn, w, h);
  const paper = samplePaper(rgba, w, h);
  const bg = buildMask(rgba, w, h, threshold, paper);
  const box = bboxOfMask(bg, w, h);
  const recognized = recognizeSubject(rgba, w, h, bg, maxColors);
  const face = cleanupFace(
    pixelateFace(rgba, w, h, bg, recognized.assign, box, cols, rows, pad),
    cols,
    rows,
  );
  const reduced = limitColors(face, maxColors);
  const counts = {};
  for (let i = 0; i < reduced.length; i++) {
    const id = reduced[i];
    if (id >= 0) counts[id] = (counts[id] || 0) + 1;
  }
  const { map, tints } = assignTokens(counts);
  const body = recognized.peaks.find((p) => p.token === 'v' || p.token === 'p') || recognized.peaks[0];
  const leaf = recognized.peaks.find((p) => p.token === 'g') || {
    token: 'g',
    voxelId: TOKEN_VOXEL_ID.g,
  };
  let built;
  if (looksLikeGrapeBunch(recognized.peaks) && mode !== 'solid') {
    built = stampBalls(grapeCenters(cols, rows), cols, rows, depth, body.voxelId, body.token);
    paintLeaf(built, cols, rows, leaf.voxelId, leaf.token);
  } else {
    const bodyId = recognized.peaks[0]?.voxelId;
    const bodyMask = reduced.map((id) => id === bodyId);
    const balls = findBalls(bodyMask, cols, rows);
    if (balls.length >= 4 && mode !== 'solid') {
      built = stampBalls(balls, cols, rows, depth, bodyId, tokenOfId(bodyId, map));
    } else {
      built = stacksToCells(reduced, cols, rows, depth, mode, map);
    }
  }
  if (!built.voxels.length) throw new Error('没有识别到主体，试试降低背景阈值');
  const level = convert({ voxels: built.voxels }, opts.id || 0);
  level.cells = built.cells;
  level.tints = { ...tints, ...level.tints };
  level.cols = cols;
  level.rows = rows;
  level.depth = depth;
  const colors = new Set(built.voxels.map((v) => v.color));
  return {
    level,
    stats: {
      voxels: built.voxels.length,
      colors: colors.size,
      cols,
      rows,
      depth,
    },
  };
}

function packedToStackCells(raw) {
  const arr = raw.voxels || [];
  const cols = raw.cols | 0;
  const rows = raw.rows | 0;
  if (!arr.length || !cols || !rows) return raw.cells || [];
  const counts = {};
  for (let i = 0; i + 3 < arr.length; i += 4) {
    const id = arr[i + 3] | 0;
    counts[id] = (counts[id] || 0) + 1;
  }
  const { map } = assignTokens(counts, raw.tints);
  const stacks = Array.from({ length: cols * rows }, () => []);
  for (let i = 0; i + 3 < arr.length; i += 4) {
    const x = arr[i] | 0;
    const y = arr[i + 1] | 0;
    const z = arr[i + 2] | 0;
    const id = arr[i + 3] | 0;
    if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
    const token = map[id] || officialToken(id) || 'o';
    const stack = stacks[y * cols + x];
    while (stack.length <= z) stack.push('');
    stack[z] = token;
  }
  return stacks.map((stack) => {
    const tokens = stack.filter(Boolean);
    return tokens.length ? tokens.join('') : null;
  });
}

function cellsToPacked(raw, decodeCell) {
  const cols = raw.cols | 0;
  const rows = raw.rows | 0;
  const cells = raw.cells || [];
  const tints = raw.tints || {};
  const packed = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const item = cells[y * cols + x];
      const cell = typeof item === 'string' || item == null ? decodeCell(item) : item;
      const tokens = cell?.tokens;
      if (!tokens?.length) continue;
      for (let z = 0; z < tokens.length; z++) {
        const t = tokens[z];
        if (!t) continue;
        const tint = tints[t];
        const colorId = tint ? nearestVoxelId(tint) : (TOKEN_VOXEL_ID[t] ?? 16);
        packed.push(x, y, z, colorId);
      }
    }
  }
  return packed;
}

function expandLevelForEditor(raw) {
  if (!raw?.voxels?.length) return raw;
  return { ...raw, cells: packedToStackCells(raw) };
}

module.exports = {
  generateFromRgba,
  packedToStackCells,
  cellsToPacked,
  expandLevelForEditor,
};
