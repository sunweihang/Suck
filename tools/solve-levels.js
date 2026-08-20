/** Port LevelCatalog + BattleDirector eat rules; check whether levels are winnable. */
const LEVEL_COUNT = 100;
const ALL_COLOR_TOKENS = ['o', 'y', 'c', 'g', 'p', 'v', 'r', 's', 'k', 'm', 'a', 'd'];
const BENCH = { cols: 4, rows: 4 };
const UNIT_SEATS = BENCH.cols * BENCH.rows;
const UNIT_MAX = UNIT_SEATS * 4;
const POWER_LO = 50;
const POWER_AIM = 65;
const POWER_HI = 90;
const SLOT_MAX = 6;
const SLOT_START = 4;
const TOKEN_HUE = {
  o: 28, y: 50, c: 182, g: 136, p: 330, v: 268,
  r: 355, s: 210, k: 10, m: 156, a: 312, d: 45,
};
/** Only block pairs that read as the same brick on the wall. */
const CLASH_GROUPS = [
  ['y', 'd'],
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
  pick(arr) {
    return arr[this.int(arr.length)];
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
      const c0 = hypot2(fx + 0.28, fy + 0.08) < 0.42;
      const c1 = hypot2(fx - 0.22, fy + 0.12) < 0.38;
      const c2 = hypot2(fx, fy - 0.18) < 0.4;
      const c3 = hypot2(fx + 0.02, fy + 0.28) < 0.34;
      return c0 || c1 || c2 || c3;
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
      const inner = Math.abs(fx) < 0.94 && Math.abs(fy) < 0.92;
      return inner && frame;
    }
    case 39: {
      const i0 = hypot2(fx + 0.55, fy + 0.35) < 0.32;
      const i1 = hypot2(fx - 0.5, fy + 0.28) < 0.3;
      const i2 = hypot2(fx + 0.08, fy - 0.42) < 0.36;
      const i3 = hypot2(fx - 0.15, fy + 0.55) < 0.22;
      return i0 || i1 || i2 || i3;
    }
    case 40: {
      const ang = Math.atan2(fy, fx);
      const r = hypot2(fx, fy);
      const spiral = (ang + Math.PI) / (Math.PI * 2) + Math.floor(r * 2.4);
      return Math.abs((spiral % 1) - 0.5) < 0.22 && r < 0.96;
    }
    case 41:
      return ((Math.floor((fx + 1) * 4) + Math.floor((fy + 1) * 4)) & 1) === 0 && hypot2(fx, fy) < 1.02;
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

const CLUSTER_MIN = 6;

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

function paintFace(spots, cols, rows, palette, rng) {
  const out = new Array(cols * rows).fill(null);
  if (spots.length === 0) return out;
  const target = Math.max(CLUSTER_MIN, Math.round(spots.length / Math.max(4, palette.length + 2)));
  const want = Math.max(palette.length, Math.round(spots.length / target));
  const seeds = pickSeeds(spots, want, rng);
  const assign = new Array(spots.length);
  for (let i = 0; i < spots.length; i++) assign[i] = nearestSeed(spots[i][0], spots[i][1], seeds);
  const minSize = Math.min(Math.max(CLUSTER_MIN, Math.round(spots.length / (palette.length * 3))), spots.length);
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
  if (out.length < n) take(24);
  if (out.length < n) take(12);
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
  const lock = [];
  const bomb = [];
  const magnet = [];
  const paint = [];
  let remain = 0;
  for (let x = 0; x < cols; x++) {
    grid[x] = [];
    lock[x] = [];
    bomb[x] = [];
    magnet[x] = [];
    paint[x] = [];
    for (let y = 0; y < rows; y++) {
      const cell = cells[y * cols + x];
      const layers = cell ? cell.tokens.slice() : [];
      const locked = cell && cell.locked ? cell.locked : [];
      const marked = cell && cell.bomb ? cell.bomb : [];
      const mags = cell && cell.magnet ? cell.magnet : [];
      const paints = cell && cell.paint ? cell.paint : [];
      grid[x][y] = [];
      lock[x][y] = [];
      bomb[x][y] = [];
      magnet[x][y] = [];
      paint[x][y] = [];
      for (let z = 0; z < layers.length; z++) {
        grid[x][y][z] = layers[z];
        lock[x][y][z] = !!locked[z];
        bomb[x][y][z] = !!marked[z];
        magnet[x][y][z] = !!mags[z];
        paint[x][y][z] = !!paints[z];
        remain += 1;
      }
    }
  }
  grid.lock = lock;
  grid.bomb = bomb;
  grid.magnet = magnet;
  grid.paint = paint;
  grid.spawns = [];
  refreshLocks(grid);
  return { grid, lock, remain };
}

function cellLocked(grid, col, row, layer) {
  return !!grid.lock?.[col]?.[row]?.[layer];
}

function cellBomb(grid, col, row, layer) {
  return !!grid.bomb?.[col]?.[row]?.[layer];
}

function specialRing(x, y, visit, span = 4) {
  for (let yy = y - 1; yy <= y + span; yy++) {
    for (let xx = x - 1; xx <= x + span; xx++) {
      if (xx >= x && xx < x + span && yy >= y && yy < y + span) continue;
      visit(xx, yy);
    }
  }
}

function blastPlus(grid, x, y, z) {
  let n = 0;
  const chain = [];
  specialRing(x, y, (nx, ny) => {
    if (grid[nx]?.[ny]?.[z] == null) return;
    const boom = cellBomb(grid, nx, ny, z);
    grid[nx][ny][z] = null;
    if (grid.lock?.[nx]?.[ny]) grid.lock[nx][ny][z] = false;
    if (grid.bomb?.[nx]?.[ny]) grid.bomb[nx][ny][z] = false;
    n += 1;
    if (boom) chain.push([nx, ny, z]);
  });
  for (let i = 0; i < chain.length; i++) n += blastPlus(grid, chain[i][0], chain[i][1], chain[i][2]);
  return n;
}

function lockGroupHeld(grid, sx, sy, sz, seen) {
  const walk = [[-1, 0], [1, 0], [0, 1], [0, -1]];
  const hold = [[-1, 0], [1, 0], [0, 1]];
  const stack = [[sx, sy, sz]];
  const group = [];
  let held = false;
  while (stack.length) {
    const [x, y, z] = stack.pop();
    const key = `${x},${y},${z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    group.push([x, y, z]);
    for (let i = 0; i < hold.length; i++) {
      const nx = x + hold[i][0];
      const ny = y + hold[i][1];
      if (grid[nx]?.[ny]?.[z] == null) continue;
      if (!cellLocked(grid, nx, ny, z)) held = true;
    }
    for (let i = 0; i < walk.length; i++) {
      const nx = x + walk[i][0];
      const ny = y + walk[i][1];
      if (grid[nx]?.[ny]?.[z] == null) continue;
      if (cellLocked(grid, nx, ny, z)) stack.push([nx, ny, z]);
    }
  }
  return { group, held };
}

function refreshLocks(grid) {
  const lock = grid.lock;
  if (!lock) return;
  const seen = new Set();
  for (let x = 0; x < grid.length; x++) {
    for (let y = 0; y < grid[x].length; y++) {
      for (let z = 0; z < grid[x][y].length; z++) {
        if (!lock[x][y][z] || grid[x][y][z] == null) continue;
        if (seen.has(`${x},${y},${z}`)) continue;
        const { group, held } = lockGroupHeld(grid, x, y, z, seen);
        if (held) continue;
        for (let i = 0; i < group.length; i++) {
          const [gx, gy, gz] = group[i];
          lock[gx][gy][gz] = false;
        }
      }
    }
  }
}

function clonePlayGrid(grid) {
  const next = grid.map((col) => col.map((row) => row.slice()));
  if (grid.lock) {
    next.lock = grid.lock.map((col) => col.map((row) => row.slice()));
  }
  if (grid.bomb) {
    next.bomb = grid.bomb.map((col) => col.map((row) => row.slice()));
  }
  if (grid.magnet) {
    next.magnet = grid.magnet.map((col) => col.map((row) => row.slice()));
  }
  if (grid.paint) {
    next.paint = grid.paint.map((col) => col.map((row) => row.slice()));
  }
  next.spawns = [];
  return next;
}

let IRON_ROWS = [];
let IRON_GAPS = [];
const RULES = {
  sand: new Set(),
  slideRow: -1,
  slideEvery: 0,
  slideDir: 1,
  balloonPower: 3,
  suckCount: 0,
};

function setPlayRules(level) {
  setIronRows(level);
  RULES.sand = new Set(Array.isArray(level.sandCols) ? level.sandCols : []);
  RULES.rescuePower = level.rescuePower ?? 5;
  RULES.suckCount = 0;
}

function setIronRows(level) {
  if (Array.isArray(level.ironRows) && level.ironRows.length) {
    IRON_ROWS = level.ironRows.filter((n) => n >= 0).sort((a, b) => a - b);
  } else if ((level.ironRow ?? -1) >= 0) {
    IRON_ROWS = [level.ironRow];
  } else {
    IRON_ROWS = [];
  }
  IRON_GAPS = Array.isArray(level.ironGaps) ? level.ironGaps.filter((n) => n >= 0) : [];
}

function hasBrickAbovePlate(grid, ironRow) {
  if (ironRow < 0) return false;
  for (let x = 0; x < grid.length; x++) {
    for (let y = ironRow; y < grid[x].length; y++) {
      const layers = grid[x][y];
      for (let z = 0; z < layers.length; z++) {
        if (layers[z] != null) return true;
      }
    }
  }
  return false;
}

function plateBlocksGrid(grid, row, col) {
  if (IRON_GAPS.includes(col)) return false;
  for (let i = 0; i < IRON_ROWS.length; i++) {
    const p = IRON_ROWS[i];
    if (row < p && hasBrickAbovePlate(grid, p)) return true;
  }
  return false;
}

function isSandBottom(grid, col, row, layer) {
  if (!RULES.sand.has(col)) return false;
  for (let y = 0; y < row; y++) {
    if (grid[col][y][layer] != null) return false;
  }
  return true;
}

function clearAboveGrid(grid, col, row, layer, ghost) {
  if (cellLocked(grid, col, row, layer)) return false;
  if (plateBlocksGrid(grid, row, col)) return false;
  if (ghost) return true;
  const color = grid[col][row][layer];
  const front = grid[col][row];
  for (let z = 0; z < layer; z++) {
    if (front[z] != null && front[z] !== color) return false;
  }
  if (isSandBottom(grid, col, row, layer)) return true;
  const rows = grid[col]?.length ?? 0;
  for (let y = row + 1; y < rows; y++) {
    const token = grid[col][y][layer];
    if (token != null && token !== color) return false;
  }
  return true;
}

function colHasMatchGrid(grid, col, color, ghost) {
  const rows = grid[col]?.length ?? 0;
  for (let y = 0; y < rows; y++) {
    const layers = grid[col][y];
    for (let z = 0; z < layers.length; z++) {
      if (layers[z] === color && clearAboveGrid(grid, col, y, z, ghost)) return true;
    }
  }
  return false;
}

function accessibleCountGrid(grid, color, ghost) {
  let n = 0;
  for (let x = 0; x < grid.length; x++) {
    for (let y = 0; y < grid[x].length; y++) {
      for (let z = 0; z < grid[x][y].length; z++) {
        if (grid[x][y][z] === color && clearAboveGrid(grid, x, y, z, ghost)) n += 1;
      }
    }
  }
  return n;
}

function remainingCountGrid(grid, color) {
  let n = 0;
  for (let x = 0; x < grid.length; x++) {
    for (let y = 0; y < grid[x].length; y++) {
      for (let z = 0; z < grid[x][y].length; z++) {
        if (grid[x][y][z] === color) n += 1;
      }
    }
  }
  return n;
}

function readCell(grid, x, y, z) {
  return {
    token: grid[x]?.[y]?.[z] ?? null,
    lock: !!grid.lock?.[x]?.[y]?.[z],
    bomb: !!grid.bomb?.[x]?.[y]?.[z],
    magnet: !!grid.magnet?.[x]?.[y]?.[z],
    paint: !!grid.paint?.[x]?.[y]?.[z],
  };
}

function writeCell(grid, x, y, z, cell) {
  if (!grid[x][y]) grid[x][y] = [];
  while (grid[x][y].length <= z) grid[x][y].push(null);
  grid[x][y][z] = cell.token;
  const flags = [
    ['lock', cell.lock],
    ['bomb', cell.bomb],
    ['magnet', cell.magnet],
    ['paint', cell.paint],
  ];
  for (const [key, on] of flags) {
    if (!grid[key]) continue;
    if (!grid[key][x][y]) grid[key][x][y] = [];
    while (grid[key][x][y].length <= z) grid[key][x][y].push(false);
    grid[key][x][y][z] = !!on;
  }
}

function paintSplash(grid, x, y, z, color) {
  specialRing(x, y, (nx, ny) => {
    if (grid[nx]?.[ny]?.[z] != null) grid[nx][ny][z] = color;
  });
}

function settleSand(grid, col, layer) {
  if (!RULES.sand.has(col) || !grid[col]) return;
  const rows = grid[col].length;
  const packed = [];
  for (let y = 0; y < rows; y++) {
    const cell = readCell(grid, col, y, layer);
    if (cell.token != null) packed.push(cell);
    writeCell(grid, col, y, layer, { token: null, lock: false, bomb: false, magnet: false, paint: false });
  }
  for (let i = 0; i < packed.length; i++) writeCell(grid, col, i, layer, packed[i]);
}

function slideRow(grid) {
  const row = RULES.slideRow;
  if (row < 0) return;
  const cols = grid.length;
  const dir = RULES.slideDir >= 0 ? 1 : -1;
  let maxZ = 0;
  for (let x = 0; x < cols; x++) maxZ = Math.max(maxZ, grid[x][row]?.length ?? 0);
  for (let z = 0; z < maxZ; z++) {
    const cells = [];
    for (let x = 0; x < cols; x++) cells.push(readCell(grid, x, row, z));
    for (let x = 0; x < cols; x++) {
      writeCell(grid, x, row, z, cells[(x - dir + cols) % cols]);
    }
  }
}

function eatOneGrid(grid, color, homeCol, ghost, magnet) {
  const cols = grid.length;
  let home = -1;
  if (homeCol >= 0 && homeCol < cols && colHasMatchGrid(grid, homeCol, color, ghost)) home = homeCol;
  else {
    let best = 1e9;
    for (let x = 0; x < cols; x++) {
      if (!colHasMatchGrid(grid, x, color, ghost)) continue;
      const d = (x - homeCol) * (x - homeCol);
      if (d < best) {
        best = d;
        home = x;
      }
    }
  }
  if (home < 0) return false;
  let lo = magnet ? 0 : home;
  let hi = magnet ? cols - 1 : home;
  if (!magnet) {
    while (lo > 0 && colHasMatchGrid(grid, lo - 1, color, ghost)) lo -= 1;
    while (hi < cols - 1 && colHasMatchGrid(grid, hi + 1, color, ghost)) hi += 1;
  }
  let bestCol = -1;
  let bestRow = -1;
  let bestLayer = -1;
  let bestScore = -1e9;
  for (let x = lo; x <= hi; x++) {
    for (let y = 0; y < grid[x].length; y++) {
      for (let z = 0; z < grid[x][y].length; z++) {
        if (grid[x][y][z] !== color || !clearAboveGrid(grid, x, y, z, ghost)) continue;
        const sand = RULES.sand.has(x);
        const score = (sand ? -y : y) * 1000 - z * 10 - Math.abs(x - home);
        if (score > bestScore) {
          bestScore = score;
          bestCol = x;
          bestRow = y;
          bestLayer = z;
        }
      }
    }
  }
  if (bestCol < 0) return false;
  const wasBomb = cellBomb(grid, bestCol, bestRow, bestLayer);
  const wasPaint = !!grid.paint?.[bestCol]?.[bestRow]?.[bestLayer];
  const wasMagnet = !!grid.magnet?.[bestCol]?.[bestRow]?.[bestLayer];
  grid[bestCol][bestRow][bestLayer] = null;
  if (grid.lock?.[bestCol]?.[bestRow]) grid.lock[bestCol][bestRow][bestLayer] = false;
  if (grid.bomb?.[bestCol]?.[bestRow]) grid.bomb[bestCol][bestRow][bestLayer] = false;
  if (grid.magnet?.[bestCol]?.[bestRow]) grid.magnet[bestCol][bestRow][bestLayer] = false;
  if (grid.paint?.[bestCol]?.[bestRow]) grid.paint[bestCol][bestRow][bestLayer] = false;
  if (wasPaint) paintSplash(grid, bestCol, bestRow, bestLayer, color);
  if (wasMagnet) grid.lastMagnet = true;
  let cleared = 1;
  if (wasBomb) cleared += blastPlus(grid, bestCol, bestRow, bestLayer);
  settleSand(grid, bestCol, bestLayer);
  refreshLocks(grid);
  return cleared;
}

function planSolvableUnits(cells, cols, rows, rng) {
  const built = buildGrid(cells, cols, rows);
  const grid = built.grid;
  let remain = built.remain;
  if (remain <= 0) return [];
  const homeCol = (cols - 1) >> 1;
  const units = [];
  while (remain > 0) {
    const options = [];
    const finish = [];
    for (const token of ALL_COLOR_TOKENS) {
      const acc = accessibleCountGrid(grid, token);
      if (acc <= 0) continue;
      options.push(token);
      if (acc === remainingCountGrid(grid, token)) finish.push(token);
    }
    if (options.length === 0) break;
    const color = finish.length > 0 && rng.next() < 0.45
      ? finish[rng.int(finish.length)]
      : options[rng.int(options.length)];
    const acc = accessibleCountGrid(grid, color);
    const bite = acc;
    let ate = 0;
    while (ate < bite) {
      const n = eatOneGrid(grid, color, homeCol);
      if (!n) break;
      ate += 1;
      remain -= n;
    }
    if (ate <= 0) break;
    units.push([color, ate]);
  }
  return splitToMinUnits(units, 30);
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

function unitsFromCounts(palette, cells) {
  const counts = countBricks(cells);
  return palette.filter((t) => (counts.get(t) ?? 0) > 0).map((t) => [t, counts.get(t) ?? 0]);
}

function makeCell(tokens) {
  return { tokens };
}

function stack(token, depth) {
  const tokens = [];
  for (let z = 0; z < depth; z++) tokens.push(token);
  return makeCell(tokens);
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
  return { id: 1, cols, rows, cells, units: unitsFromCounts(palette, cells), palette, brickMix: 0, ironRow: -1, ironRows: [] };
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
  const face = paintFace(spots, size.cols, size.rows, palette, rng);
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
  const ironRows = pickIronRows(id, cells, size.cols, size.rows);
  IRON_ROWS = ironRows;
  return {
    id,
    cols: size.cols,
    rows: size.rows,
    cells,
    units: planSolvableUnits(cells, size.cols, size.rows, rng),
    palette,
    brickMix,
    ironRow: ironRows.length ? ironRows[ironRows.length - 1] : -1,
    ironRows,
  };
}

function pickIronRows(id, cells, cols, rows) {
  if (id < 5 || id > 10) return [];
  let minY = rows;
  let maxY = -1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!cells[y * cols + x]) continue;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
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

function slotHomeCols(cols) {
  const BLOCK_STEP = 0.38;
  const BLOCK_SIZE = 0.374;
  const ratio = BLOCK_SIZE / BLOCK_STEP;
  const spanX = Math.max(1, cols - 1 + ratio);
  const step = Math.min(BLOCK_STEP, (2 * 2.85) / spanX);
  const startX = -((cols - 1) * step) / 2;
  const homes = [];
  for (let i = 0; i < SLOT_MAX; i++) {
    const x = -((SLOT_MAX - 1) * 0.76) / 2 + i * 0.76;
    const col = Math.round((x - startX) / step);
    homes.push(Math.max(0, Math.min(cols - 1, col)));
  }
  return homes;
}

function slotStartsLocked(i) {
  const side = (SLOT_MAX - SLOT_START) >> 1;
  return i < side || i >= SLOT_MAX - side;
}

function cloneLevel(level) {
  return buildGrid(level.cells, level.cols, level.rows);
}

function colHasMatch(wall, col, color) {
  const { cols, rows, face, layers } = wall;
  for (let y = rows - 1; y >= 0; y--) {
    const i = y * cols + col;
    if (layers[i] <= 0) continue;
    return face[i] === color;
  }
  return false;
}

function accessibleCount(wall, color) {
  return accessibleCountGrid(wall.grid, color);
}

function eatOne(wall, color, homeCol) {
  const { cols, rows, face, layers } = wall;
  let home = -1;
  if (homeCol >= 0 && colHasMatch(wall, homeCol, color)) home = homeCol;
  else {
    let best = 1e9;
    for (let x = 0; x < cols; x++) {
      if (!colHasMatch(wall, x, color)) continue;
      const d = (x - homeCol) * (x - homeCol);
      if (d < best) {
        best = d;
        home = x;
      }
    }
  }
  if (home < 0) return false;
  let lo = home;
  let hi = home;
  while (lo > 0 && colHasMatch(wall, lo - 1, color)) lo -= 1;
  while (hi < cols - 1 && colHasMatch(wall, hi + 1, color)) hi += 1;
  let bestI = -1;
  let bestScore = -1e9;
  for (let x = lo; x <= hi; x++) {
    for (let y = 0; y < rows; y++) {
      const i = y * cols + x;
      if (layers[i] <= 0 || face[i] !== color) continue;
      let blocked = false;
      for (let yy = y + 1; yy < rows; yy++) {
        const j = yy * cols + x;
        if (layers[j] > 0 && face[j] !== color) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      const score = y * 1000 - Math.abs(x - home);
      if (score > bestScore) {
        bestScore = score;
        bestI = i;
      }
    }
  }
  if (bestI < 0) return false;
  layers[bestI] -= 1;
  wall.remain -= 1;
  return true;
}

function unitFromSpec(pair, id) {
  return {
    color: pair[0],
    power: pair[1],
    ghost: pair[2] === 'ghost',
    magnet: false,
    id,
  };
}

function collectRescues(level) {
  const list = [];
  for (let y = 0; y < level.rows; y++) {
    for (let x = 0; x < level.cols; x++) {
      const cell = level.cells[y * level.cols + x];
      if (cell?.rescue) {
        list.push({ x, y, color: cell.rescue, power: level.rescuePower ?? 5, freed: false });
      }
    }
  }
  return list;
}

function holdGlowMask(hx, hy, col, row, span = 4) {
  let m = 0;
  if (hx + 1 >= col && hx + 1 < col + span && hy >= row && hy < row + span) m |= 1;
  if (hx - 1 >= col && hx - 1 < col + span && hy >= row && hy < row + span) m |= 2;
  if (hx >= col && hx < col + span && hy + 1 >= row && hy + 1 < row + span) m |= 4;
  if (hx >= col && hx < col + span && hy - 1 >= row && hy - 1 < row + span) m |= 8;
  return m;
}

function rescueHeld(grid, r) {
  let held = false;
  specialRing(r.x, r.y, (x, y) => {
    if (held || !holdGlowMask(x, y, r.x, r.y)) return;
    const layers = grid[x]?.[y];
    if (!layers) return;
    for (let z = 0; z < layers.length; z++) {
      if (layers[z] == null) continue;
      if (layers[z] === r.color && !cellLocked(grid, x, y, z)) continue;
      held = true;
    }
  });
  return held;
}

function flushRescues(wall, bench) {
  for (const r of wall.rescues || []) {
    if (r.freed || rescueHeld(wall.grid, r)) continue;
    r.freed = true;
    bench[0].push({ color: r.color, power: r.power, ghost: false, magnet: false });
  }
}

function flushSpawns(wall, bench) {
  const list = wall.grid.spawns;
  if (!list || !list.length) return;
  while (list.length) {
    let best = 0;
    let bestN = 1e9;
    for (let c = 0; c < bench.length; c++) {
      if (bench[c].length < bestN) {
        bestN = bench[c].length;
        best = c;
      }
    }
    bench[best].push(list.shift());
  }
}

function eatAll(wall, unit) {
  let ate = 0;
  while (unit.power > 0) {
    wall.grid.lastMagnet = false;
    const n = eatOneGrid(wall.grid, unit.color, unit.homeCol, unit.ghost, unit.magnet);
    if (!n) break;
    if (wall.grid.lastMagnet) unit.magnet = true;
    unit.power -= 1;
    wall.remain -= n;
    ate += 1;
  }
  return ate;
}

function frontUnits(bench) {
  return bench.map((col) => (col.length ? col[0] : null));
}

function takeFront(bench, reserve, col) {
  const unit = bench[col].shift();
  while (bench[col].length < BENCH.rows && reserve.length) {
    bench[col].push(reserve.shift());
  }
  return unit;
}

function canAnySlotEat(wall, slots) {
  for (const s of slots) {
    if (!s || s.power <= 0) continue;
    if (accessibleCountGrid(wall.grid, s.color, s.ghost) > 0) return true;
    if (s.magnet && accessibleCountGrid(wall.grid, s.color, s.ghost) > 0) return true;
  }
  return false;
}

function tickWaiters(wall, slots) {
  let progressed = false;
  for (let i = 0; i < slots.length; i++) {
    const u = slots[i];
    if (!u || u.power <= 0) continue;
    const ate = eatAll(wall, u);
    if (ate) progressed = true;
    if (u.power <= 0) slots[i] = null;
  }
  return progressed;
}

function cloneState(state) {
  return {
    wall: {
      grid: clonePlayGrid(state.wall.grid),
      remain: state.wall.remain,
    },
    bench: state.bench.map((col) => col.map((u) => ({ color: u.color, power: u.power }))),
    reserve: state.reserve.map((u) => ({ color: u.color, power: u.power })),
    slots: state.slots.map((s) => (s ? { color: s.color, power: s.power, homeCol: s.homeCol } : null)),
    locked: state.locked.slice(),
  };
}

function openEmptySlots(state) {
  const idx = [];
  for (let i = 0; i < SLOT_MAX; i++) {
    if (!state.locked[i] && !state.slots[i]) idx.push(i);
  }
  return idx;
}

function filledCount(slots) {
  let n = 0;
  for (const s of slots) if (s) n += 1;
  return n;
}

function solveInOrder(level, opts = {}) {
  const allowUnlock = opts.allowUnlock !== false;
  setPlayRules(level);
  const homes = slotHomeCols(level.cols);
  const bench = Array.from({ length: BENCH.cols }, () => []);
  const shown = level.units.slice(0, UNIT_SEATS);
  const reserve = level.units.slice(UNIT_SEATS).map((pair, i) => unitFromSpec(pair, shown.length + i));
  shown.forEach((pair, i) => {
    bench[i % BENCH.cols].push(unitFromSpec(pair, i));
  });
  let nextId = shown.length;
  for (const u of reserve) u.id = nextId++;
  const wall = cloneLevel(level);
  wall.rescues = collectRescues(level);
  const slots = new Array(SLOT_MAX).fill(null);
  const locked = Array.from({ length: SLOT_MAX }, (_, i) => slotStartsLocked(i));
  let expect = 0;
  const log = [];
  for (let step = 0; step < 1500; step++) {
    if (wall.remain <= 0) return { ok: true, steps: step, log, mode: 'order' };
    tickWaiters(wall, slots);
    if (wall.remain <= 0) return { ok: true, steps: step, log, mode: 'order' };
    let empties = [];
    for (let i = 0; i < SLOT_MAX; i++) if (!locked[i] && !slots[i]) empties.push(i);
    if (empties.length === 0 && allowUnlock) {
      const lk = locked.findIndex((v, i) => v && !slots[i]);
      if (lk >= 0) {
        locked[lk] = false;
        empties = [lk];
        log.push(`unlock ${lk}`);
      }
    }
    if (empties.length === 0) {
      return { ok: false, reason: 'order-slots', steps: step, remain: wall.remain, log, mode: 'order' };
    }
    let col = -1;
    for (let c = 0; c < bench.length; c++) {
      if (bench[c][0] && bench[c][0].id === expect) {
        col = c;
        break;
      }
    }
    if (col < 0) {
      return { ok: false, reason: 'order-not-front', steps: step, remain: wall.remain, expect, log, mode: 'order' };
    }
    const slot = empties[Math.floor(empties.length / 2)] ?? empties[0];
    const unit = takeFront(bench, reserve, col);
    unit.homeCol = homes[slot];
    eatAll(wall, unit);
    flushSpawns(wall, bench);
    flushRescues(wall, bench);
    slots[slot] = unit.power > 0 ? unit : null;
    log.push(`#${expect} ${unit.color}${unit.power || 0} slot${slot}`);
    expect += 1;
  }
  return { ok: false, reason: 'order-max', remain: wall.remain, log, mode: 'order' };
}

function solveLevel(level, opts = {}) {
  const allowUnlock = opts.allowUnlock !== false;
  setPlayRules(level);
  const homes = slotHomeCols(level.cols);
  const bench = Array.from({ length: BENCH.cols }, () => []);
  const shown = level.units.slice(0, UNIT_SEATS);
  const reserve = level.units.slice(UNIT_SEATS).map((pair) => unitFromSpec(pair));
  shown.forEach((pair, i) => {
    const col = i % BENCH.cols;
    bench[col].push(unitFromSpec(pair));
  });
  const wall = cloneLevel(level);
  wall.rescues = collectRescues(level);
  const state = {
    wall,
    bench,
    reserve,
    slots: new Array(SLOT_MAX).fill(null),
    locked: Array.from({ length: SLOT_MAX }, (_, i) => slotStartsLocked(i)),
  };

  const maxSteps = opts.maxSteps ?? 1200;
  let steps = 0;
  const log = [];

  while (steps < maxSteps) {
    if (state.wall.remain <= 0) return { ok: true, steps, log };
    tickWaiters(state.wall, state.slots);
    flushSpawns(state.wall, state.bench);
    flushRescues(state.wall, state.bench);
    if (state.wall.remain <= 0) return { ok: true, steps, log };

    let empties = openEmptySlots(state);
    if (empties.length === 0 && allowUnlock) {
      const lockedEmpty = state.locked.findIndex((lk, i) => lk && !state.slots[i]);
      if (lockedEmpty >= 0) {
        state.locked[lockedEmpty] = false;
        empties = openEmptySlots(state);
        log.push(`unlock ${lockedEmpty}`);
      }
    }

    const fronts = frontUnits(state.bench);
    const acc = new Map();
    for (const token of ALL_COLOR_TOKENS) {
      const n = accessibleCount(state.wall, token);
      if (n > 0) acc.set(token, n);
    }

    const waitingColors = new Set();
    for (const s of state.slots) if (s && s.power > 0) waitingColors.add(s.color);

    const candidates = [];
    for (let c = 0; c < fronts.length; c++) {
      const u = fronts[c];
      if (!u) continue;
      const a = accessibleCountGrid(state.wall.grid, u.color, u.ghost);
      if (a <= 0) continue;
      if (waitingColors.has(u.color) && a <= 0) continue;
      const leftover = Math.max(0, u.power - a);
      const waste = Math.max(0, a - u.power);
      // Prefer exact/near fit; penalize leftover (slot camping) and waste.
      const score = -Math.abs(u.power - a) * 3 - leftover * 4 - waste * 0.5 + Math.min(u.power, a);
      candidates.push({ col: c, unit: u, acc: a, leftover, score });
    }

    if (candidates.length === 0) {
      // Try merge two same-color fronts if that color is accessible.
      let merged = false;
      for (let i = 0; i < fronts.length; i++) {
        if (!fronts[i]) continue;
        for (let j = i + 1; j < fronts.length; j++) {
          if (!fronts[j] || fronts[j].color !== fronts[i].color) continue;
          if ((acc.get(fronts[i].color) ?? 0) <= 0) continue;
          const keep = takeFront(state.bench, state.reserve, i);
          const add = takeFront(state.bench, state.reserve, j);
          keep.power += add.power;
          state.bench[i].unshift(keep);
          log.push(`merge ${keep.color}${keep.power}`);
          merged = true;
          break;
        }
        if (merged) break;
      }
      if (merged) {
        steps += 1;
        continue;
      }

      if (empties.length === 0 || filledCount(state.slots) >= SLOT_MAX) {
        return {
          ok: false,
          reason: 'stuck-slots',
          steps,
          remain: state.wall.remain,
          filled: filledCount(state.slots),
          acc: [...acc.entries()],
          fronts: fronts.map((u) => (u ? `${u.color}${u.power}` : '.')),
          slots: state.slots.map((s) => (s ? `${s.color}${s.power}` : '.')),
          log,
        };
      }

      // Forced place: dump a front unit into a slot so the queue advances.
      // Only if we still have a spare slot after this place.
      if (empties.length <= 1 && state.locked.every((lk, i) => !lk || state.slots[i])) {
        return {
          ok: false,
          reason: 'forced-dead',
          steps,
          remain: state.wall.remain,
          fronts: fronts.map((u) => (u ? `${u.color}${u.power}` : '.')),
          slots: state.slots.map((s) => (s ? `${s.color}${s.power}` : '.')),
          acc: [...acc.entries()],
          log,
        };
      }
      const dumpCol = fronts.findIndex((u) => u);
      if (dumpCol < 0) {
        return {
          ok: false,
          reason: 'no-units',
          steps,
          remain: state.wall.remain,
          log,
        };
      }
      const slot = empties[0];
      const unit = takeFront(state.bench, state.reserve, dumpCol);
      unit.homeCol = homes[slot];
      eatAll(state.wall, unit);
      flushSpawns(state.wall, state.bench);
      flushRescues(state.wall, state.bench);
      state.slots[slot] = unit.power > 0 ? unit : null;
      log.push(`dump ${unit.color}${unit.power || 0} -> ${slot}`);
      steps += 1;
      continue;
    }

    if (empties.length === 0) {
      return {
        ok: false,
        reason: 'no-empty-can-eat',
        steps,
        remain: state.wall.remain,
        slots: state.slots.map((s) => (s ? `${s.color}${s.power}` : '.')),
        log,
      };
    }

    candidates.sort((a, b) => b.score - a.score);
    const pick = candidates[0];
    // If leftover is huge and we already have many waiters, try merge first to fit better.
    if (pick.leftover > 8 && empties.length <= 2) {
      let merged = false;
      const same = [];
      for (let i = 0; i < fronts.length; i++) {
        if (fronts[i] && fronts[i].color === pick.unit.color) same.push(i);
      }
      if (same.length >= 2) {
        const keep = takeFront(state.bench, state.reserve, same[0]);
        const add = takeFront(state.bench, state.reserve, same[1]);
        keep.power += add.power;
        state.bench[same[0]].unshift(keep);
        log.push(`merge-fit ${keep.color}${keep.power}`);
        merged = true;
      }
      if (merged) {
        steps += 1;
        continue;
      }
    }

    const slot = empties[Math.floor(empties.length / 2)] ?? empties[0];
    const unit = takeFront(state.bench, state.reserve, pick.col);
    unit.homeCol = homes[slot];
    eatAll(state.wall, unit);
    flushSpawns(state.wall, state.bench);
    flushRescues(state.wall, state.bench);
    state.slots[slot] = unit.power > 0 ? unit : null;
    log.push(`place ${unit.color} p${pick.unit.power}->${unit.power} acc${pick.acc} slot${slot}`);
    steps += 1;
  }

  return { ok: false, reason: 'max-steps', steps, remain: state.wall.remain, log };
}

function summarize(level) {
  const counts = countBricks(level.cells);
  const unitBy = new Map();
  for (const [c, p] of level.units) unitBy.set(c, (unitBy.get(c) ?? 0) + p);
  const filled = level.cells.filter(Boolean).length;
  const bricks = [...counts.values()].reduce((a, b) => a + b, 0);
  const acc0 = cloneLevel(level);
  const acc = {};
  for (const t of level.palette) acc[t] = accessibleCount(acc0, t);
  return {
    id: level.id,
    grid: `${level.cols}x${level.rows}x${level.cells.find((c) => c)?.tokens.length ?? 0}`,
    cells: filled,
    bricks,
    units: level.units.length,
    palette: level.palette.join(''),
    iron: (level.ironRows && level.ironRows.length) ? level.ironRows.join('/') : (level.ironRow >= 0 ? String(level.ironRow) : '-'),
    gaps: (level.ironGaps && level.ironGaps.length) ? level.ironGaps.join(',') : '-',
    powerMatch: [...counts.keys()].every((c) => (counts.get(c) ?? 0) === (unitBy.get(c) ?? 0)),
    front: level.units.slice(0, 6).map(([c, p]) => `${c}${p}`).join(' '),
    acc,
    unitPowers: level.units.map(([c, p]) => `${c}${p}`),
  };
}

function asciiFace(level) {
  const lines = [];
  for (let y = level.rows - 1; y >= 0; y--) {
    let row = '';
    for (let x = 0; x < level.cols; x++) {
      const cell = level.cells[y * level.cols + x];
      if (!cell) {
        row += '.';
        continue;
      }
      if (cell.rescue) {
        row += '@';
        continue;
      }
      if (cell.chest) {
        row += '$';
        continue;
      }
      const ch = cell.tokens[0];
      row += cell.locked?.[0] ? ch.toUpperCase() : ch;
    }
    lines.push(row);
  }
  return lines.join('\n');
}

const fs = require('fs');
const path = require('path');

function decodeCatalogCell(raw) {
  if (!raw) return null;
  if (raw[0] === '@' && raw[1]) return { tokens: [], rescue: raw[1].toLowerCase() };
  if (raw[0] === '$') return { tokens: [], chest: true };
  const tokens = [];
  const locked = [];
  let anyLock = false;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '*' || raw[i] === '!' || raw[i] === '^') {
      i += 1;
      if (i >= raw.length) break;
    }
    const ch = raw[i];
    const up = ch >= 'A' && ch <= 'Z';
    tokens.push(up ? ch.toLowerCase() : ch);
    locked.push(up);
    if (up) anyLock = true;
  }
  const cell = { tokens };
  if (anyLock) cell.locked = locked;
  return cell;
}

function decodeCatalogLevel(raw) {
  const ironRows = Array.isArray(raw.ironRows) && raw.ironRows.length
    ? raw.ironRows.filter((n) => n >= 0).sort((a, b) => a - b)
    : (raw.ironRow ?? -1) >= 0 ? [raw.ironRow] : [];
  return {
    id: raw.id,
    cols: raw.cols,
    rows: raw.rows,
    ironRow: ironRows.length ? ironRows[ironRows.length - 1] : -1,
    ironRows,
    ironGaps: Array.isArray(raw.ironGaps) ? raw.ironGaps.filter((n) => n >= 0) : [],
    sandCols: Array.isArray(raw.sandCols) ? raw.sandCols.filter((n) => n >= 0) : [],
    rescuePower: raw.rescuePower ?? 5,
    raftX: raw.raftX ?? 0,
    raftY: raw.raftY ?? 0,
    raftW: raw.raftW ?? 0,
    raftH: raw.raftH ?? 0,
    raftTravel: raw.raftTravel ?? 0,
    raftPeriod: raw.raftPeriod ?? 2.5,
    slideRow: raw.slideRow ?? -1,
    slideEvery: raw.slideEvery ?? 0,
    slideDir: raw.slideDir ?? 1,
    balloonPower: raw.balloonPower ?? 3,
    brickMix: raw.brickMix ?? 0,
    palette: [...raw.palette],
    units: raw.units,
    cells: raw.cells.map((c) => decodeCatalogCell(c)),
  };
}

function loadCatalog() {
  const file = require('./level-io').CATALOG;
  const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (pack.levels || []).map(decodeCatalogLevel);
}

function reportLevel(level) {
  const info = summarize(level);
  const ordered = solveInOrder(level);
  const greedy = ordered.ok ? { ok: true } : solveLevel(level);
  const ok = ordered.ok || greedy.ok;
  const how = ordered.ok ? 'order' : greedy.ok ? 'greedy' : (ordered.reason || greedy.reason);
  console.log(
    `${ok ? 'OK' : 'FAIL'} L${String(level.id).padStart(3)} ${info.grid} iron=${info.iron} bricks=${info.bricks} units=${info.units} ${how}${ok ? '' : ' remain=' + (ordered.remain ?? greedy.remain)}`,
  );
  return { ok, ordered, greedy, info };
}

function isWinnable(level) {
  const ordered = solveInOrder(level);
  if (ordered.ok) return true;
  return solveLevel(level).ok;
}

function splitPower(n, minP = POWER_LO, maxP = POWER_HI, aim = POWER_AIM) {
  if (n <= 0) return [];
  if (n <= maxP) return [n];
  let count = Math.max(2, Math.round(n / aim));
  while (count > 1 && n / count < minP) count -= 1;
  while (count > 1 && n / (count - 1) <= maxP && n / count < aim - 8) count -= 1;
  const parts = [];
  let left = n;
  for (let i = 0; i < count; i++) {
    const take = i === count - 1 ? left : Math.round(left / (count - i));
    parts.push(take);
    left -= take;
  }
  return parts;
}

function packPlannedUnits(units, maxP = POWER_HI) {
  const totals = new Map();
  const order = [];
  for (const [color, n] of units) {
    if (!n) continue;
    if (!totals.has(color)) {
      totals.set(color, 0);
      order.push(color);
    }
    totals.set(color, totals.get(color) + n);
  }
  const out = [];
  for (const color of order) {
    for (const part of splitPower(totals.get(color), POWER_LO, maxP, POWER_AIM)) {
      out.push([color, part]);
    }
  }
  return out;
}

function planUnitsForCells(level, rng, minUnits = 8) {
  setPlayRules(level);
  const built = buildGrid(level.cells, level.cols, level.rows);
  const grid = built.grid;
  let remain = built.remain;
  if (remain <= 0) return [];
  const remainBy = new Map();
  const recount = () => {
    remainBy.clear();
    remain = 0;
    for (const token of ALL_COLOR_TOKENS) {
      const n = remainingCountGrid(grid, token);
      if (n) remainBy.set(token, n);
      remain += n;
    }
  };
  recount();
  const homeCol = (level.cols - 1) >> 1;
  const units = [];
  while (remain > 0) {
    const options = [];
    const finish = [];
    for (const token of ALL_COLOR_TOKENS) {
      if ((remainBy.get(token) ?? 0) <= 0) continue;
      const acc = accessibleCountGrid(grid, token);
      if (acc <= 0) continue;
      options.push(token);
      if (acc === remainBy.get(token)) finish.push(token);
    }
    if (!options.length) break;
    const rich = options.filter((token) => accessibleCountGrid(grid, token) >= POWER_LO);
    const pool = rich.length ? rich : options;
    const finishPool = finish.filter((token) => pool.includes(token));
    let color;
    if (finishPool.length && rng.next() < 0.72) {
      color = finishPool[rng.int(finishPool.length)];
    } else {
      pool.sort((a, b) => (remainBy.get(a) ?? 0) - (remainBy.get(b) ?? 0));
      color = pool[rng.int(Math.min(2, pool.length))];
    }
    const bite = accessibleCountGrid(grid, color);
    let ate = 0;
    while (ate < bite) {
      const n = eatOneGrid(grid, color, homeCol);
      if (!n) break;
      ate += 1;
    }
    if (ate <= 0) break;
    units.push([color, ate]);
    recount();
  }
  return packPlannedUnits(units);
}

module.exports = { solveInOrder, solveLevel, isWinnable, loadCatalog, reportLevel, planUnitsForCells };

if (require.main === module) {
  const arg = process.argv[2] || '2';
  if (arg === 'all' || arg === 'catalog') {
    const catalog = arg === 'catalog' ? loadCatalog() : null;
    const getLevel = catalog ? (id) => catalog[id - 1] : makeLevel;
    const total = catalog ? catalog.length : LEVEL_COUNT;
    const bad = [];
    for (let id = 1; id <= total; id++) {
      const result = reportLevel(getLevel(id));
      if (!result.ok) bad.push({ id, ...result });
    }
    console.log(`\nfailed ${bad.length}/${total}`);
    for (const b of bad.slice(0, 15)) {
      console.log(`  L${b.id} order=${b.ordered.reason} greedy=${b.greedy.reason} remain=${b.ordered.remain}`);
    }
  } else {
    const id = Number(arg) || 2;
    const catalog = (() => {
      try { return loadCatalog(); } catch { return null; }
    })();
    const level = catalog?.[id - 1] ?? makeLevel(id);
    const info = summarize(level);
    console.log(JSON.stringify(info, null, 2));
    console.log('\nFACE (top=high row):\n' + asciiFace(level));
    const ordered = solveInOrder(level);
    const greedy = solveLevel(level);
    console.log('\nORDER', JSON.stringify({ ok: ordered.ok, reason: ordered.reason, steps: ordered.steps, remain: ordered.remain, log: ordered.log }, null, 2));
    console.log('\nGREEDY', JSON.stringify({
      ok: greedy.ok,
      reason: greedy.reason,
      steps: greedy.steps,
      remain: greedy.remain,
      fronts: greedy.fronts,
      slots: greedy.slots,
    }, null, 2));
  }
}
