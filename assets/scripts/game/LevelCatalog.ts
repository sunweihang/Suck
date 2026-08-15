import { sys } from 'cc';
import {
  ALL_COLOR_TOKENS,
  BENCH,
  ColorToken,
  PLAY,
  UNIT_SETUP,
  fitPlayLayout,
} from './GameConfig';

export const LEVEL_COUNT = 100;

export type LevelCell = {
  tokens: ColorToken[];
};

export type LevelDef = {
  id: number;
  cols: number;
  rows: number;
  cells: Array<LevelCell | null>;
  units: ReadonlyArray<readonly [ColorToken, number]>;
  palette: readonly ColorToken[];
  brickMix: number;
};

const SAVE_KEY = 'suck.level';

export function loadLevelIndex(): number {
  const n = Number(sys.localStorage.getItem(SAVE_KEY));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(LEVEL_COUNT, n | 0));
}

export function saveLevelIndex(n: number): void {
  sys.localStorage.setItem(SAVE_KEY, String(Math.max(1, Math.min(LEVEL_COUNT, n | 0))));
}

export function applyLevel(def: LevelDef): void {
  PLAY.levelId = def.id;
  PLAY.wallCols = def.cols;
  PLAY.wallRows = def.rows;
  let depth = 1;
  for (const cell of def.cells) {
    if (cell) depth = Math.max(depth, cell.tokens.length);
  }
  PLAY.wallDepth = depth;
  PLAY.palette = def.palette.slice();
  PLAY.brickMix = def.brickMix;
  fitPlayLayout(def.cols, def.rows, depth);
}

export function getLevel(id: number): LevelDef {
  const n = Math.max(1, Math.min(LEVEL_COUNT, id | 0));
  return LEVELS[n - 1];
}

export function isTutorialLevel(_id: number): boolean {
  return false;
}

export function levelTitle(id: number): string {
  return isTutorialLevel(id) ? '新手引导' : `第 ${id} 关`;
}

class Rng {
  seed: number;
  constructor(seed: number) {
    this.seed = seed >>> 0;
  }
  next(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  int(n: number): number {
    return (this.next() * n) | 0;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
}

function hypot2(x: number, y: number): number {
  return Math.hypot(x, y);
}

function inRoundRect(x: number, y: number, hx: number, hy: number, r: number): boolean {
  const ax = Math.abs(x) - hx;
  const ay = Math.abs(y) - hy;
  return hypot2(Math.max(ax, 0), Math.max(ay, 0)) + Math.min(Math.max(ax, ay), 0) <= r;
}

function inStar(x: number, y: number, spikes: number, inner: number, outer: number): boolean {
  const ang = Math.atan2(y, x);
  const r = hypot2(x, y);
  const a = ((ang + Math.PI) / (Math.PI * 2)) * spikes;
  const f = Math.abs(a - Math.floor(a) - 0.5) * 2;
  return r <= inner + (outer - inner) * (1 - f);
}

function inHeart(x: number, y: number): boolean {
  const sx = x * 1.18;
  const sy = -y * 1.08 + 0.08;
  const a = sx * sx + sy * sy - 0.34;
  return a * a * a - sx * sx * sy * sy * sy < 0;
}

function occupied(kind: number, x: number, y: number, alt: number, id: number): boolean {
  const fx = alt ? -x : x;
  const fy = y;
  const wob = Math.sin(id * 0.37) * 0.04;
  switch (kind) {
    case 0:
      return Math.abs(fx) < 0.94 && Math.abs(fy) < 0.92;
    case 1:
      return inRoundRect(fx, fy, 0.7, 0.68, 0.24);
    case 2:
      return fy > -0.96 && Math.abs(fx) < (1.02 - fy) * 0.7;
    case 3:
      return fy < 0.96 && Math.abs(fx) < (1.02 + fy) * 0.7;
    case 4:
      return Math.abs(fx) + Math.abs(fy) < 1.08;
    case 5:
      return hypot2(fx, fy) < 0.92;
    case 6:
      return hypot2(fx * 0.72, fy) < 0.88;
    case 7:
      return inHeart(fx, fy);
    case 8:
      return inStar(fx, fy, 5, 0.36, 0.96);
    case 9:
      return hypot2(fx, fy) < 0.9 && hypot2(fx - 0.32, fy - 0.06) > 0.68;
    case 10:
      return hypot2(fx, fy) < 0.94 && hypot2(fx, fy) > 0.42;
    case 11:
      return Math.abs(fx) < 0.28 || Math.abs(fy) < 0.28;
    case 12:
      return Math.abs(Math.abs(fx) - Math.abs(fy)) < 0.26 && hypot2(fx, fy) < 1.02;
    case 13:
      return Math.abs(fx) < 0.3 || (fy > 0.42 && Math.abs(fx) < 0.88);
    case 14:
      return fy < -0.28 || (Math.abs(fx) > 0.52 && Math.abs(fy) < 0.92);
    case 15:
      return Math.abs(fx) > 0.48 || Math.abs(fy) < 0.26;
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
    case 21:
      return Math.abs(fx) < 0.22 + Math.abs(fy) * 0.62 && Math.abs(fy) < 0.94;
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
    case 45:
      return Math.abs(fx) > 0.42 && Math.abs(fx) < 0.88 && Math.abs(fy) < 0.92;
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

const CLUSTER_MIN = 20;
const CLUSTER_TARGET = 22;

function nearestSeed(x: number, y: number, seeds: Array<readonly [number, number]>): number {
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

function pickSeeds(
  spots: Array<readonly [number, number]>,
  count: number,
  rng: Rng,
): Array<[number, number]> {
  const n = Math.min(count, spots.length);
  const seeds: Array<[number, number]> = [];
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

function mergeTiny(
  spots: Array<readonly [number, number]>,
  assign: number[],
  seeds: Array<readonly [number, number]>,
  minSize: number,
): void {
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

function colorFar(
  seeds: Array<readonly [number, number]>,
  alive: boolean[],
  palette: readonly ColorToken[],
): ColorToken[] {
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

function paintFace(
  spots: Array<readonly [number, number]>,
  cols: number,
  rows: number,
  palette: readonly ColorToken[],
  rng: Rng,
): Array<ColorToken | null> {
  const out: Array<ColorToken | null> = new Array(cols * rows).fill(null);
  if (spots.length === 0) return out;
  const want = Math.max(1, Math.round(spots.length / CLUSTER_TARGET));
  const seeds = pickSeeds(spots, want, rng);
  const assign = new Array(spots.length);
  for (let i = 0; i < spots.length; i++) {
    assign[i] = nearestSeed(spots[i][0], spots[i][1], seeds);
  }
  mergeTiny(spots, assign, seeds, Math.min(CLUSTER_MIN, spots.length));
  const alive = new Array(seeds.length).fill(false);
  for (let i = 0; i < assign.length; i++) alive[assign[i]] = true;
  const painted = colorFar(seeds, alive, palette);
  for (let i = 0; i < spots.length; i++) {
    const [x, y] = spots[i];
    out[y * cols + x] = painted[assign[i]];
  }
  return out;
}

function shuffleIn<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

const TOKEN_HUE: Record<ColorToken, number> = {
  o: 28, y: 50, c: 182, g: 136, p: 330, v: 268,
  r: 355, s: 210, k: 10, m: 156, a: 312, d: 45,
};

function hueDist(a: ColorToken, b: ColorToken): number {
  const d = Math.abs(TOKEN_HUE[a] - TOKEN_HUE[b]);
  return Math.min(d, 360 - d);
}

function paletteFor(id: number, count: number, rng: Rng): ColorToken[] {
  const bag = ALL_COLOR_TOKENS.slice();
  shuffleIn(bag, rng);
  const n = Math.max(6, Math.min(ALL_COLOR_TOKENS.length, count));
  const out: ColorToken[] = [];
  const take = (minHue: number): void => {
    for (const token of bag) {
      if (out.length >= n) return;
      if (out.includes(token)) continue;
      if (out.some((t) => hueDist(t, token) < minHue)) continue;
      out.push(token);
    }
  };
  take(36);
  if (out.length < 6) take(28);
  return out.length > 0 ? out : [bag[0]];
}

function sizeFor(id: number): { cols: number; rows: number; depth: number; colors: number } {
  const t = (id - 1) / Math.max(1, LEVEL_COUNT - 1);
  const cols = 18 + Math.round(t * 6);
  const rows = 14 + Math.round(t * 6);
  const depth = 7 + Math.round(t * 4);
  const colors = 7 + Math.round(t * 5);
  return { cols, rows, depth, colors };
}

function makeUnits(palette: readonly ColorToken[], rng: Rng): Array<readonly [ColorToken, number]> {
  const powers = [8, 10, 12, 16, 20, 24];
  const out: Array<readonly [ColorToken, number]> = [];
  const total = BENCH.cols * BENCH.rows;
  for (let i = 0; i < total; i++) {
    out.push([palette[i % palette.length], powers[rng.int(powers.length)]]);
  }
  return shuffleIn(out, rng);
}

function makeCell(tokens: ColorToken[]): LevelCell {
  return { tokens };
}

function stack(token: ColorToken, depth: number): LevelCell {
  const tokens: ColorToken[] = [];
  for (let z = 0; z < depth; z++) tokens.push(token);
  return makeCell(tokens);
}

function makeClassicLevel(): LevelDef {
  const cols = 15;
  const rows = 11;
  const depth = 4;
  const palette: ColorToken[] = ['o', 'y', 'c', 'g', 'p', 'v'];
  const cells: Array<LevelCell | null> = [];
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
    units: UNIT_SETUP,
    palette,
    brickMix: 0,
  };
}

function makeLevel(id: number): LevelDef {
  if (id === 1) return makeClassicLevel();
  const rng = new Rng(id * 2654435761);
  const size = sizeFor(id);
  const kind = (id - 1) % 50;
  const alt = Math.floor((id - 1) / 50);
  const brickMix = 2;
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
  const spots: Array<[number, number]> = [];
  for (let y = 0; y < size.rows; y++) {
    for (let x = 0; x < size.cols; x++) {
      if (occ[y * size.cols + x]) spots.push([x, y]);
    }
  }
  const face = paintFace(spots, size.cols, size.rows, palette, rng);
  const cells: Array<LevelCell | null> = [];
  for (let y = 0; y < size.rows; y++) {
    for (let x = 0; x < size.cols; x++) {
      const i = y * size.cols + x;
      if (!occ[i]) {
        cells.push(null);
        continue;
      }
      const token = face[i] ?? palette[0];
      const tokens: ColorToken[] = [];
      for (let z = 0; z < size.depth; z++) tokens.push(token);
      cells.push(makeCell(tokens));
    }
  }
  return {
    id,
    cols: size.cols,
    rows: size.rows,
    cells,
    units: makeUnits(palette, rng),
    palette,
    brickMix,
  };
}

const LEVELS: LevelDef[] = [];
for (let i = 1; i <= LEVEL_COUNT; i++) LEVELS.push(makeLevel(i));
