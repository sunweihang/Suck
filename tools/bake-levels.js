'use strict';

/** Offline level generator. Writes assets/resources/levels/catalog.json */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets/resources/levels/catalog.json');
const META = `${OUT}.meta`;
const UUID = '7e22bb20-0360-4b02-8002-000000000060';
const LEVEL_COUNT = 100;
const ALL_COLOR_TOKENS = ['o', 'y', 'c', 'g', 'p', 'v', 'r', 's', 'k', 'm', 'a', 'd'];
const CLUSTER_MIN = 6;
const TOKEN_HUE = {
  o: 28, y: 50, c: 182, g: 136, p: 330, v: 268,
  r: 355, s: 210, k: 10, m: 156, a: 312, d: 45,
};
/** Same-family colors that read as 靠色 in play. At most one per group. */
const CLASH_GROUPS = [
  ['p', 'v', 'a'],
  ['c', 's'],
  ['y', 'd'],
  ['g', 'm'],
];

class Rng {
  constructor(seed) {
    this.seed = seed >>> 0;
  }
  next() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  int(n) {
    return (this.next() * n) | 0;
  }
}

function hypot2(x, y) {
  return Math.hypot(x, y);
}
function inRoundRect(x, y, hx, hy, r) {
  const ax = Math.abs(x) - hx;
  const ay = Math.abs(y) - hy;
  return hypot2(Math.max(ax, 0), Math.max(ay, 0)) + Math.min(Math.max(ax, ay), 0) <= r;
}
function inStar(x, y, spikes, inner, outer) {
  const ang = Math.atan2(y, x);
  const r = hypot2(x, y);
  const a = ((ang + Math.PI) / (Math.PI * 2)) * spikes;
  const f = Math.abs(a - Math.floor(a) - 0.5) * 2;
  return r <= inner + (outer - inner) * (1 - f);
}
function inHeart(x, y) {
  const sx = x * 1.18;
  const sy = -y * 1.08 + 0.08;
  const a = sx * sx + sy * sy - 0.34;
  return a * a * a - sx * sx * sy * sy * sy < 0;
}

function occupied(kind, x, y, alt, id) {
  const fx = alt ? -x : x;
  const fy = y;
  const wob = Math.sin(id * 0.37) * 0.04;
  switch (kind) {
    case 0: return Math.abs(fx) < 0.94 && Math.abs(fy) < 0.92;
    case 1: return inRoundRect(fx, fy, 0.7, 0.68, 0.24);
    case 2: return fy > -0.96 && Math.abs(fx) < (1.02 - fy) * 0.7;
    case 3: return fy < 0.96 && Math.abs(fx) < (1.02 + fy) * 0.7;
    case 4: return Math.abs(fx) + Math.abs(fy) < 1.08;
    case 5: return hypot2(fx, fy) < 0.92;
    case 6: return hypot2(fx * 0.72, fy) < 0.88;
    case 7: return inHeart(fx, fy);
    case 8: return inStar(fx, fy, 5, 0.36, 0.96);
    case 9: return hypot2(fx, fy) < 0.9 && hypot2(fx - 0.32, fy - 0.06) > 0.68;
    case 10: return hypot2(fx, fy) < 0.94 && hypot2(fx, fy) > 0.42;
    case 11: return Math.abs(fx) < 0.28 || Math.abs(fy) < 0.28;
    case 12: return Math.abs(Math.abs(fx) - Math.abs(fy)) < 0.26 && hypot2(fx, fy) < 1.02;
    case 13: return Math.abs(fx) < 0.3 || (fy > 0.42 && Math.abs(fx) < 0.88);
    case 14: return fy < -0.28 || (Math.abs(fx) > 0.52 && Math.abs(fy) < 0.92);
    case 15: return Math.abs(fx) > 0.48 || Math.abs(fy) < 0.26;
    case 16: {
      const s = Math.sin(fy * 2.4) * 0.42;
      return Math.abs(fx - s) < 0.38 && Math.abs(fy) < 0.94;
    }
    case 17: {
      const step = Math.floor((fy + 1) * 3);
      return fx > -0.9 && fx < -0.15 + step * 0.28 && fy > -0.95;
    }
    case 18: {
      const merlon = Math.abs(((fx + 1) * 4) % 2 - 1) < 0.55;
      return (fy < 0.42 && Math.abs(fx) < 0.92) || (fy >= 0.42 && fy < 0.92 && merlon && Math.abs(fx) < 0.92);
    }
    case 19: {
      const hole = hypot2(fx, fy + 0.12) < 0.42;
      return inRoundRect(fx, fy, 0.78, 0.72, 0.12) && (fy > 0.05 || !hole);
    }
    case 20: {
      const left = hypot2(fx + 0.52, Math.max(0, fy + 0.15)) < 0.38 && fy > -0.9;
      const right = hypot2(fx - 0.52, Math.max(0, fy + 0.15)) < 0.38 && fy > -0.9;
      const base = Math.abs(fy + 0.78) < 0.2 && Math.abs(fx) < 0.88;
      return left || right || base;
    }
    case 21: return Math.abs(fx) < 0.22 + Math.abs(fy) * 0.62 && Math.abs(fy) < 0.94;
    case 22: {
      const bolt = Math.abs(fx - fy * 0.35 + (fy > 0 ? 0.18 : -0.18)) < 0.22;
      return bolt && Math.abs(fy) < 0.95 && Math.abs(fx) < 0.82;
    }
    case 23: {
      const shaft = fy < 0.18 && Math.abs(fx) < 0.22;
      const head = fy >= 0.18 && fy < 0.92 && Math.abs(fx) < (0.92 - fy) * 1.15;
      return shaft || head;
    }
    case 24: {
      const trunk = Math.abs(fx) < 0.16 && fy < 0.1;
      const crown = hypot2(fx, fy - 0.28) < 0.52 || hypot2(fx * 0.8, fy - 0.55) < 0.38;
      return trunk || crown;
    }
    case 25: {
      const band = fy > -0.15 && fy < 0.18 && Math.abs(fx) < 0.82;
      const point = fy >= 0.18 && Math.abs(fx) < 0.82 && (Math.abs(((fx + 1) * 3.5) % 2 - 1) < 0.55 || fy < 0.42);
      return band || point;
    }
    case 26: {
      const body = hypot2(fx * 1.15, fy) < 0.32;
      const wingL = hypot2(fx + 0.48, fy - 0.08) < 0.42 && fx < 0.05;
      const wingR = hypot2(fx - 0.48, fy - 0.08) < 0.42 && fx > -0.05;
      return body || wingL || wingR;
    }
    case 27: {
      const cap = fy > 0.05 && hypot2(fx, fy - 0.22) < 0.62;
      const stem = fy <= 0.12 && Math.abs(fx) < 0.2 && fy > -0.92;
      return cap || stem;
    }
    case 28: {
      const body = Math.abs(fx) < 0.28 && fy > -0.72 && fy < 0.42;
      const nose = fy >= 0.42 && Math.abs(fx) < (0.95 - fy) * 0.7;
      const fin = fy < -0.35 && fy > -0.92 && Math.abs(fx) < 0.55;
      return body || nose || fin;
    }
    case 29: {
      const wall = Math.abs(fx) < 0.7 && fy > -0.85 && fy < 0.22;
      const roof = fy >= 0.18 && fy < 0.88 && Math.abs(fx) < (0.95 - fy) * 1.2;
      const door = Math.abs(fx) < 0.16 && fy < -0.28;
      return (wall || roof) && !door;
    }
    case 30: {
      const hull = fy < 0.05 && fy > -0.55 && Math.abs(fx) < 0.82 + fy * 0.4;
      const sail = fy >= 0.0 && fy < 0.88 && fx > -0.08 && fx < 0.42;
      const mast = Math.abs(fx + 0.02) < 0.08 && fy > -0.2 && fy < 0.9;
      return hull || sail || mast;
    }
    case 31: {
      const body = hypot2(fx * 0.7, fy) < 0.55;
      const tail = fx < -0.2 && Math.abs(fy - 0.15) < 0.35 + (fx + 0.2) * 0.4;
      const fin = fy > 0.2 && Math.abs(fx - 0.1) < 0.22;
      return body || tail || fin;
    }
    case 32: {
      const head = hypot2(fx, fy + 0.08) < 0.55;
      const earL = hypot2(fx + 0.38, fy - 0.48) < 0.22;
      const earR = hypot2(fx - 0.38, fy - 0.48) < 0.22;
      return head || earL || earR;
    }
    case 33: {
      const face = hypot2(fx, fy) < 0.88;
      const eyeL = hypot2(fx + 0.28, fy - 0.22) < 0.12;
      const eyeR = hypot2(fx - 0.28, fy - 0.22) < 0.12;
      const smile = fy < -0.08 && fy > -0.42 && hypot2(fx, fy + 0.05) < 0.48 && hypot2(fx, fy + 0.22) > 0.32;
      return face && !eyeL && !eyeR && !smile;
    }
    case 34: {
      const core = hypot2(fx, fy) < 0.28;
      let petal = false;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + wob;
        petal = petal || hypot2(fx - Math.cos(a) * 0.52, fy - Math.sin(a) * 0.52) < 0.3;
      }
      return core || petal;
    }
    case 35: {
      return hypot2(fx + 0.28, fy + 0.08) < 0.42
        || hypot2(fx - 0.22, fy + 0.12) < 0.38
        || hypot2(fx, fy - 0.18) < 0.4
        || hypot2(fx + 0.02, fy + 0.28) < 0.34;
    }
    case 36: {
      const m0 = fy < 0.15 - Math.abs(fx) * 0.55 && fy > -0.85;
      const m1 = hypot2(fx + 0.42, fy + 0.15) < 0.38 && fy > -0.2;
      const m2 = hypot2(fx - 0.08, fy + 0.05) < 0.46 && fy > -0.15;
      return m0 || m1 || m2;
    }
    case 37: {
      const z = Math.abs(((fx + 1) * 3.2 + fy * 1.4) % 2 - 1);
      return z < 0.42 && Math.abs(fy) < 0.92;
    }
    case 38: {
      const frame = Math.abs(fx) > 0.62 || Math.abs(fy) > 0.62;
      return Math.abs(fx) < 0.94 && Math.abs(fy) < 0.92 && frame;
    }
    case 39: {
      return hypot2(fx + 0.55, fy + 0.35) < 0.32
        || hypot2(fx - 0.5, fy + 0.28) < 0.3
        || hypot2(fx + 0.08, fy - 0.42) < 0.36
        || hypot2(fx - 0.15, fy + 0.55) < 0.22;
    }
    case 40: {
      const ang = Math.atan2(fy, fx);
      const r = hypot2(fx, fy);
      const spiral = (ang + Math.PI) / (Math.PI * 2) + Math.floor(r * 2.4);
      return Math.abs((spiral % 1) - 0.5) < 0.22 && r < 0.96;
    }
    case 41: return ((Math.floor((fx + 1) * 4) + Math.floor((fy + 1) * 4)) & 1) === 0 && hypot2(fx, fy) < 1.02;
    case 42: {
      const wave = Math.sin((fx + 1) * 3.4) * 0.28;
      return Math.abs(fy - wave) < 0.42;
    }
    case 43: {
      const base = fy < -0.15 && Math.abs(fx) < 0.9;
      const spike = fy >= -0.2 && Math.abs(((fx + 1) * 5) % 2 - 1) < 0.42 && fy < 0.92 - Math.abs(((fx + 1) * 5) % 2 - 1) * 0.5;
      return base || spike;
    }
    case 44: {
      const mid = Math.abs(fy) < 0.22 && Math.abs(fx) < 0.72;
      const top = fy > 0.15 && hypot2(fx + 0.28, fy - 0.42) < 0.38;
      const bot = fy < -0.15 && hypot2(fx - 0.28, fy + 0.42) < 0.38;
      return mid || top || bot;
    }
    case 45: return Math.abs(fx) > 0.42 && Math.abs(fx) < 0.88 && Math.abs(fy) < 0.92;
    case 46: {
      const ring = hypot2(fx + 0.12, fy) < 0.78 && hypot2(fx + 0.12, fy) > 0.42;
      const gap = fx > 0.15 && Math.abs(fy) < 0.28;
      return ring && !gap;
    }
    case 47: {
      const stem = Math.abs(fx + 0.35) < 0.18 && fy < 0.55;
      const arm = fy > 0.15 && fy < 0.55 && fx > -0.4 && fx < 0.55;
      const leg = fy < -0.05 && fx > 0.05 && fx < 0.42 && fy > -0.92;
      return stem || arm || leg;
    }
    case 48: {
      const skull = hypot2(fx, fy - 0.15) < 0.62;
      const jaw = Math.abs(fx) < 0.38 && fy < 0.05 && fy > -0.62;
      const eyeL = hypot2(fx + 0.22, fy - 0.22) < 0.14;
      const eyeR = hypot2(fx - 0.22, fy - 0.22) < 0.14;
      return (skull || jaw) && !eyeL && !eyeR;
    }
    default: {
      const head = hypot2(fx, fy - 0.28) < 0.42;
      const body = Math.abs(fx) < 0.34 && fy < 0.2 && fy > -0.55;
      const antL = hypot2(fx + 0.28, fy - 0.72) < 0.12;
      const antR = hypot2(fx - 0.28, fy - 0.72) < 0.12;
      const arm = Math.abs(fy + 0.05) < 0.12 && Math.abs(fx) < 0.72;
      return head || body || antL || antR || arm;
    }
  }
}

function nearestSeed(x, y, seeds) {
  let best = 0;
  let bestD = 1e9;
  for (let i = 0; i < seeds.length; i++) {
    const dx = x - seeds[i][0];
    const dy = y - seeds[i][1];
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function pickSeeds(spots, count, rng) {
  const n = Math.min(count, spots.length);
  const seeds = [];
  if (n <= 0) return seeds;
  const first = spots[rng.int(spots.length)];
  seeds.push([first[0], first[1]]);
  while (seeds.length < n) {
    let bestI = 0;
    let bestD = -1;
    for (let i = 0; i < spots.length; i++) {
      const x = spots[i][0];
      const y = spots[i][1];
      let d = 1e9;
      for (let s = 0; s < seeds.length; s++) {
        const dx = x - seeds[s][0];
        const dy = y - seeds[s][1];
        const dd = dx * dx + dy * dy;
        if (dd < d) d = dd;
      }
      if (d > bestD) {
        bestD = d;
        bestI = i;
      }
    }
    seeds.push([spots[bestI][0], spots[bestI][1]]);
  }
  return seeds;
}

function mergeTiny(spots, assign, seeds, minSize) {
  while (true) {
    const sizes = new Array(seeds.length).fill(0);
    for (let i = 0; i < assign.length; i++) sizes[assign[i]] += 1;
    let tiny = -1;
    let tinyN = minSize;
    for (let r = 0; r < sizes.length; r++) {
      if (sizes[r] > 0 && sizes[r] < tinyN) {
        tinyN = sizes[r];
        tiny = r;
      }
    }
    if (tiny < 0) return;
    let other = -1;
    let otherD = 1e9;
    for (let r = 0; r < seeds.length; r++) {
      if (r === tiny || sizes[r] <= 0) continue;
      const dx = seeds[r][0] - seeds[tiny][0];
      const dy = seeds[r][1] - seeds[tiny][1];
      const d = dx * dx + dy * dy;
      if (d < otherD) {
        otherD = d;
        other = r;
      }
    }
    if (other < 0) return;
    for (let i = 0; i < assign.length; i++) {
      if (assign[i] === tiny) assign[i] = other;
    }
  }
}

function colorFar(seeds, alive, palette) {
  const n = palette.length;
  const idx = new Array(seeds.length).fill(0);
  const used = new Array(n).fill(0);
  for (let i = 0; i < seeds.length; i++) {
    if (!alive[i]) continue;
    let best = 0;
    let bestScore = -1e9;
    for (let c = 0; c < n; c++) {
      let near = 1e9;
      for (let j = 0; j < i; j++) {
        if (!alive[j] || idx[j] !== c) continue;
        const dx = seeds[i][0] - seeds[j][0];
        const dy = seeds[i][1] - seeds[j][1];
        const d = dx * dx + dy * dy;
        if (d < near) near = d;
      }
      const score = near - used[c] * 22;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    idx[i] = best;
    used[best] += 1;
  }
  return idx.map((c) => palette[c]);
}

function paintFace(spots, cols, rows, palette, rng, clusterMin = CLUSTER_MIN) {
  const out = new Array(cols * rows).fill(null);
  if (spots.length === 0) return out;
  const target = Math.max(clusterMin, Math.round(spots.length / Math.max(4, palette.length + 2)));
  const want = Math.max(palette.length, Math.round(spots.length / target));
  const seeds = pickSeeds(spots, want, rng);
  const assign = new Array(spots.length);
  for (let i = 0; i < spots.length; i++) assign[i] = nearestSeed(spots[i][0], spots[i][1], seeds);
  const minSize = Math.min(Math.max(clusterMin, Math.round(spots.length / (palette.length * 3))), spots.length);
  mergeTiny(spots, assign, seeds, minSize);
  const alive = new Array(seeds.length).fill(false);
  for (let i = 0; i < assign.length; i++) alive[assign[i]] = true;
  const painted = colorFar(seeds, alive, palette);
  for (let i = 0; i < spots.length; i++) {
    const [x, y] = spots[i];
    out[y * cols + x] = painted[assign[i]];
  }
  return out;
}

function shuffleIn(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

function hueDist(a, b) {
  const d = Math.abs(TOKEN_HUE[a] - TOKEN_HUE[b]);
  return Math.min(d, 360 - d);
}

function clashes(a, b) {
  for (const group of CLASH_GROUPS) {
    if (group.includes(a) && group.includes(b)) return true;
  }
  return false;
}

function paletteFor(id, count, rng) {
  const bag = ALL_COLOR_TOKENS.slice();
  shuffleIn(bag, rng);
  const n = Math.max(2, Math.min(ALL_COLOR_TOKENS.length, count));
  const out = [];
  const blocked = (token, minHue) =>
    out.some((t) => clashes(t, token) || hueDist(t, token) < minHue);
  const take = (minHue) => {
    for (const token of bag) {
      if (out.length >= n) return;
      if (out.includes(token)) continue;
      if (blocked(token, minHue)) continue;
      out.push(token);
    }
  };
  take(48);
  if (out.length < n) take(36);
  if (out.length < n) take(1);
  return out.length > 0 ? out : [bag[0]];
}

function sizeFor(id) {
  const t = Math.max(0, (id - 2) / Math.max(1, LEVEL_COUNT - 2));
  const e = Math.sqrt(t);
  return {
    cols: 16 + Math.round(e * 8),
    rows: 12 + Math.round(e * 8),
    depth: 5 + Math.round(e * 6),
    colors: 6 + Math.round(e * 2),
  };
}

function countBricks(cells) {
  const counts = new Map();
  for (const cell of cells) {
    if (!cell) continue;
    for (const token of cell.tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function buildGrid(cells, cols, rows) {
  const grid = [];
  let remain = 0;
  for (let x = 0; x < cols; x++) {
    grid[x] = [];
    for (let y = 0; y < rows; y++) {
      const cell = cells[y * cols + x];
      const layers = cell ? cell.tokens.slice() : [];
      grid[x][y] = [];
      for (let z = 0; z < layers.length; z++) {
        grid[x][y][z] = layers[z];
        remain += 1;
      }
    }
  }
  return { grid, remain };
}

function plateBlocks(row, ironRows, aboveBy) {
  for (let i = 0; i < ironRows.length; i++) {
    const p = ironRows[i];
    if (row < p && (aboveBy.get(p) ?? 0) > 0) return true;
  }
  return false;
}

function clearAbove(grid, col, row, layer, ironRows, aboveBy) {
  if (plateBlocks(row, ironRows, aboveBy)) return false;
  const rows = grid[col]?.length ?? 0;
  for (let y = row + 1; y < rows; y++) {
    const token = grid[col][y][layer];
    if (token != null && token !== grid[col][row][layer]) return false;
  }
  return true;
}

function colHasMatch(grid, col, color, ironRows, aboveBy) {
  const rows = grid[col]?.length ?? 0;
  for (let y = 0; y < rows; y++) {
    const layers = grid[col][y];
    for (let z = 0; z < layers.length; z++) {
      if (layers[z] === color && clearAbove(grid, col, y, z, ironRows, aboveBy)) return true;
    }
  }
  return false;
}

function accessibleCount(grid, color, ironRows, aboveBy) {
  let n = 0;
  for (let x = 0; x < grid.length; x++) {
    const rows = grid[x].length;
    for (let y = 0; y < rows; y++) {
      const layers = grid[x][y];
      for (let z = 0; z < layers.length; z++) {
        if (layers[z] === color && clearAbove(grid, x, y, z, ironRows, aboveBy)) n += 1;
      }
    }
  }
  return n;
}

function eatOne(grid, color, homeCol, ironRows, aboveBy) {
  const cols = grid.length;
  let home = -1;
  if (homeCol >= 0 && homeCol < cols && colHasMatch(grid, homeCol, color, ironRows, aboveBy)) home = homeCol;
  else {
    let best = 1e9;
    for (let x = 0; x < cols; x++) {
      if (!colHasMatch(grid, x, color, ironRows, aboveBy)) continue;
      const d = (x - homeCol) * (x - homeCol);
      if (d < best) {
        best = d;
        home = x;
      }
    }
  }
  if (home < 0) return null;
  let lo = home;
  let hi = home;
  while (lo > 0 && colHasMatch(grid, lo - 1, color, ironRows, aboveBy)) lo -= 1;
  while (hi < cols - 1 && colHasMatch(grid, hi + 1, color, ironRows, aboveBy)) hi += 1;
  let bestCol = -1;
  let bestRow = -1;
  let bestLayer = -1;
  let bestScore = -1e9;
  for (let x = lo; x <= hi; x++) {
    for (let y = 0; y < grid[x].length; y++) {
      for (let z = 0; z < grid[x][y].length; z++) {
        if (grid[x][y][z] !== color || !clearAbove(grid, x, y, z, ironRows, aboveBy)) continue;
        const score = y * 1000 - z * 10 - Math.abs(x - home);
        if (score > bestScore) {
          bestScore = score;
          bestCol = x;
          bestRow = y;
          bestLayer = z;
        }
      }
    }
  }
  if (bestCol < 0) return null;
  grid[bestCol][bestRow][bestLayer] = null;
  return bestRow;
}

function occupiedYRange(cells, cols, rows) {
  let minY = rows;
  let maxY = -1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!cells[y * cols + x]) continue;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minY, maxY };
}

function pickIronRows(id, cells, cols, rows) {
  if (id < 5 || id > 10) return [];
  const { minY, maxY } = occupiedYRange(cells, cols, rows);
  const span = maxY - minY;
  if (span < 4) return [];
  if (id <= 7) {
    const aboveWant = id === 5 ? 2 : id === 6 ? 3 : Math.max(3, Math.floor(span * 0.48));
    const row = Math.max(minY + 2, Math.min(maxY - 1, maxY - aboveWant));
    return row > minY && row <= maxY ? [row] : [];
  }
  let top = maxY - (id === 10 ? 2 : 3);
  let bot = minY + (id === 8 ? 2 : 3);
  if (top - bot < 2) {
    top = minY + Math.floor(span * 0.66);
    bot = minY + Math.floor(span * 0.33);
  }
  if (top <= bot) return [minY + Math.floor(span / 2)];
  return [bot, top];
}

function splitToMinUnits(units, minCount) {
  const raw = units.map((u) => [u[0], u[1]]);
  while (raw.length < minCount) {
    let best = -1;
    let bestN = 1;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i][1] > bestN) {
        bestN = raw[i][1];
        best = i;
      }
    }
    if (best < 0) break;
    const [color, n] = raw[best];
    const a = n >> 1;
    raw.splice(best, 1, [color, a], [color, n - a]);
  }
  return raw;
}

function planSolvableUnits(cells, cols, rows, rng, ironRows) {
  const built = buildGrid(cells, cols, rows);
  const grid = built.grid;
  let remain = built.remain;
  if (remain <= 0) return [];
  const remainBy = new Map();
  const aboveBy = new Map();
  for (let i = 0; i < ironRows.length; i++) aboveBy.set(ironRows[i], 0);
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      for (let z = 0; z < grid[x][y].length; z++) {
        const token = grid[x][y][z];
        if (token == null) continue;
        remainBy.set(token, (remainBy.get(token) ?? 0) + 1);
        for (let i = 0; i < ironRows.length; i++) {
          if (y >= ironRows[i]) aboveBy.set(ironRows[i], (aboveBy.get(ironRows[i]) ?? 0) + 1);
        }
      }
    }
  }
  const homeCol = (cols - 1) >> 1;
  const units = [];
  while (remain > 0) {
    const options = [];
    const finish = [];
    for (const token of ALL_COLOR_TOKENS) {
      if ((remainBy.get(token) ?? 0) <= 0) continue;
      const acc = accessibleCount(grid, token, ironRows, aboveBy);
      if (acc <= 0) continue;
      options.push(token);
      if (acc === remainBy.get(token)) finish.push(token);
    }
    if (options.length === 0) break;
    const color = finish.length > 0 && rng.next() < 0.45
      ? finish[rng.int(finish.length)]
      : options[rng.int(options.length)];
    const bite = accessibleCount(grid, color, ironRows, aboveBy);
    let ate = 0;
    while (ate < bite) {
      const row = eatOne(grid, color, homeCol, ironRows, aboveBy);
      if (row == null) break;
      for (let i = 0; i < ironRows.length; i++) {
        if (row >= ironRows[i]) aboveBy.set(ironRows[i], Math.max(0, (aboveBy.get(ironRows[i]) ?? 1) - 1));
      }
      remainBy.set(color, (remainBy.get(color) ?? 1) - 1);
      ate += 1;
      remain -= 1;
    }
    if (ate <= 0) break;
    units.push([color, ate]);
  }
  return splitToMinUnits(units, 30);
}

function makeCell(tokens) {
  return { tokens };
}

function stack(token, depth) {
  const tokens = [];
  for (let z = 0; z < depth; z++) tokens.push(token);
  return makeCell(tokens);
}

function unitsFromCounts(palette, cells) {
  const counts = countBricks(cells);
  return palette
    .filter((token) => (counts.get(token) ?? 0) > 0)
    .map((token) => [token, counts.get(token) ?? 0]);
}

function makeClassicLevel() {
  const cols = 15;
  const rows = 11;
  const depth = 4;
  const palette = ['o', 'y', 'c', 'g', 'p', 'r'];
  const cells = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const token = palette[Math.min(palette.length - 1, Math.floor((x * palette.length) / cols))];
      cells.push(stack(token, depth));
    }
  }
  return {
    id: 1,
    cols,
    rows,
    cells,
    units: unitsFromCounts(palette, cells),
    palette,
    brickMix: 0,
    ironRow: -1,
    ironRows: [],
  };
}

function mixBackLayers(cells, palette, rng, mix) {
  if (mix <= 0 || palette.length < 2) return;
  for (const cell of cells) {
    if (!cell || cell.tokens.length < 2) continue;
    for (let z = 1; z < cell.tokens.length; z++) {
      if (rng.next() >= mix) continue;
      let token = palette[rng.int(palette.length)];
      if (token === cell.tokens[z] && palette.length > 1) {
        token = palette[(palette.indexOf(token) + 1) % palette.length];
      }
      cell.tokens[z] = token;
    }
  }
}

function makeLevel(id) {
  if (id === 1) return makeClassicLevel();
  const rng = new Rng(id * 2654435761);
  const size = sizeFor(id);
  const kind = (id - 1) % 50;
  const alt = Math.floor((id - 1) / 50);
  const brickMix = id < 28 ? 0 : Math.min(0.16, (id - 28) / 450);
  if (id >= 5 && id <= 10) size.colors = Math.min(8, size.colors + 1);
  const palette = paletteFor(id, size.colors, rng);
  const fat = 0.74;
  const occ = new Array(size.cols * size.rows).fill(false);
  let filled = 0;
  for (let y = 0; y < size.rows; y++) {
    for (let x = 0; x < size.cols; x++) {
      const u = size.cols <= 1 ? 0 : (x / (size.cols - 1)) * 2 - 1;
      const v = size.rows <= 1 ? 0 : (y / (size.rows - 1)) * 2 - 1;
      if (occupied(kind, u * fat, v * fat, alt, id)) {
        occ[y * size.cols + x] = true;
        filled += 1;
      }
    }
  }
  const minFill = Math.floor(size.cols * size.rows * 0.55);
  if (filled < minFill) {
    for (let y = 0; y < size.rows; y++) {
      for (let x = 0; x < size.cols; x++) {
        const i = y * size.cols + x;
        if (occ[i]) continue;
        const u = size.cols <= 1 ? 0 : (x / (size.cols - 1)) * 2 - 1;
        const v = size.rows <= 1 ? 0 : (y / (size.rows - 1)) * 2 - 1;
        if (Math.abs(u) < 0.92 && Math.abs(v) < 0.88) {
          occ[i] = true;
          filled += 1;
        }
      }
    }
  }
  const spots = [];
  for (let y = 0; y < size.rows; y++) {
    for (let x = 0; x < size.cols; x++) {
      if (occ[y * size.cols + x]) spots.push([x, y]);
    }
  }
  const face = paintFace(spots, size.cols, size.rows, palette, rng, id >= 5 && id <= 10 ? 4 : CLUSTER_MIN);
  const cells = [];
  for (let y = 0; y < size.rows; y++) {
    for (let x = 0; x < size.cols; x++) {
      const i = y * size.cols + x;
      if (!occ[i]) {
        cells.push(null);
        continue;
      }
      const token = face[i] ?? palette[0];
      const tokens = [];
      for (let z = 0; z < size.depth; z++) tokens.push(token);
      cells.push(makeCell(tokens));
    }
  }
  mixBackLayers(cells, palette, rng, brickMix);
  let ironRows = pickIronRows(id, cells, size.cols, size.rows);
  let units = planSolvableUnits(cells, size.cols, size.rows, rng, ironRows);
  if (!unitsCover(cells, units) && ironRows.length > 1) {
    ironRows = [ironRows[ironRows.length - 1]];
    units = planSolvableUnits(cells, size.cols, size.rows, rng, ironRows);
  }
  if (!unitsCover(cells, units) && ironRows.length) {
    ironRows = [];
    units = planSolvableUnits(cells, size.cols, size.rows, rng, ironRows);
  }
  return {
    id,
    cols: size.cols,
    rows: size.rows,
    cells,
    units,
    palette,
    brickMix,
    ironRow: ironRows.length ? ironRows[ironRows.length - 1] : -1,
    ironRows,
  };
}

function unitsCover(cells, units) {
  const counts = countBricks(cells);
  const unitBy = new Map();
  for (const [c, p] of units) unitBy.set(c, (unitBy.get(c) ?? 0) + p);
  let bricks = 0;
  let power = 0;
  for (const n of counts.values()) bricks += n;
  for (const n of unitBy.values()) power += n;
  return bricks === power && bricks > 0;
}

function encodeLevel(level) {
  return {
    id: level.id,
    cols: level.cols,
    rows: level.rows,
    ironRow: level.ironRow,
    ironRows: level.ironRows ?? [],
    brickMix: level.brickMix,
    palette: level.palette.join(''),
    units: level.units,
    cells: level.cells.map((cell) => (cell ? cell.tokens.join('') : null)),
  };
}

function jsonMeta(uuid) {
  return {
    ver: '2.0.1',
    importer: 'json',
    imported: true,
    uuid,
    files: ['.json'],
    subMetas: {},
    userData: {},
  };
}

const t0 = Date.now();
const levels = [];
for (let id = 1; id <= LEVEL_COUNT; id++) {
  const level = makeLevel(id);
  levels.push(encodeLevel(level));
  const bricks = level.cells.reduce((n, cell) => n + (cell ? cell.tokens.length : 0), 0);
  console.log(
    `L${String(id).padStart(3)} ${level.cols}x${level.rows} iron=${(level.ironRows || []).join('/') || '-'} bricks=${bricks} units=${level.units.length}`,
  );
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify({ generatedBy: 'tools/bake-levels.js', count: levels.length, levels })}\n`);
fs.writeFileSync(META, `${JSON.stringify(jsonMeta(UUID), null, 2)}\n`);
const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log(`wrote ${path.relative(ROOT, OUT)} (${kb} KB, ${Date.now() - t0} ms)`);
