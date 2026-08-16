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
  ['o', 'y', 'd'],
  ['p', 'v', 'a'],
  ['c', 's'],
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

function decadeOf(id) {
  return Math.floor((id - 1) / 10);
}

function isTeachLevel(id) {
  return id === 1 || id === 2 || id === 11 || id === 21 || id === 31 || id === 41 || id === 51;
}

function sizeFor(id) {
  const d = decadeOf(id);
  const t = (id - 1) % 10;
  const cols = Math.min(16, 12 + Math.floor(d * 0.45) + Math.floor(t * 0.3));
  const rows = Math.min(12, 9 + Math.floor(d * 0.35) + Math.floor(t * 0.2));
  const depth = Math.min(10, 5 + d);
  const colors = Math.min(6, 3 + Math.floor(d * 0.35) + (t >= 5 ? 1 : 0));
  return { cols, rows, depth, colors };
}

function minUnitsFor(id) {
  if (isTeachLevel(id)) return id <= 2 ? 1 : 3;
  return 36 + decadeOf(id) * 2 + Math.floor(((id - 1) % 10) * 0.6);
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

let IRON_GAPS = [];

function plateBlocks(row, col, ironRows, aboveBy) {
  if (IRON_GAPS.includes(col)) return false;
  for (let i = 0; i < ironRows.length; i++) {
    const p = ironRows[i];
    if (row < p && (aboveBy.get(p) ?? 0) > 0) return true;
  }
  return false;
}

function clearAbove(grid, col, row, layer, ironRows, aboveBy) {
  if (plateBlocks(row, col, ironRows, aboveBy)) return false;
  const color = grid[col][row][layer];
  const front = grid[col][row];
  for (let z = 0; z < layer; z++) {
    if (front[z] != null && front[z] !== color) return false;
  }
  const rows = grid[col]?.length ?? 0;
  for (let y = row + 1; y < rows; y++) {
    const token = grid[col][y][layer];
    if (token != null && token !== color) return false;
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

function chooseIronRows(cells, cols, rows, count) {
  if (count <= 0) return [];
  const { minY, maxY } = occupiedYRange(cells, cols, rows);
  const span = maxY - minY;
  if (span < 4) return [];
  if (count === 1) {
    const row = Math.max(minY + 2, Math.min(maxY - 1, minY + Math.floor(span * 0.55)));
    return row > minY && row <= maxY ? [row] : [];
  }
  let top = maxY - 2;
  let bot = minY + 2;
  if (top - bot < 2) {
    top = minY + Math.floor(span * 0.66);
    bot = minY + Math.floor(span * 0.33);
  }
  if (top <= bot) return [minY + Math.floor(span / 2)];
  return [bot, top];
}

function chooseIronGaps(cols, count) {
  if (count <= 0 || cols < 5) return [];
  const mid = (cols - 1) >> 1;
  const gaps = [mid];
  if (count > 1 && mid + 2 < cols) gaps.push(mid + 2);
  if (count > 2 && mid - 2 >= 0) gaps.push(mid - 2);
  return gaps.slice(0, count);
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

function planSolvableUnits(cells, cols, rows, rng, ironRows, ironGaps = [], minUnits = 12) {
  IRON_GAPS = ironGaps;
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
  return splitToMinUnits(units, minUnits);
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

function emptyLevelExtras() {
  return {
    brickMix: 0,
    ironRow: -1,
    ironRows: [],
    ironGaps: [],
    sandCols: [],
    rescuePower: 5,
    raftX: 0,
    raftY: 0,
    raftW: 0,
    raftH: 0,
    raftTravel: 0,
    raftPeriod: 2.5,
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

function applyFlagMask(cells, cols, rows, mask, key) {
  for (let fy = 0; fy < mask.length; fy++) {
    const y = rows - 1 - fy;
    const line = mask[fy];
    for (let x = 0; x < cols; x++) {
      if (line[x] !== '*') continue;
      const cell = cells[y * cols + x];
      if (!cell) continue;
      cell[key] = cell.tokens.map((_, z) => z === 0);
    }
  }
}

function applyBombMask(cells, cols, rows, mask) {
  applyFlagMask(cells, cols, rows, mask, 'bomb');
}

function tutorialBase(id, palette, face, units, extra = {}) {
  const { cols, rows, cells } = cellsFromFace(face, extra.depth ?? 1, extra);
  if (extra.paint) applyFlagMask(cells, cols, rows, extra.paint, 'paint');
  if (extra.magnet) applyFlagMask(cells, cols, rows, extra.magnet, 'magnet');
  if (extra.bomb) applyBombMask(cells, cols, rows, extra.bomb);
  const ironRows = extra.ironRows ?? [];
  return {
    id,
    cols,
    rows,
    cells,
    units,
    palette,
    ...emptyLevelExtras(),
    ironRow: ironRows.length ? ironRows[ironRows.length - 1] : -1,
    ironRows,
    ironGaps: extra.ironGaps ?? [],
    sandCols: extra.sandCols ?? [],
    rescuePower: extra.rescuePower ?? 5,
    raftX: extra.raftX ?? 0,
    raftY: extra.raftY ?? 0,
    raftW: extra.raftW ?? 0,
    raftH: extra.raftH ?? 0,
    raftTravel: extra.raftTravel ?? 0,
    raftPeriod: extra.raftPeriod ?? 2.5,
  };
}

function makeAbsorbTutorial() {
  return tutorialBase(1, ['o'], [
    'ooooo',
    'ooooo',
    'ooooo',
  ], [['o', 15]]);
}

function makeAbsorbTwo() {
  return tutorialBase(2, ['o', 'c'], [
    'oooooccccc',
    'oooooccccc',
    'oooooccccc',
  ], [['o', 15], ['c', 15]]);
}

function makeIronTutorial() {
  return tutorialBase(11, ['y', 'c'], [
    'yyyyy',
    'yyyyy',
    'ccccc',
    'ccccc',
  ], [['y', 10], ['c', 10]], { ironRows: [2] });
}

function makePaintTutorial() {
  return tutorialBase(21, ['p', 'c'], [
    'ccpcc',
    'ccccc',
    'ccccc',
  ], [['p', 1], ['p', 5], ['c', 9]], {
    paint: ['..*..', '.....', '.....'],
  });
}

function makeRescueTutorial() {
  return tutorialBase(31, ['y', 'r', 'c'], [
    'rrrrr',
    'rrqrr',
    'rrrrr',
    'yyyyy',
    'ccccc',
  ], [['r', 14], ['c', 5]], {
    rescue: 'y',
    rescuePower: 5,
  });
}

function makeNailTutorial() {
  return tutorialBase(41, ['o', 'r', 'c'], [
    'ooooooo',
    'ooRRRoo',
    'ccccccc',
  ], [['o', 11], ['r', 3], ['c', 7]]);
}

function makeBombTutorial() {
  return tutorialBase(51, ['y', 'p', 'r', 'c'], [
    '.pyp.',
    '.ppp.',
    'rrrrr',
    'ccccc',
  ], [['y', 1], ['r', 5], ['c', 5]], {
    bomb: ['..*..', '.....', '.....', '.....'],
  });
}

function cellsFromFace(face, depth, extra = {}) {
  const rows = face.length;
  const cols = face[0].length;
  const cells = [];
  for (let y = 0; y < rows; y++) {
    const line = face[rows - 1 - y];
    for (let x = 0; x < cols; x++) {
      const ch = line[x];
      if (!ch || ch === '.') {
        cells.push(null);
        continue;
      }
      if (ch === 'q' || ch === 'Q') {
        cells.push({ tokens: [], rescue: extra.rescue ?? 'y' });
        continue;
      }
      const up = ch >= 'A' && ch <= 'Z';
      const token = up ? ch.toLowerCase() : ch;
      const tokens = [];
      const locked = [];
      for (let z = 0; z < depth; z++) {
        tokens.push(token);
        locked.push(up);
      }
      cells.push(up ? { tokens, locked } : { tokens });
    }
  }
  return { cols, rows, cells };
}

function markFront(cell, key) {
  cell[key] = cell.tokens.map((_, z) => z === 0);
}

function occupiedCells(cells, cols, rows) {
  const out = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = cells[y * cols + x];
      if (cell?.tokens?.length) out.push({ x, y, cell });
    }
  }
  return out;
}

function neighborCount(cells, cols, rows, x, y) {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const cell = cells[(y + dy) * cols + (x + dx)];
      if (cell?.tokens?.length) n += 1;
    }
  }
  return n;
}

function placePaints(cells, cols, rows, count, rng) {
  const spots = occupiedCells(cells, cols, rows)
    .filter((s) => !s.cell.paint && !s.cell.bomb && !s.cell.magnet && !s.cell.locked)
    .sort((a, b) => neighborCount(cells, cols, rows, b.x, b.y) - neighborCount(cells, cols, rows, a.x, a.y));
  const picked = [];
  for (let i = 0; i < spots.length && picked.length < count; i++) {
    if (rng.next() > 0.7 && i + 1 < spots.length) continue;
    markFront(spots[i].cell, 'paint');
    picked.push(spots[i]);
  }
  return picked;
}

function placeBombs(cells, cols, rows, count, rng) {
  const spots = occupiedCells(cells, cols, rows)
    .filter((s) => !s.cell.paint && !s.cell.bomb && neighborCount(cells, cols, rows, s.x, s.y) >= 3);
  shuffleIn(spots, rng);
  const picked = [];
  for (let i = 0; i < spots.length && picked.length < count; i++) {
    markFront(spots[i].cell, 'bomb');
    picked.push(spots[i]);
  }
  return picked;
}

function placeLocks(cells, cols, rows, clusters, rng) {
  const spots = occupiedCells(cells, cols, rows).filter((s) => !s.cell.locked && s.y < rows - 1);
  shuffleIn(spots, rng);
  let placed = 0;
  for (const start of spots) {
    if (placed >= clusters) return;
    const token = start.cell.tokens[0];
    const group = [];
    const seen = new Set();
    const stack = [start];
    while (stack.length && group.length < 6) {
      const cur = stack.pop();
      const key = `${cur.x},${cur.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (cur.cell.tokens[0] !== token || cur.cell.locked) continue;
      group.push(cur);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) {
        const x = cur.x + dx;
        const y = cur.y + dy;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const cell = cells[y * cols + x];
        if (cell?.tokens?.length) stack.push({ x, y, cell });
      }
    }
    if (group.length < 3) continue;
    for (const g of group) {
      g.cell.locked = g.cell.tokens.map((_, z) => z === 0);
    }
    placed += 1;
  }
}

function placeRescues(cells, cols, rows, count, palette, rng) {
  const spots = occupiedCells(cells, cols, rows)
    .filter((s) => s.x > 0 && s.x < cols - 1 && s.y > 0 && s.y < rows - 1)
    .filter((s) => neighborCount(cells, cols, rows, s.x, s.y) >= 5);
  shuffleIn(spots, rng);
  const placed = [];
  const counts = countBricks(cells);
  for (let i = 0; i < spots.length && placed.length < count; i++) {
    const around = new Set();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const n = cells[(spots[i].y + dy) * cols + (spots[i].x + dx)];
        if (n?.tokens?.[0]) around.add(n.tokens[0]);
      }
    }
    const token = placed[0]
      || palette.find((t) => !around.has(t) && (counts.get(t) ?? 0) >= 4)
      || palette.find((t) => !around.has(t))
      || null;
    if (!token) continue;
    cells[spots[i].y * cols + spots[i].x] = { tokens: [], rescue: token };
    placed.push(token);
  }
  return placed;
}

function specFor(id) {
  const d = decadeOf(id);
  const t = (id - 1) % 10;
  const spec = {
    iron: 0,
    ironGaps: 0,
    paints: 0,
    bombs: 0,
    lockClusters: 0,
    rescues: 0,
  };
  if (d === 1) {
    spec.iron = t <= 6 ? 1 : 2;
    spec.ironGaps = t >= 6 ? 1 : 0;
  } else if (d === 2) {
    spec.paints = t <= 4 ? 1 : 2;
  } else if (d === 3) {
    spec.rescues = 1;
  } else if (d === 4) {
    spec.lockClusters = 1 + Math.floor(t / 3);
  } else if (d === 5) {
    spec.bombs = t <= 4 ? 1 : 2;
  } else if (d === 6) {
    spec.iron = t <= 4 ? 1 : 2;
    spec.lockClusters = t >= 3 ? 1 : 0;
    spec.ironGaps = t >= 7 ? 1 : 0;
  } else if (d === 7) {
    spec.paints = 1;
    spec.bombs = t >= 4 ? 1 : 0;
  } else if (d === 8) {
    spec.rescues = 1;
    spec.iron = t >= 3 ? 1 : 0;
    spec.lockClusters = t >= 6 ? 1 : 0;
  } else if (d === 9) {
    const mix = [
      { iron: 1, paints: 1 },
      { iron: 1, lockClusters: 1 },
      { bombs: 1, paints: 1 },
      { iron: 2, bombs: 1 },
      { rescues: 1, iron: 1 },
      { lockClusters: 1, paints: 1 },
      { bombs: 1, lockClusters: 1 },
      { iron: 1, lockClusters: 1, bombs: 1 },
      { paints: 1, rescues: 1 },
      { iron: 1, bombs: 1, lockClusters: 1 },
    ][t];
    Object.assign(spec, mix);
  }
  return spec;
}

function buildShapedCells(id, size, palette, rng) {
  const kind = (id - 1) % 50;
  const alt = Math.floor((id - 1) / 50);
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
  const minFill = Math.floor(size.cols * size.rows * (size.depth >= 2 ? 0.72 : 0.62));
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
  const clusterMin = 3;
  const layerFaces = [];
  for (let z = 0; z < size.depth; z++) {
    layerFaces.push(paintFace(spots, size.cols, size.rows, palette, rng, clusterMin));
  }
  const cells = [];
  for (let y = 0; y < size.rows; y++) {
    for (let x = 0; x < size.cols; x++) {
      const i = y * size.cols + x;
      if (!occ[i]) {
        cells.push(null);
        continue;
      }
      const tokens = [];
      for (let z = 0; z < size.depth; z++) {
        tokens.push(layerFaces[z][i] ?? palette[z % palette.length]);
      }
      cells.push(makeCell(tokens));
    }
  }
  return cells;
}

function planUnitsForBoard(cells, cols, rows, rng, ironRows, ironGaps, minUnits) {
  let units = planSolvableUnits(cells, cols, rows, rng, ironRows, ironGaps, minUnits);
  if (!unitsCover(cells, units) && ironRows.length > 1) {
    units = planSolvableUnits(cells, cols, rows, rng, [ironRows[ironRows.length - 1]], ironGaps, minUnits);
    if (unitsCover(cells, units)) return { units, ironRows: [ironRows[ironRows.length - 1]] };
  }
  if (!unitsCover(cells, units) && ironRows.length) {
    units = planSolvableUnits(cells, cols, rows, rng, [], ironGaps, minUnits);
    return { units, ironRows: [] };
  }
  return { units, ironRows };
}

function makeDecadeLevel(id) {
  const rng = new Rng(id * 2654435761);
  const size = sizeFor(id);
  if (id <= 10) size.colors = id <= 4 ? 3 : 4;
  const palette = paletteFor(id, size.colors, rng);
  const cells = buildShapedCells(id, size, palette, rng);
  const spec = specFor(id);
  const extra = emptyLevelExtras();
  extra.brickMix = 0;
  if (spec.paints) placePaints(cells, size.cols, size.rows, spec.paints, rng);
  if (spec.bombs) placeBombs(cells, size.cols, size.rows, spec.bombs, rng);
  if (spec.lockClusters) placeLocks(cells, size.cols, size.rows, spec.lockClusters, rng);
  if (spec.rescues) placeRescues(cells, size.cols, size.rows, spec.rescues, palette, rng);

  let ironRows = chooseIronRows(cells, size.cols, size.rows, spec.iron);
  const ironGaps = chooseIronGaps(size.cols, spec.ironGaps);
  extra.ironGaps = ironGaps;
  const planned = planUnitsForBoard(
    cells,
    size.cols,
    size.rows,
    rng,
    ironRows,
    ironGaps,
    minUnitsFor(id),
  );
  ironRows = planned.ironRows;
  extra.ironRows = ironRows;
  extra.ironRow = ironRows.length ? ironRows[ironRows.length - 1] : -1;
  let units = planned.units;
  if (spec.rescues) {
    const counts = countBricks(cells);
    const rescueTokens = new Set();
    for (const cell of cells) {
      if (cell?.rescue) rescueTokens.add(cell.rescue);
    }
    const dropColor = spec.iron === 0 && spec.paints === 0 && spec.bombs === 0;
    if (rescueTokens.size && dropColor) {
      units = splitToMinUnits(
        units.filter((u) => !rescueTokens.has(u[0])),
        minUnitsFor(id),
      );
      let power = 5;
      for (const token of rescueTokens) power = counts.get(token) ?? 5;
      extra.rescuePower = power;
    } else if (rescueTokens.size) {
      extra.rescuePower = 5;
    }
  }
  return {
    id,
    cols: size.cols,
    rows: size.rows,
    cells,
    units,
    palette,
    ...extra,
  };
}

function makeLevel(id) {
  if (id === 1) return makeAbsorbTutorial();
  if (id === 2) return makeAbsorbTwo();
  if (id === 11) return makeIronTutorial();
  if (id === 21) return makePaintTutorial();
  if (id === 31) return makeRescueTutorial();
  if (id === 41) return makeNailTutorial();
  if (id === 51) return makeBombTutorial();
  return makeDecadeLevel(id);
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
    ironGaps: level.ironGaps ?? [],
    sandCols: level.sandCols ?? [],
    rescuePower: level.rescuePower ?? 5,
    raftX: level.raftX ?? 0,
    raftY: level.raftY ?? 0,
    raftW: level.raftW ?? 0,
    raftH: level.raftH ?? 0,
    raftTravel: level.raftTravel ?? 0,
    raftPeriod: level.raftPeriod ?? 2.5,
    brickMix: level.brickMix,
    palette: level.palette.join(''),
    units: level.units,
    cells: level.cells.map((cell) => {
      if (!cell) return null;
      if (cell.rescue) return `@${cell.rescue}`;
      return cell.tokens
        .map((t, z) => {
          const ch = cell.locked?.[z] ? t.toUpperCase() : t;
          if (cell.magnet?.[z]) return `^${ch}`;
          if (cell.paint?.[z]) return `!${ch}`;
          if (cell.bomb?.[z]) return `*${ch}`;
          return ch;
        })
        .join('');
    }),
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

function bakeAll() {
  const t0 = Date.now();
  const levels = [];
  for (let id = 1; id <= LEVEL_COUNT; id++) {
    const level = makeLevel(id);
    levels.push(encodeLevel(level));
    const pal = level.palette || [];
    for (let i = 0; i < pal.length; i++) {
      for (let j = i + 1; j < pal.length; j++) {
        if (clashes(pal[i], pal[j])) {
          throw new Error(`L${id} clash ${pal[i]}+${pal[j]}`);
        }
      }
    }
    const bricks = level.cells.reduce((n, cell) => n + (cell ? cell.tokens.length : 0), 0);
    const tags = [];
    if ((level.ironRows || []).length) tags.push(`iron=${level.ironRows.join('/')}`);
    if ((level.ironGaps || []).length) tags.push(`gap=${level.ironGaps.join(',')}`);
    if ((level.sandCols || []).length) tags.push(`sand=${level.sandCols.length}`);
    if ((level.raftW || 0) > 0) tags.push('raft');
    if (level.cells.some((c) => c?.paint?.some(Boolean))) tags.push('paint');
    if (level.cells.some((c) => c?.bomb?.some(Boolean))) tags.push('bomb');
    if (level.cells.some((c) => c?.magnet?.some(Boolean))) tags.push('magnet');
    if (level.cells.some((c) => c?.locked?.some(Boolean))) tags.push('nail');
    if (level.cells.some((c) => c?.rescue)) tags.push('rescue');
    const depth = level.cells.reduce((n, cell) => Math.max(n, cell ? cell.tokens.length : 0), 0);
    console.log(
      `L${String(id).padStart(3)} ${level.cols}x${level.rows}x${depth} ${tags.join(' ') || 'absorb'} bricks=${bricks} units=${level.units.length}`,
    );
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify({ generatedBy: 'tools/bake-levels.js', count: levels.length, levels })}\n`);
  fs.writeFileSync(META, `${JSON.stringify(jsonMeta(UUID), null, 2)}\n`);
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(`wrote ${path.relative(ROOT, OUT)} (${kb} KB, ${Date.now() - t0} ms)`);
}

if (require.main === module) bakeAll();

module.exports = { makeLevel, encodeLevel, bakeAll };
