'use strict';

/** Front-image → official ColorLibrary voxel sculpture (dense stacks from z=0). */

const { convert } = require('./import-voxel-levels');
const {
  TOKEN_VOXEL_ID,
  nearestVoxelId,
  officialToken,
  assignTokens,
  rgbOf,
  dist2,
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

function isBackground(r, g, b, a, threshold) {
  if (a < 18) return true;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max >= threshold && max - min <= 30;
}

function bboxOf(rgba, w, h, threshold) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (isBackground(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3], threshold)) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  const px = Math.max(1, Math.round((x1 - x0 + 1) * 0.03));
  const py = Math.max(1, Math.round((y1 - y0 + 1) * 0.03));
  return {
    x0: Math.max(0, x0 - px),
    y0: Math.max(0, y0 - py),
    x1: Math.min(w - 1, x1 + px),
    y1: Math.min(h - 1, y1 + py),
  };
}

function majorityVoxel(rgba, w, h, x0, y0, x1, y1, threshold) {
  const votes = new Map();
  let n = 0;
  const xa = Math.max(0, Math.floor(x0));
  const ya = Math.max(0, Math.floor(y0));
  const xb = Math.min(w, Math.ceil(x1));
  const yb = Math.min(h, Math.ceil(y1));
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      const i = (y * w + x) * 4;
      if (isBackground(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3], threshold)) continue;
      const id = nearestVoxelId([rgba[i], rgba[i + 1], rgba[i + 2]]);
      votes.set(id, (votes.get(id) || 0) + 1);
      n += 1;
    }
  }
  const area = Math.max(1, (xb - xa) * (yb - ya));
  if (n < Math.max(1, area * 0.07)) return -1;
  let best = -1;
  let bestN = 0;
  votes.forEach((c, id) => {
    if (c > bestN || (c === bestN && id > best)) {
      bestN = c;
      best = id;
    }
  });
  return best;
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

function stacksToCells(face, cols, rows, depth, mode) {
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
      const token = officialToken(id) || 'o';
      cells.push(token.repeat(thick));
      for (let z = 0; z < thick; z++) voxels.push({ x, y, z, color: id });
    }
  }
  return { voxels, cells };
}

function generateFromRgba(rgbaIn, width, height, opts = {}) {
  const w = width | 0;
  const h = height | 0;
  if (w < 2 || h < 2 || w > 1024 || h > 1024) throw new Error('图片尺寸不支持');
  const cols = clamp(opts.cols, 8, 32, 16);
  const rows = clamp(opts.rows, 8, 32, 22);
  const depth = clamp(opts.depth, 1, 16, 6);
  const threshold = clamp(opts.threshold, 160, 252, 236);
  const maxColors = clamp(opts.maxColors, 2, 12, 8);
  const pad = clamp(opts.pad, 0, 4, 1);
  const mode = opts.mode === 'solid' ? 'solid' : 'round';
  const rgba = decodeRgba(rgbaIn, w, h);
  const box = bboxOf(rgba, w, h, threshold);
  const innerW = Math.max(1, cols - pad * 2);
  const innerH = Math.max(1, rows - pad * 2);
  const face = new Array(cols * rows).fill(-1);
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  for (let gy = 0; gy < innerH; gy++) {
    for (let gx = 0; gx < innerW; gx++) {
      const sx0 = box.x0 + (gx / innerW) * bw;
      const sx1 = box.x0 + ((gx + 1) / innerW) * bw;
      const sy0 = box.y0 + (gy / innerH) * bh;
      const sy1 = box.y0 + ((gy + 1) / innerH) * bh;
      const id = majorityVoxel(rgba, w, h, sx0, sy0, sx1, sy1, threshold);
      const x = gx + pad;
      const y = rows - 1 - pad - gy;
      face[y * cols + x] = id;
    }
  }
  const reduced = limitColors(face, maxColors);
  const built = stacksToCells(reduced, cols, rows, depth, mode);
  if (!built.voxels.length) throw new Error('没有识别到主体，试试降低背景阈值');
  const level = convert({ voxels: built.voxels }, opts.id || 0);
  level.cells = built.cells;
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
