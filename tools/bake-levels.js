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
const { occupyShape, shapeForLevel } = require('./level-shapes');
const CLUSTER_MIN = 10;
const UNIT_POWER_MIN = 50;
const UNIT_POWER_MAX = 90;
const UNIT_POWER_AIM = 60;
const UNIT_POWER_FLOOR = 20;
const MIN_UNITS = 48;
const MAX_UNITS = 72;
const MAX_STACK = 48;
const BENCH_COLS = 4;
const BENCH_ROW_SAME = 2;
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
  const target = Math.max(18, Math.round(spots.length / Math.max(3, palette.length)));
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
  if (out.length < n) take(24);
  if (out.length < n) take(12);
  if (out.length < n) take(1);
  return out.length > 0 ? out : [bag[0]];
}

function decadeOf(id) {
  return Math.floor((id - 1) / 10);
}

function isTeachLevel(id) {
  return id === 1 || id === 2 || id === 11 || id === 21 || id === 31 || id === 41 || id === 51 || id === 61;
}

function isOnboardLevel(id) {
  return id >= 1 && id <= 10;
}

function colorCountFor(id) {
  if (id === 1) return 1;
  if (id <= 3) return 2;
  if (id <= 6) return 3;
  if (id <= 9) return 4;
  if (id === 10) return 5;
  const d = decadeOf(id);
  const t = (id - 1) % 10;
  const base = [5, 6, 7, 7, 8, 8, 9, 9, 10, 10][d];
  return Math.min(10, t >= 7 && base < 10 ? base + 1 : base);
}

function sizeFor(id) {
  if (id === 1) return { cols: 16, rows: 12, depth: 1, colors: 1 };
  if (id === 2) return { cols: 18, rows: 14, depth: 1, colors: 2 };
  if (id === 3) return { cols: 20, rows: 15, depth: 2, colors: 2 };
  if (id === 4) return { cols: 20, rows: 16, depth: 2, colors: 3 };
  if (id === 5) return { cols: 22, rows: 16, depth: 3, colors: 3 };
  if (id === 6) return { cols: 22, rows: 17, depth: 3, colors: 3 };
  if (id === 7) return { cols: 24, rows: 18, depth: 4, colors: 4 };
  if (id === 8) return { cols: 24, rows: 18, depth: 4, colors: 4 };
  if (id === 9) return { cols: 25, rows: 19, depth: 5, colors: 4 };
  if (id === 10) return { cols: 26, rows: 20, depth: 6, colors: 5 };
  const d = decadeOf(id);
  const t = (id - 1) % 10;
  const cols = Math.min(32, 26 + Math.floor(d * 0.5) + Math.floor(t * 0.3));
  const rows = Math.min(22, 20 + Math.floor(d * 0.2) + Math.floor(t * 0.1));
  const depth = Math.min(16, 9 + d);
  return { cols, rows, depth, colors: colorCountFor(id) };
}

function minUnitsFor(id) {
  if (id === 1) return 3;
  if (id === 2) return 5;
  if (id <= 5) return 8;
  if (id <= 10) return 16;
  if (isTeachLevel(id)) return 12;
  return MIN_UNITS;
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
  if (span < 8) return [];
  if (count === 1) {
    const row = Math.max(minY + 4, Math.min(maxY - 2, minY + Math.floor(span * 0.55)));
    return row > minY && row <= maxY ? [row] : [];
  }
  let top = maxY - 4;
  let bot = minY + 4;
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

function packPower(n, minP = UNIT_POWER_MIN, maxP = UNIT_POWER_MAX, aim = UNIT_POWER_AIM) {
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

function splitToMinUnits(units, _minCount) {
  const out = [];
  for (const [color, n] of units) {
    if (!n) continue;
    for (const part of packPower(n)) out.push([color, part]);
  }
  return out;
}

function padUnitPowers(units) {
  return units.map((u) => {
    const n = Math.max(1, u[1]);
    return u[2] ? [u[0], n, u[2]] : [u[0], n];
  });
}

function ensureMinUnits(units, minCount = MIN_UNITS) {
  const totals = new Map();
  const extra = new Map();
  for (const u of units || []) {
    if (!u[1]) continue;
    totals.set(u[0], (totals.get(u[0]) ?? 0) + u[1]);
    if (u[2]) extra.set(u[0], u[2]);
  }
  const colors = [...totals.keys()];
  if (!colors.length) return [];
  const total = [...totals.values()].reduce((a, b) => a + b, 0);
  const want = Math.max(minCount, Math.min(MAX_UNITS, Math.floor(total / UNIT_POWER_AIM)));
  const parts = new Map(colors.map((c) => [c, 1]));
  let n = colors.length;
  const canSplit = (color, floor = UNIT_POWER_FLOOR) =>
    Math.floor(totals.get(color) / (parts.get(color) + 1)) >= floor;
  const fair = Math.floor(want / colors.length);
  for (const color of colors) {
    while (parts.get(color) < fair && canSplit(color) && n < MAX_UNITS) {
      parts.set(color, parts.get(color) + 1);
      n += 1;
    }
  }
  const growParts = (floor) => {
    while (n < Math.min(want, total)) {
      let best = null;
      let bestScore = -1;
      for (const color of colors) {
        if (!canSplit(color, floor)) continue;
        const next = parts.get(color) + 1;
        const size = Math.floor(totals.get(color) / next);
        const score = size * 10 - parts.get(color) * 3;
        if (score > bestScore) {
          bestScore = score;
          best = color;
        }
      }
      if (!best) break;
      parts.set(best, parts.get(best) + 1);
      n += 1;
    }
  };
  growParts(UNIT_POWER_FLOOR);
  for (const color of colors) {
    while (Math.ceil(totals.get(color) / parts.get(color)) > UNIT_POWER_MAX && canSplit(color)) {
      parts.set(color, parts.get(color) + 1);
      n += 1;
    }
  }
  const out = [];
  for (const color of colors) {
    const k = parts.get(color);
    const pile = totals.get(color);
    const base = Math.floor(pile / k);
    let rem = pile - base * k;
    for (let i = 0; i < k; i++) {
      const power = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem -= 1;
      if (power <= 0) continue;
      out.push(extra.has(color) ? [color, power, extra.get(color)] : [color, power]);
    }
  }
  return out;
}

function balanceColorCounts(cells, palette, minP = UNIT_POWER_MIN) {
  if (!palette.length) return;
  for (let step = 0; step < 40; step++) {
    const counts = countBricks(cells);
    let total = 0;
    for (const token of palette) total += counts.get(token) ?? 0;
    if (total <= 0) return;
    const fair = total / palette.length;
    const cap = Math.max(minP, Math.round(fair * 1.2));
    const floor = Math.max(minP, Math.round(fair * 0.75));
    let fat = null;
    let fatN = -1;
    let thin = null;
    let thinN = 1e9;
    for (const token of palette) {
      const n = counts.get(token) ?? 0;
      if (n > fatN) {
        fat = token;
        fatN = n;
      }
      if (n < thinN) {
        thin = token;
        thinN = n;
      }
    }
    if (!fat || !thin || fat === thin) return;
    if (fatN <= cap && thinN >= floor) return;
    const need = Math.max(1, Math.min(fatN - cap, Math.max(floor - thinN, Math.ceil((fatN - thinN) / 4))));
    if (stealBricks(cells, fat, thin, need, true) <= 0) return;
  }
}

function thickenCells(cells, minBricks = MIN_UNITS * UNIT_POWER_AIM, maxDepth = MAX_STACK) {
  const occ = cells.filter((cell) => cell?.tokens?.length);
  if (!occ.length) return;
  let n = 0;
  for (const cell of occ) n += cell.tokens.length;
  while (n < minBricks) {
    let grew = false;
    for (const cell of occ) {
      if (n >= minBricks) break;
      if (cell.tokens.length >= maxDepth) continue;
      cell.tokens.push(cell.tokens[cell.tokens.length - 1]);
      n += 1;
      grew = true;
    }
    if (!grew) break;
  }
}

function finalizeUnits(units, minCount = MIN_UNITS) {
  return spreadBenchUnits(ensureMinUnits(padUnitPowers(units), minCount));
}

/** Deal units onto the 4-wide bench so the same color does not sit in a block. */
function spreadBenchUnits(units) {
  if (!units || units.length <= 2) return units;
  const piles = new Map();
  for (const unit of units) {
    const color = unit[0];
    if (!piles.has(color)) piles.set(color, []);
    piles.get(color).push(unit);
  }
  const colors = [...piles.keys()];
  if (colors.length <= 1) return units.slice();

  const out = new Array(units.length);
  const rowUsed = new Map();

  const pick = (i) => {
    const col = i % BENCH_COLS;
    const rank = Math.floor(i / BENCH_COLS);
    const left = col > 0 ? out[i - 1][0] : null;
    const ahead = rank > 0 ? out[i - BENCH_COLS][0] : null;
    const diag = col > 0 && rank > 0 ? out[i - BENCH_COLS - 1][0] : null;
    let best = null;
    let bestScore = -1e9;
    for (const color of colors) {
      const leftN = piles.get(color).length;
      if (!leftN) continue;
      const inRow = rowUsed.get(`${rank}:${color}`) ?? 0;
      let score = leftN;
      if (color === left) score -= 80;
      if (color === ahead) score -= 80;
      if (color === diag) score -= 20;
      if (inRow >= BENCH_ROW_SAME) score -= 60;
      if (inRow === 0) score += 8;
      if (rank === 0 && inRow === 0) score += 12;
      if (score > bestScore) {
        bestScore = score;
        best = color;
      }
    }
    return best;
  };

  for (let i = 0; i < units.length; i++) {
    const color = pick(i);
    const rank = Math.floor(i / BENCH_COLS);
    out[i] = piles.get(color).shift();
    const key = `${rank}:${color}`;
    rowUsed.set(key, (rowUsed.get(key) ?? 0) + 1);
  }
  return out;
}

function clampUnitPower(n) {
  return Math.min(UNIT_POWER_MAX, Math.max(UNIT_POWER_MIN, Math.round(n) || UNIT_POWER_MIN));
}

/** Rescue octopus is a normal bite, not the whole color pile. Leftover stays on the bench. */
function applyRescueUnits(units, cells, rescueToken, preferred) {
  const bricks = countBricks(cells).get(rescueToken) ?? 0;
  let power = clampUnitPower(preferred ?? UNIT_POWER_MIN);
  let rest = Math.max(0, bricks - power);
  if (rest > 0 && rest < UNIT_POWER_MIN) {
    if (bricks <= UNIT_POWER_MAX) {
      power = clampUnitPower(bricks);
      rest = 0;
    } else {
      rest = UNIT_POWER_MIN;
    }
  }
  const kept = (units || []).filter((u) => u[0] !== rescueToken);
  return {
    units: rest > 0 ? kept.concat(splitToMinUnits([[rescueToken, rest]])) : kept,
    rescuePower: power,
  };
}

function planSolvableUnits(cells, cols, rows, rng, ironRows, ironGaps = [], minUnits = 12) {
  const { planUnitsForCells } = require('./solve-levels');
  return planUnitsForCells({
    cells,
    cols,
    rows,
    ironRows,
    ironGaps,
    ironRow: ironRows.length ? ironRows[ironRows.length - 1] : -1,
  }, rng, minUnits);
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

function scaleFace(face, sx = 2, sy = sx) {
  const out = [];
  for (const line of face) {
    const wide = [...line].map((ch) => ch.repeat(sx)).join('');
    for (let i = 0; i < sy; i++) out.push(wide);
  }
  return out;
}

function embedFace(face, cols, rows) {
  const h = face.length;
  const w = face[0].length;
  const ox = Math.max(0, Math.floor((cols - w) / 2));
  const oy = Math.max(0, Math.floor((rows - h) / 2));
  const out = Array.from({ length: rows }, () => '.'.repeat(cols));
  for (let y = 0; y < h && y + oy < rows; y++) {
    const src = face[y];
    const dst = out[y + oy].split('');
    for (let x = 0; x < w && x + ox < cols; x++) dst[ox + x] = src[x] || '.';
    out[y + oy] = dst.join('');
  }
  return out;
}

function unitsFromCells(cells, palette) {
  const counts = countBricks(cells);
  const units = [];
  for (const token of palette) {
    const n = counts.get(token) ?? 0;
    if (!n) continue;
    for (const part of packPower(n)) units.push([token, part]);
  }
  return units;
}

function teachCanvas(id) {
  if (id === 1) return { cols: 16, rows: 12 };
  if (id === 2) return { cols: 18, rows: 14 };
  if (isTeachLevel(id)) return { cols: 20, rows: 16 };
  const size = sizeFor(id);
  return { cols: size.cols, rows: size.rows };
}

function tutorialBase(id, palette, face, units, extra = {}) {
  const canvas = extra.canvas ?? teachCanvas(id);
  const topPad = Math.max(0, Math.floor((canvas.rows - face.length) / 2));
  const bottomPad = Math.max(0, canvas.rows - face.length - topPad);
  const laid = embedFace(face, canvas.cols, canvas.rows);
  const { cols, rows, cells } = cellsFromFace(laid, extra.depth ?? 1, extra);
  if (extra.paint) applyFlagMask(cells, cols, rows, embedFace(extra.paint, cols, rows), 'paint');
  if (extra.magnet) applyFlagMask(cells, cols, rows, embedFace(extra.magnet, cols, rows), 'magnet');
  if (extra.bomb) applyBombMask(cells, cols, rows, embedFace(extra.bomb, cols, rows));
  expandSpecials(cells, cols, rows);
  const ironRows = (extra.ironRows ?? []).map((r) => r + bottomPad);
  let finalUnits = units?.length ? units : unitsFromCells(cells, palette);
  let rescuePower = extra.rescuePower ?? 5;
  if (extra.rescue) {
    const applied = applyRescueUnits(finalUnits, cells, extra.rescue, extra.rescuePower ?? UNIT_POWER_MIN);
    finalUnits = applied.units;
    rescuePower = applied.rescuePower;
  }
  if (extra.paint) {
    const paintColor = cells.find((c) => c?.paint?.[0])?.tokens?.[0];
    if (paintColor) finalUnits = finalUnits.concat([[paintColor, UNIT_POWER_MIN]]);
  }
  return {
    id,
    cols,
    rows,
    cells,
    units: finalUnits,
    palette,
    ...emptyLevelExtras(),
    ironRow: ironRows.length ? ironRows[ironRows.length - 1] : -1,
    ironRows,
    ironGaps: extra.ironGaps ?? [],
    sandCols: extra.sandCols ?? [],
    rescuePower,
    raftX: extra.raftX ?? 0,
    raftY: extra.raftY ?? 0,
    raftW: extra.raftW ?? 0,
    raftH: extra.raftH ?? 0,
    raftTravel: extra.raftTravel ?? 0,
    raftPeriod: extra.raftPeriod ?? 2.5,
  };
}

function regionToken(ch, palette, map) {
  if (map[ch]) return map[ch];
  if (ch === '#') return palette[0];
  return palette[Math.min(1, palette.length - 1)];
}

function makeShapedTutorial(id, palette, extra = {}) {
  const size = extra.canvas ?? teachCanvas(id);
  const { regions } = occupyShape(id, size.cols, size.rows);
  const depth = extra.depth ?? 1;
  const map = extra.regionMap || {};
  const cells = [];
  for (const ch of regions) {
    if (!ch || ch === '.') {
      cells.push(null);
      continue;
    }
    const token = regionToken(ch, palette, map);
    cells.push(makeCell(Array.from({ length: depth }, () => token)));
  }
  const rng = new Rng((id * 2654435761) >>> 0);
  if (extra.paints) placePaints(cells, size.cols, size.rows, extra.paints, rng);
  if (extra.bombs) placeBombs(cells, size.cols, size.rows, extra.bombs, rng);
  if (extra.lockClusters) placeLocks(cells, size.cols, size.rows, extra.lockClusters, rng);
  if (extra.chests) placeChests(cells, size.cols, size.rows, extra.chests, rng);
  if (extra.rescues) placeRescues(cells, size.cols, size.rows, extra.rescues, palette, rng);
  expandSpecials(cells, size.cols, size.rows);
  let ironRows = extra.ironRows ?? [];
  if (extra.iron && !ironRows.length) {
    ironRows = chooseIronRows(cells, size.cols, size.rows, extra.iron);
  }
  const units = extra.units?.length ? extra.units : unitsFromCells(cells, palette);
  return {
    id,
    cols: size.cols,
    rows: size.rows,
    cells,
    units,
    palette,
    ...emptyLevelExtras(),
    ironRow: ironRows.length ? ironRows[ironRows.length - 1] : -1,
    ironRows,
    ironGaps: extra.ironGaps ?? [],
  };
}

function makeAbsorbTutorial() {
  return makeShapedTutorial(1, ['o'], {
    canvas: teachCanvas(1),
    regionMap: { '#': 'o', L: 'o', T: 'o', H: 'o', E: 'o', N: 'o' },
    depth: 1,
  });
}

function makeAbsorbTwo() {
  const face = scaleFace([
    'oooocccc',
    'oooocccc',
    'oooocccc',
    'oooocccc',
  ], 2);
  return tutorialBase(2, ['o', 'c'], face, null, { canvas: { cols: 18, rows: 14 } });
}

function makeIronTutorial() {
  return makeShapedTutorial(11, ['y', 'c'], {
    regionMap: { '#': 'y', L: 'y', T: 'c', H: 'y' },
    iron: 1,
    depth: 2,
  });
}

function makePaintTutorial() {
  return makeShapedTutorial(21, ['p', 'c'], {
    regionMap: { '#': 'c', E: 'p', N: 'p', H: 'p', T: 'c', L: 'c' },
    paints: 1,
    depth: 2,
  });
}

function makeRescueTutorial() {
  return makeShapedTutorial(31, ['y', 'r', 'c'], {
    regionMap: { '#': 'r', E: 'c', N: 'y', H: 'y', T: 'c', L: 'c' },
    rescues: 1,
  });
}

function makeChestTutorial() {
  return makeShapedTutorial(61, ['y', 'c'], {
    regionMap: { '#': 'y', H: 'c', E: 'c', N: 'c', T: 'c', L: 'c' },
    chests: 1,
    depth: 2,
  });
}

function makeNailTutorial() {
  return makeShapedTutorial(41, ['o', 'r'], {
    regionMap: { '#': 'o', E: 'r', N: 'r', H: 'r', T: 'o', L: 'o' },
    lockClusters: 1,
    depth: 2,
  });
}

function makeBombTutorial() {
  return makeShapedTutorial(51, ['y', 'r'], {
    regionMap: { '#': 'y', H: 'y', L: 'y', N: 'r', T: 'r', E: 'r' },
    bombs: 1,
    depth: 2,
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
      if (ch === '$') {
        cells.push({ tokens: [], chest: true });
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

const SPECIAL_SPAN = 4;

function canFitSpan(cols, rows, x, y, span = SPECIAL_SPAN) {
  return x >= 0 && y >= 0 && x + span <= cols && y + span <= rows;
}

function clearSpan(cells, cols, x, y, span = SPECIAL_SPAN) {
  for (let dy = 0; dy < span; dy++) {
    for (let dx = 0; dx < span; dx++) {
      if (!dx && !dy) continue;
      cells[(y + dy) * cols + (x + dx)] = null;
    }
  }
}

function isSpecialOrigin(cell) {
  return !!(cell?.rescue || cell?.chest || cell?.bomb?.[0] || cell?.paint?.[0]);
}

function sameSpecial(a, b) {
  if (!a || !b) return false;
  if (a.rescue && b.rescue) return true;
  if (a.chest && b.chest) return true;
  if (a.bomb?.[0] && b.bomb?.[0]) return true;
  if (a.paint?.[0] && b.paint?.[0]) return true;
  return false;
}

function collapseSpecialMarks(cells, cols, rows) {
  for (let y = rows - 1; y >= 0; y--) {
    for (let x = cols - 1; x >= 0; x--) {
      const cell = cells[y * cols + x];
      if (!isSpecialOrigin(cell)) continue;
      const left = x > 0 ? cells[y * cols + x - 1] : null;
      const down = y > 0 ? cells[(y - 1) * cols + x] : null;
      if (sameSpecial(cell, left) || sameSpecial(cell, down)) cells[y * cols + x] = null;
    }
  }
}

function expandSpecials(cells, cols, rows, span = SPECIAL_SPAN) {
  collapseSpecialMarks(cells, cols, rows);
  const found = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = cells[y * cols + x];
      if (isSpecialOrigin(cell)) found.push({ x, y, cell });
    }
  }
  for (const s of found) {
    let { x, y } = s;
    if (!canFitSpan(cols, rows, x, y, span)) {
      const nx = Math.max(0, Math.min(x, cols - span));
      const ny = Math.max(0, Math.min(y, rows - span));
      if (nx !== x || ny !== y) {
        cells[ny * cols + nx] = s.cell;
        cells[y * cols + x] = null;
        x = nx;
        y = ny;
      }
    }
    clearSpan(cells, cols, x, y, span);
  }
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

function footprintFree(cells, cols, rows, x, y, span = SPECIAL_SPAN) {
  if (!canFitSpan(cols, rows, x, y, span)) return false;
  for (let dy = 0; dy < span; dy++) {
    for (let dx = 0; dx < span; dx++) {
      const cell = cells[(y + dy) * cols + (x + dx)];
      if (dx || dy) {
        if (isSpecialOrigin(cell)) return false;
      } else if (cell?.rescue || cell?.chest) {
        return false;
      }
    }
  }
  return true;
}

function placePaints(cells, cols, rows, count, rng) {
  const spots = occupiedCells(cells, cols, rows)
    .filter((s) => !s.cell.paint && !s.cell.bomb && !s.cell.magnet && !s.cell.locked)
    .filter((s) => footprintFree(cells, cols, rows, s.x, s.y))
    .sort((a, b) => neighborCount(cells, cols, rows, b.x, b.y) - neighborCount(cells, cols, rows, a.x, a.y));
  const picked = [];
  for (let i = 0; i < spots.length && picked.length < count; i++) {
    if (rng.next() > 0.7 && i + 1 < spots.length) continue;
    if (!footprintFree(cells, cols, rows, spots[i].x, spots[i].y)) continue;
    markFront(spots[i].cell, 'paint');
    clearSpan(cells, cols, spots[i].x, spots[i].y);
    picked.push(spots[i]);
  }
  return picked;
}

function placeBombs(cells, cols, rows, count, rng) {
  const spots = occupiedCells(cells, cols, rows)
    .filter((s) => !s.cell.paint && !s.cell.bomb && neighborCount(cells, cols, rows, s.x, s.y) >= 3)
    .filter((s) => footprintFree(cells, cols, rows, s.x, s.y));
  shuffleIn(spots, rng);
  const picked = [];
  for (let i = 0; i < spots.length && picked.length < count; i++) {
    if (!footprintFree(cells, cols, rows, spots[i].x, spots[i].y)) continue;
    markFront(spots[i].cell, 'bomb');
    clearSpan(cells, cols, spots[i].x, spots[i].y);
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
    .filter((s) => canFitSpan(cols, rows, s.x, s.y))
    .filter((s) => s.x > 1 && s.x < cols - SPECIAL_SPAN - 1 && s.y > 1 && s.y < rows - SPECIAL_SPAN - 1)
    .filter((s) => !s.cell.bomb && !s.cell.paint && !s.cell.rescue && !s.cell.chest)
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
      || palette.find((t) => !around.has(t) && (counts.get(t) ?? 0) >= UNIT_POWER_MIN)
      || palette.find((t) => !around.has(t))
      || null;
    if (!token) continue;
    cells[spots[i].y * cols + spots[i].x] = { tokens: [], rescue: token };
    clearSpan(cells, cols, spots[i].x, spots[i].y);
    placed.push(token);
  }
  return placed;
}

function placeChests(cells, cols, rows, count, rng) {
  const spots = occupiedCells(cells, cols, rows)
    .filter((s) => canFitSpan(cols, rows, s.x, s.y))
    .filter((s) => s.x > 1 && s.x < cols - SPECIAL_SPAN - 1 && s.y > 1 && s.y < rows - SPECIAL_SPAN - 1)
    .filter((s) => !s.cell.rescue && !s.cell.chest && !s.cell.bomb && !s.cell.paint)
    .filter((s) => neighborCount(cells, cols, rows, s.x, s.y) >= 5);
  shuffleIn(spots, rng);
  const placed = [];
  for (let i = 0; i < spots.length && placed.length < count; i++) {
    cells[spots[i].y * cols + spots[i].x] = { tokens: [], chest: true };
    clearSpan(cells, cols, spots[i].x, spots[i].y);
    placed.push(spots[i]);
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
    chests: 0,
  };
  if (d === 1) {
    spec.iron = t <= 6 ? 1 : 2;
    spec.ironGaps = t >= 6 ? 1 : 0;
  } else if (d === 2) {
    spec.paints = t <= 4 ? 1 : 2;
  } else if (d === 3) {
    spec.rescues = t === 0 ? 1 : 0;
  } else if (d === 4) {
    spec.lockClusters = 1 + Math.floor(t / 3);
  } else if (d === 5) {
    spec.bombs = t <= 4 ? 1 : 2;
  } else if (d === 6) {
    spec.iron = t <= 4 ? 1 : 2;
    spec.lockClusters = t >= 3 ? 1 : 0;
    spec.ironGaps = t >= 7 ? 1 : 0;
    spec.chests = 1;
  } else if (d === 7) {
    spec.paints = 1;
    spec.bombs = t >= 4 ? 1 : 0;
  } else if (d === 8) {
    spec.iron = t >= 3 ? 1 : 0;
    spec.lockClusters = t >= 6 ? 1 : 0;
  } else if (d === 9) {
    const mix = [
      { iron: 1, paints: 1, chests: 1 },
      { iron: 1, lockClusters: 1 },
      { bombs: 1, paints: 1, chests: 1 },
      { iron: 2, bombs: 1 },
      { iron: 1 },
      { lockClusters: 1, paints: 1, chests: 1 },
      { bombs: 1, lockClusters: 1 },
      { iron: 1, lockClusters: 1, bombs: 1 },
      { paints: 1 },
      { iron: 1, bombs: 1, lockClusters: 1, chests: 1 },
    ][t];
    Object.assign(spec, mix);
  }
  return spec;
}

function isSilhouetteEdge(occ, cols, rows, x, y, ring = 1) {
  for (let dy = -ring; dy <= ring; dy++) {
    for (let dx = -ring; dx <= ring; dx++) {
      if (!dx && !dy) continue;
      if (Math.abs(dx) + Math.abs(dy) > ring) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return true;
      if (!occ[ny * cols + nx]) return true;
    }
  }
  return false;
}

function nextToken(token, palette) {
  const i = palette.indexOf(token);
  if (i < 0) return palette[0];
  return palette[(i + 1) % palette.length];
}

function peelBandCount(depth) {
  if (depth <= 1) return 1;
  return Math.min(7, depth);
}

function peelBandOf(z, depth, bands) {
  if (z <= 0 || bands <= 1) return 0;
  const inner = bands - 1;
  return 1 + Math.min(inner - 1, Math.floor(((z - 1) * inner) / Math.max(1, depth - 1)));
}

function peelSequence(palette, count) {
  const seq = [];
  if (!palette.length || count <= 0) return seq;
  for (let i = 0; i < count; i++) {
    let token = palette[i % palette.length];
    if (seq.length && token === seq[seq.length - 1] && palette.length > 1) {
      token = palette[(i + 1) % palette.length];
    }
    if (seq.length && token === seq[seq.length - 1] && palette.length > 1) {
      token = nextToken(token, palette);
    }
    seq.push(token);
  }
  return seq;
}

/** Chebyshev distance to empty / outside. Occupied surface cells are 1. */
function xyInset(occ, cols, rows) {
  const dist = new Int16Array(cols * rows);
  for (let i = 0; i < dist.length; i++) dist[i] = occ[i] ? 32767 : 0;
  const at = (x, y) => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return 0;
    return dist[y * cols + x];
  };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!occ[y * cols + x]) continue;
      dist[y * cols + x] = Math.min(
        dist[y * cols + x],
        at(x - 1, y) + 1,
        at(x, y - 1) + 1,
        at(x - 1, y - 1) + 1,
        at(x + 1, y - 1) + 1,
      );
    }
  }
  for (let y = rows - 1; y >= 0; y--) {
    for (let x = cols - 1; x >= 0; x--) {
      if (!occ[y * cols + x]) continue;
      dist[y * cols + x] = Math.min(
        dist[y * cols + x],
        at(x + 1, y) + 1,
        at(x, y + 1) + 1,
        at(x + 1, y + 1) + 1,
        at(x - 1, y + 1) + 1,
      );
    }
  }
  return dist;
}

function mergeInnerShells(counts, minSize) {
  const remap = counts.map((_, i) => i);
  for (let s = counts.length - 1; s >= 1; s--) {
    if (counts[s] <= 0) continue;
    if (counts[s] >= minSize) continue;
    counts[s - 1] += counts[s];
    counts[s] = 0;
    for (let i = 0; i < remap.length; i++) {
      if (remap[i] === s) remap[i] = s - 1;
    }
  }
  return remap;
}

const ACCENT_PREF = {
  L: ['g', 'm', 'c'],
  T: ['k', 'o', 'd', 'y'],
  E: ['c', 's', 'v', 'p'],
  W: ['v', 'r', 'p', 'a'],
  H: ['y', 'd', 'o', 'p'],
  N: ['d', 'y', 'o', 'k'],
  R: ['r', 'p', 'a', 's'],
};

function pickAccent(kind, palette, used) {
  const pref = ACCENT_PREF[kind] || [];
  for (const token of pref) {
    if (palette.includes(token) && !used.has(token)) return token;
  }
  for (const token of palette) {
    if (!used.has(token)) return token;
  }
  return palette[1] || palette[0];
}

function buildShapedCells(id, size, palette) {
  const { occ, regions } = occupyShape(id, size.cols, size.rows);
  const inset = xyInset(occ, size.cols, size.rows);
  const depth = size.depth;
  const shells = [];
  let maxShell = 0;
  for (let y = 0; y < size.rows; y++) {
    for (let x = 0; x < size.cols; x++) {
      const i = y * size.cols + x;
      if (!occ[i]) {
        shells.push(null);
        continue;
      }
      const xy = Math.max(0, inset[i] - 1);
      const stack = [];
      for (let z = 0; z < depth; z++) {
        const shell = Math.min(xy, z, depth - 1 - z);
        stack.push(shell);
        if (shell > maxShell) maxShell = shell;
      }
      shells.push(stack);
    }
  }
  const counts = new Array(maxShell + 1).fill(0);
  for (const stack of shells) {
    if (!stack) continue;
    for (let z = 0; z < stack.length; z++) counts[stack[z]] += 1;
  }
  const remap = mergeInnerShells(counts, UNIT_POWER_MIN);
  let used = 0;
  for (let s = 0; s <= maxShell; s++) {
    if (counts[s] > 0) used += 1;
  }
  const seq = peelSequence(palette, Math.max(palette.length, used));
  const bandOf = new Array(maxShell + 1).fill(0);
  let band = 0;
  for (let s = 0; s <= maxShell; s++) {
    if (s > 0 && counts[s] > 0) band += 1;
    bandOf[s] = band;
  }
  const outerToken = seq[0] ?? palette[0];
  const taken = new Set([outerToken]);
  const accentTok = {};
  for (const ch of regions) {
    if (!ch || ch === '.' || ch === '#' || accentTok[ch]) continue;
    accentTok[ch] = pickAccent(ch, palette, taken);
    taken.add(accentTok[ch]);
  }
  const cells = [];
  for (let i = 0; i < shells.length; i++) {
    const stack = shells[i];
    if (!stack) {
      cells.push(null);
      continue;
    }
    const accent = accentTok[regions[i]];
    if (accent && accent !== outerToken) {
      cells.push(makeCell(stack.map(() => accent)));
      continue;
    }
    const tokens = [];
    for (let z = 0; z < stack.length; z++) {
      const shell = remap[stack[z]];
      tokens.push(seq[Math.min(seq.length - 1, bandOf[shell])] ?? palette[0]);
    }
    cells.push(makeCell(tokens));
  }
  return { cells, outerToken };
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

function donorTokens(counts, reserved) {
  return [...counts.entries()]
    .filter(([, n]) => n > UNIT_POWER_MIN)
    .sort((a, b) => {
      if (a[0] === reserved) return 1;
      if (b[0] === reserved) return -1;
      return b[1] - a[1];
    })
    .map(([token]) => token);
}

function paintColorCluster(cells, cols, rows, from, to, need) {
  const starts = [];
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (!cell?.tokens?.some((t, z) => t === from && !cell.locked?.[z] && !cell.bomb?.[z] && !cell.paint?.[z])) {
      continue;
    }
    starts.push(i);
  }
  if (!starts.length) return 0;
  let painted = 0;
  for (const origin of starts) {
    if (painted >= need) break;
    const seen = new Uint8Array(cells.length);
    const queue = [origin];
    seen[origin] = 1;
    while (queue.length && painted < need) {
      const i = queue.shift();
      const cell = cells[i];
      if (cell?.tokens) {
        for (let z = 0; z < cell.tokens.length; z++) {
          if (painted >= need) break;
          if (cell.tokens[z] !== from) continue;
          if (cell.locked?.[z] || cell.bomb?.[z] || cell.paint?.[z]) continue;
          cell.tokens[z] = to;
          painted += 1;
        }
      }
      const x = i % cols;
      const y = (i - x) / cols;
      const next = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
      for (const [nx, ny] of next) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (seen[j]) continue;
        seen[j] = 1;
        queue.push(j);
      }
    }
  }
  if (painted >= need) return painted;
  for (const cell of cells) {
    if (painted >= need || !cell?.tokens) continue;
    for (let z = 0; z < cell.tokens.length; z++) {
      if (painted >= need) break;
      if (cell.tokens[z] !== from) continue;
      if (cell.locked?.[z] || cell.bomb?.[z] || cell.paint?.[z]) continue;
      cell.tokens[z] = to;
      painted += 1;
    }
  }
  return painted;
}

function stealBricks(cells, from, to, need, allowSpecial = false) {
  let painted = 0;
  for (const cell of cells) {
    if (!cell?.tokens || painted >= need) continue;
    for (let z = 0; z < cell.tokens.length; z++) {
      if (painted >= need) break;
      if (cell.tokens[z] !== from) continue;
      if (!allowSpecial && (cell.bomb?.[z] || cell.paint?.[z])) continue;
      cell.tokens[z] = to;
      painted += 1;
    }
  }
  return painted;
}

function seedMissingColors(cells, cols, rows, palette, minP = UNIT_POWER_MIN, reserved = null) {
  for (const token of palette) {
    if ((countBricks(cells).get(token) ?? 0) > 0) continue;
    const donors = donorTokens(countBricks(cells), reserved);
    for (const donor of donors) {
      if (donor === token) continue;
      paintColorCluster(cells, cols, rows, donor, token, minP);
      if ((countBricks(cells).get(token) ?? 0) > 0) break;
    }
    if ((countBricks(cells).get(token) ?? 0) > 0) continue;
    for (const [from] of [...countBricks(cells).entries()].sort((a, b) => b[1] - a[1])) {
      if (from === token) continue;
      stealBricks(cells, from, token, minP, true);
      if ((countBricks(cells).get(token) ?? 0) > 0) break;
    }
  }
}

function growSparseColors(cells, minP = UNIT_POWER_MIN) {
  const counts = countBricks(cells);
  let biggest = null;
  let biggestN = 0;
  for (const [token, n] of counts) {
    if (n > biggestN) {
      biggest = token;
      biggestN = n;
    }
  }
  if (!biggest || biggestN <= minP) return;
  let left = biggestN;
  for (const [token, n] of counts) {
    if (n >= minP || n === 0 || token === biggest) continue;
    let need = minP - n;
    for (const cell of cells) {
      if (need <= 0 || left <= minP) break;
      if (!cell?.tokens?.length) continue;
      for (let z = 0; z < cell.tokens.length; z++) {
        if (need <= 0 || left <= minP) break;
        if (cell.tokens[z] !== biggest) continue;
        if (cell.bomb?.[z] || cell.paint?.[z]) continue;
        cell.tokens[z] = token;
        need -= 1;
        left -= 1;
      }
    }
  }
}

function paletteComplete(level) {
  const used = new Set();
  for (const cell of level.cells) {
    if (!cell) continue;
    for (const token of cell.tokens) used.add(token);
  }
  return (level.palette || []).every((token) => used.has(token));
}

function makeDecadeLevel(id) {
  const { isWinnable } = require('./solve-levels');
  let best = null;
  for (let attempt = 0; attempt < 16; attempt++) {
    const rng = new Rng((id * 2654435761 + attempt * 9973) >>> 0);
    const level = buildDecadeLevel(id, rng);
    level.units = finalizeUnits(level.units, minUnitsFor(id));
    if (!paletteComplete(level)) {
      if (!best) best = level;
      continue;
    }
    if (isWinnable(level)) return level;
    best = level;
  }
  return best;
}

function buildDecadeLevel(id, rng) {
  const size = sizeFor(id);
  const palette = paletteFor(id, size.colors, rng);
  const { cells, outerToken } = buildShapedCells(id, size, palette);
  const spec = specFor(id);
  const extra = emptyLevelExtras();
  extra.brickMix = 0;
  if (spec.paints) placePaints(cells, size.cols, size.rows, spec.paints, rng);
  if (spec.bombs) placeBombs(cells, size.cols, size.rows, spec.bombs, rng);
  if (spec.lockClusters) placeLocks(cells, size.cols, size.rows, spec.lockClusters, rng);
  if (spec.rescues) placeRescues(cells, size.cols, size.rows, spec.rescues, palette, rng);
  if (spec.chests) placeChests(cells, size.cols, size.rows, spec.chests, rng);
  seedMissingColors(cells, size.cols, size.rows, palette, UNIT_POWER_MIN, outerToken);
  growSparseColors(cells, UNIT_POWER_MIN);
  seedMissingColors(cells, size.cols, size.rows, palette, UNIT_POWER_MIN, outerToken);
  growSparseColors(cells, UNIT_POWER_MIN);
  thickenCells(cells, minUnitsFor(id) * UNIT_POWER_AIM);
  seedMissingColors(cells, size.cols, size.rows, palette, UNIT_POWER_MIN, outerToken);
  growSparseColors(cells, UNIT_POWER_MIN);
  balanceColorCounts(cells, palette, UNIT_POWER_MIN);

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
  let units = finalizeUnits(planned.units, minUnitsFor(id));
  if (spec.rescues) {
    const rescueTokens = new Set();
    for (const cell of cells) {
      if (cell?.rescue) rescueTokens.add(cell.rescue);
    }
    if (rescueTokens.size) extra.rescuePower = UNIT_POWER_MIN;
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

function makeTeachLevel(id) {
  if (id === 1) return makeAbsorbTutorial();
  if (id === 2) return makeAbsorbTwo();
  if (id === 11) return makeIronTutorial();
  if (id === 21) return makePaintTutorial();
  return null;
}

function makeLevel(id) {
  const teach = makeTeachLevel(id);
  const level = teach ?? makeDecadeLevel(id);
  level.units = finalizeUnits(level.units, minUnitsFor(id));
  return level;
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
      if (cell.chest) return '$';
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
    if (!isOnboardLevel(id) && !isTeachLevel(id) && pal.length < 5) {
      throw new Error(`L${id} palette ${pal.length} < 5`);
    }
    const used = new Set();
    for (const cell of level.cells) {
      if (!cell) continue;
      for (const token of cell.tokens) used.add(token);
    }
    for (const token of pal) {
      if (!used.has(token)) throw new Error(`L${id} unused color ${token}`);
    }
    for (let i = 0; i < pal.length; i++) {
      for (let j = i + 1; j < pal.length; j++) {
        if (clashes(pal[i], pal[j])) {
          throw new Error(`L${id} clash ${pal[i]}+${pal[j]}`);
        }
      }
    }
    const bricks = level.cells.reduce((n, cell) => n + (cell ? cell.tokens.length : 0), 0);
    const powers = level.units.map((u) => u[1]);
    const pmin = powers.length ? Math.min(...powers) : 0;
    const pmax = powers.length ? Math.max(...powers) : 0;
    const pavg = powers.length ? powers.reduce((a, b) => a + b, 0) / powers.length : 0;
    if (!isOnboardLevel(id) && !isTeachLevel(id) && level.units.length < MIN_UNITS) {
      throw new Error(`L${id} units ${level.units.length} < ${MIN_UNITS}`);
    }
    if (!isTeachLevel(id) && pmin < UNIT_POWER_FLOOR) {
      throw new Error(`L${id} unit power ${pmin} < ${UNIT_POWER_FLOOR}`);
    }
    if (pmax > UNIT_POWER_MAX) {
      throw new Error(`L${id} unit power ${pmax} > ${UNIT_POWER_MAX}`);
    }
    const front = level.units.slice(0, Math.min(BENCH_COLS, level.units.length));
    const frontColors = new Set(front.map((u) => u[0]));
    if (!isOnboardLevel(id) && !isTeachLevel(id) && pal.length >= 3 && front.length >= 4 && frontColors.size < 2) {
      throw new Error(`L${id} bench front is monochrome ${front[0]?.[0]}`);
    }
    if (!isOnboardLevel(id) && !isTeachLevel(id)) {
      for (let r = 0; r < Math.ceil(level.units.length / BENCH_COLS); r++) {
        const row = level.units.slice(r * BENCH_COLS, r * BENCH_COLS + BENCH_COLS);
        const same = new Map();
        for (const u of row) same.set(u[0], (same.get(u[0]) ?? 0) + 1);
        for (const [token, n] of same) {
          if (n >= 4) throw new Error(`L${id} bench row ${r} has ${n}x ${token}`);
        }
      }
    }
    if (level.cells.some((c) => c?.rescue)) {
      const rp = level.rescuePower ?? 0;
      if (rp < UNIT_POWER_MIN || rp > UNIT_POWER_MAX) {
        throw new Error(`L${id} rescuePower ${rp} outside ${UNIT_POWER_MIN}-${UNIT_POWER_MAX}`);
      }
    }
    const shape = shapeForLevel(id);
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
    if (level.cells.some((c) => c?.chest)) tags.push('chest');
    const depth = level.cells.reduce((n, cell) => Math.max(n, cell ? cell.tokens.length : 0), 0);
    let stacked = 0;
    let uniqSum = 0;
    let steps = 0;
    let flips = 0;
    for (const cell of level.cells) {
      if (!cell?.tokens || cell.tokens.length < 2) continue;
      stacked += 1;
      uniqSum += new Set(cell.tokens).size;
      for (let z = 1; z < cell.tokens.length; z++) {
        steps += 1;
        if (cell.tokens[z] !== cell.tokens[z - 1]) flips += 1;
      }
    }
    const peel = stacked
      ? ` layers=${(uniqSum / stacked).toFixed(1)} flips=${Math.round((100 * flips) / steps)}%`
      : '';
    console.log(
      `L${String(id).padStart(3)} ${shape.name} ${level.cols}x${level.rows}x${depth} pal=${pal.length}:${pal.join('')} front=${front.map((u) => u[0]).join('')} ${tags.join(' ') || 'absorb'} bricks=${bricks} units=${level.units.length} power=${pmin}-${pmax} avg=${pavg.toFixed(1)}${peel}`,
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
