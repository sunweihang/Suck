'use strict';

/** Rebuild units[] from voxel volume and deal them across the 4 bench columns. */
const fs = require('fs');
const path = require('path');
const levelIo = require('./level-io');
const { TOKENS, TOKEN_VOXEL_ID, assignTokens, decodeCatalogLevel, powerGaps } = require('./voxel-colors');
const { packPower, ensureMinUnits, spreadBenchUnits, minUnitsFor } = require('./bake-levels');

const BENCH_COLS = 4;
const MAX_COL_RUN = 2;

function tokenCounts(dec) {
  const counts = new Map();
  for (const v of dec.voxels) counts.set(v.token, (counts.get(v.token) || 0) + 1);
  return counts;
}

function faceToken(dec) {
  const face = new Map();
  for (const v of dec.voxels) {
    const key = `${v.x},${v.y}`;
    const prev = face.get(key);
    if (!prev || v.z < prev.z) face.set(key, v.token);
  }
  const n = new Map();
  for (const t of face.values()) n.set(t, (n.get(t) || 0) + 1);
  let best = null;
  let bestN = -1;
  for (const [t, c] of n) {
    if (c > bestN) {
      best = t;
      bestN = c;
    }
  }
  return best;
}

/** Dominant color uses fewer, fatter cannons so the tail is not a monochrome dump. */
function packFairUnits(counts, minCount) {
  const entries = [...counts.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return [];
  const total = entries.reduce((s, [, n]) => s + n, 0);
  const dominant = entries[0][0];
  const fat = entries[0][1] > total * 0.28;
  const units = [];
  for (const [token, n] of entries) {
    const isDom = fat && token === dominant;
    const parts = packPower(n, isDom ? 50 : 20, isDom ? 90 : 70, isDom ? 78 : 48);
    for (const part of parts) units.push([token, part]);
  }
  return spreadBenchUnits(ensureMinUnits(units, minCount));
}

function breakColumnRuns(units, maxRun = MAX_COL_RUN) {
  const out = units.map((u) => u.slice());
  const colorAt = (i) => out[i]?.[0] ?? null;
  const runBefore = (i) => {
    const col = i % BENCH_COLS;
    const token = colorAt(i);
    let n = 0;
    for (let j = i - BENCH_COLS; j >= 0 && j % BENCH_COLS === col && colorAt(j) === token; j -= BENCH_COLS) {
      n += 1;
    }
    return n;
  };
  for (let i = 0; i < out.length; i++) {
    if (runBefore(i) < maxRun) continue;
    const col = i % BENCH_COLS;
    const mine = colorAt(i);
    for (let j = i + 1; j < out.length; j++) {
      if (colorAt(j) === mine) continue;
      if (j % BENCH_COLS === col) continue;
      const saved = out[i];
      out[i] = out[j];
      out[j] = saved;
      if (runBefore(i) >= maxRun || runBefore(j) >= maxRun) {
        out[j] = out[i];
        out[i] = saved;
        continue;
      }
      break;
    }
  }
  return out;
}

function preferFaceFront(units, face) {
  if (!face || !units.length) return units;
  const front = units.slice(0, Math.min(BENCH_COLS, units.length));
  if (front.some((u) => u[0] === face)) return units;
  const later = units.findIndex((u, i) => i >= BENCH_COLS && u[0] === face);
  if (later < 0) return units;
  const out = units.map((u) => u.slice());
  const slot = front.findIndex((u) => u[0] !== face);
  if (slot < 0) return units;
  const saved = out[slot];
  out[slot] = out[later];
  out[later] = saved;
  return out;
}

function rowCounts(units, rank) {
  const n = new Map();
  for (let c = 0; c < BENCH_COLS; c++) {
    const u = units[rank * BENCH_COLS + c];
    if (!u) continue;
    n.set(u[0], (n.get(u[0]) || 0) + 1);
  }
  return n;
}

function colRunAt(units, i) {
  const token = units[i][0];
  const col = i % BENCH_COLS;
  let n = 1;
  for (let j = i - BENCH_COLS; j >= 0 && units[j][0] === token; j -= BENCH_COLS) n += 1;
  for (let j = i + BENCH_COLS; j < units.length && units[j][0] === token; j += BENCH_COLS) n += 1;
  return n;
}

/** Keep a bench row from filling with the same leftover color. */
function breakRowClumps(units, maxSame = 2) {
  const out = units.map((u) => u.slice());
  const ranks = Math.ceil(out.length / BENCH_COLS);
  for (let r = 0; r < ranks; r++) {
    const counts = rowCounts(out, r);
    for (const [token, n] of counts) {
      if (n <= maxSame) continue;
      for (let c = 0; c < BENCH_COLS && rowCounts(out, r).get(token) > maxSame; c++) {
        const i = r * BENCH_COLS + c;
        if (!out[i] || out[i][0] !== token) continue;
        for (let j = 0; j < out.length; j++) {
          if (Math.floor(j / BENCH_COLS) === r) continue;
          if (out[j][0] === token) continue;
          const saved = out[i];
          out[i] = out[j];
          out[j] = saved;
          const rowJ = Math.floor(j / BENCH_COLS);
          const worseRow = (rowCounts(out, r).get(out[i][0]) || 0) > maxSame
            || (rowCounts(out, rowJ).get(out[j][0]) || 0) > maxSame;
          const worseCol = colRunAt(out, i) > MAX_COL_RUN || colRunAt(out, j) > MAX_COL_RUN;
          if (worseRow || worseCol) {
            out[j] = out[i];
            out[i] = saved;
            continue;
          }
          break;
        }
      }
    }
  }
  return out;
}

function repackRaw(raw) {
  const dec = decodeCatalogLevel(raw);
  const counts = tokenCounts(dec);
  const units = preferFaceFront(
    breakRowClumps(breakColumnRuns(packFairUnits(counts, minUnitsFor(raw.id | 0)))),
    faceToken(dec),
  );
  const next = { ...raw, units };
  const gaps = powerGaps({ voxels: dec.voxels, units });
  if (gaps.short.length) {
    throw new Error(`L${raw.id} still short ${JSON.stringify(gaps.short)}`);
  }
  return next;
}

function colRuns(units) {
  const out = [];
  for (let c = 0; c < BENCH_COLS; c++) {
    const colors = [];
    for (let i = c; i < units.length; i += BENCH_COLS) colors.push(units[i][0]);
    let run = 1;
    let maxRun = 1;
    for (let i = 1; i < colors.length; i++) {
      if (colors[i] === colors[i - 1]) {
        run += 1;
        maxRun = Math.max(maxRun, run);
      } else run = 1;
    }
    out.push({ col: c, maxRun, seq: colors.join('') });
  }
  return out;
}

function summarize(raw) {
  const powers = (raw.units || []).map((u) => u[1]);
  return {
    id: raw.id,
    units: (raw.units || []).length,
    power: powers.length ? `${Math.min(...powers)}-${Math.max(...powers)}` : '-',
    front: (raw.units || []).slice(0, 4).map((u) => u[0]).join(''),
    cols: colRuns(raw.units || []),
  };
}

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const TINY_BRICKS = 20;
const HEAVY_DOMINANT = 0.7;

function unpackVoxels(raw) {
  const arr = raw.voxels || [];
  const out = [];
  for (let i = 0; i + 3 < arr.length; i += 4) {
    out.push({ x: arr[i] | 0, y: arr[i + 1] | 0, z: arr[i + 2] | 0, colorId: arr[i + 3] | 0 });
  }
  return out;
}

function packVoxels(list) {
  const out = [];
  for (const v of list) out.push(v.x, v.y, v.z, v.colorId);
  return out;
}

function voxelKey(x, y, z) {
  return `${x},${y},${z}`;
}

function occupancy(list) {
  const occ = new Map();
  for (let i = 0; i < list.length; i++) occ.set(voxelKey(list[i].x, list[i].y, list[i].z), i);
  return occ;
}

function colorCounts(list) {
  const n = new Map();
  for (const v of list) n.set(v.colorId, (n.get(v.colorId) || 0) + 1);
  return n;
}

function surfaceDist(list) {
  const occ = occupancy(list);
  const dist = new Array(list.length).fill(Infinity);
  const q = [];
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    const open = DIRS.some(([dx, dy, dz]) => !occ.has(voxelKey(v.x + dx, v.y + dy, v.z + dz)));
    if (!open) continue;
    dist[i] = 0;
    q.push(i);
  }
  for (let head = 0; head < q.length; head++) {
    const i = q[head];
    const v = list[i];
    for (const [dx, dy, dz] of DIRS) {
      const j = occ.get(voxelKey(v.x + dx, v.y + dy, v.z + dz));
      if (j == null || dist[j] <= dist[i] + 1) continue;
      dist[j] = dist[i] + 1;
      q.push(j);
    }
  }
  return dist;
}

function nearestBig(list, occ, start, tiny) {
  const seen = new Set([start]);
  const q = [start];
  for (let head = 0; head < q.length; head++) {
    const i = q[head];
    const v = list[i];
    for (const [dx, dy, dz] of DIRS) {
      const j = occ.get(voxelKey(v.x + dx, v.y + dy, v.z + dz));
      if (j == null || seen.has(j)) continue;
      if (!tiny.has(list[j].colorId)) return list[j].colorId;
      seen.add(j);
      q.push(j);
    }
  }
  return null;
}

function absorbTinyColors(list, minN = TINY_BRICKS) {
  const counts = colorCounts(list);
  const tiny = new Set([...counts.entries()].filter(([, n]) => n < minN).map(([id]) => id));
  if (!tiny.size || tiny.size >= counts.size) return 0;
  const occ = occupancy(list);
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    if (!tiny.has(list[i].colorId)) continue;
    const next = nearestBig(list, occ, i, tiny);
    if (next == null) continue;
    list[i].colorId = next;
    n += 1;
  }
  return n;
}

function paintInterior(list) {
  const counts = colorCounts(list);
  if (!counts.size) return 0;
  const [domId, domN] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (counts.size > 1 && domN / list.length < HEAVY_DOMINANT) return 0;
  const dist = surfaceDist(list);
  const interior = [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].colorId === domId && dist[i] >= 1) interior.push(i);
  }
  if (interior.length < 40) return 0;
  const spare = TOKENS.map((t) => TOKEN_VOXEL_ID[t]).filter((id) => id !== domId);
  const k = Math.min(4, Math.floor(interior.length / TINY_BRICKS), spare.length);
  if (k < 1) return 0;
  interior.sort((a, b) => dist[a] - dist[b] || list[a].x - list[b].x || list[a].y - list[b].y);
  const extra = spare.slice(0, k);
  const chunk = Math.ceil(interior.length / k);
  for (let i = 0; i < interior.length; i++) {
    list[interior[i]].colorId = extra[Math.min(k - 1, Math.floor(i / chunk))];
  }
  return interior.length;
}

function rebuildFaceCells(list, cols, rows) {
  const face = Array.from({ length: cols * rows }, () => ({ z: Infinity, id: -1 }));
  for (const v of list) {
    if (v.x < 0 || v.y < 0 || v.x >= cols || v.y >= rows) continue;
    const i = v.y * cols + v.x;
    if (v.z < face[i].z) face[i] = { z: v.z, id: v.colorId };
  }
  const counts = {};
  for (const v of list) counts[v.colorId] = (counts[v.colorId] || 0) + 1;
  const { map } = assignTokens(counts);
  return face.map((c) => (c.id >= 0 && map[c.id] ? map[c.id] : null));
}

function refreshPalette(raw, list) {
  const counts = {};
  for (const v of list) counts[v.colorId] = (counts[v.colorId] || 0) + 1;
  const { tints } = assignTokens(counts);
  const used = new Set(Object.keys(tints));
  raw.palette = TOKENS.filter((t) => used.has(t)).join('');
  raw.tints = tints;
}

function remeshRaw(raw) {
  const list = unpackVoxels(raw);
  if (!list.length) return { absorbed: 0, painted: 0 };
  const absorbed = absorbTinyColors(list);
  const painted = paintInterior(list);
  if (!absorbed && !painted) return { absorbed: 0, painted: 0 };
  raw.voxels = packVoxels(list);
  raw.units = [];
  refreshPalette(raw, list);
  raw.cells = rebuildFaceCells(list, raw.cols | 0, raw.rows | 0);
  const packed = repackRaw(raw);
  raw.units = packed.units;
  return { absorbed, painted };
}

function needsRemesh(raw) {
  const list = unpackVoxels(raw);
  if (!list.length) return false;
  const counts = colorCounts(list);
  if ([...counts.values()].some((n) => n < TINY_BRICKS)) return true;
  const top = Math.max(...counts.values());
  return counts.size <= 1 || top / list.length >= HEAVY_DOMINANT;
}

function writeCatalog(pack) {
  fs.writeFileSync(levelIo.CATALOG, `${JSON.stringify({
    generatedBy: pack.generatedBy || 'tools/level-io.js',
    count: (pack.levels || []).length,
    levels: pack.levels,
  })}\n`);
}

function patchShards(pack, ids) {
  const byShard = new Map();
  for (const id of ids) {
    const shard = Math.floor((id - 1) / levelIo.SHARD_SIZE);
    if (!byShard.has(shard)) byShard.set(shard, []);
    byShard.get(shard).push(id);
  }
  for (const [shard, shardIds] of byShard) {
    const file = path.join(levelIo.SHIP_DIR, `p${String(shard).padStart(3, '0')}.json`);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const id of shardIds) {
      const slot = (id - 1) % levelIo.SHARD_SIZE;
      const raw = (pack.levels || []).find((lv) => lv.id === id);
      if (!data.levels?.[slot] || data.levels[slot].id !== id || !raw) {
        throw new Error(`shard ${path.basename(file)} slot ${slot} is not L${id}`);
      }
      data.levels[slot].units = raw.units;
      data.levels[slot].voxels = raw.voxels;
      data.levels[slot].palette = raw.palette;
      data.levels[slot].tints = raw.tints;
      data.levels[slot].cells = raw.cells;
    }
    fs.writeFileSync(file, `${JSON.stringify(data)}\n`);
  }
}

function playableIds(pack) {
  return (pack.levels || [])
    .map((lv) => lv.id | 0)
    .filter((id) => id > 10 && !levelIo.hasOverride(id));
}

function collectIds(args, pack) {
  if (args[0] === '--all' || args[0] === '--remesh') {
    const all = playableIds(pack);
    if (args[0] === '--all') return all;
    return all.filter((id) => {
      const raw = (pack.levels || []).find((lv) => lv.id === id);
      return raw && needsRemesh(raw);
    });
  }
  return args.map(Number).filter((n) => n > 0);
}

function main() {
  const args = process.argv.slice(2);
  const remesh = args[0] === '--remesh' || args.includes('--remesh');
  const pack = levelIo.loadCatalogPack();
  const ids = collectIds(remesh && args[0] !== '--remesh' ? ['--remesh'] : args, pack);
  if (!ids.length) {
    console.error('usage: node tools/repack-level-units.js 39 45');
    console.error('       node tools/repack-level-units.js --all');
    console.error('       node tools/repack-level-units.js --remesh');
    process.exit(1);
  }
  const byId = new Map((pack.levels || []).map((lv) => [lv.id | 0, lv]));
  let changed = 0;
  for (const id of ids) {
    const raw = byId.get(id);
    if (!raw) throw new Error(`catalog missing L${id}`);
    if (remesh) {
      const hit = remeshRaw(raw);
      if (hit.absorbed || hit.painted) {
        changed += 1;
        console.log(`L${id} absorb=${hit.absorbed} paint=${hit.painted} ${JSON.stringify(summarize(raw))}`);
      }
      continue;
    }
    const after = repackRaw(raw);
    const same = JSON.stringify(raw.units) === JSON.stringify(after.units);
    raw.units = after.units;
    if (!same) changed += 1;
    if (ids.length <= 4) console.log('L' + id, JSON.stringify(summarize(after)));
  }
  writeCatalog(pack);
  patchShards(pack, ids);
  console.log(`${remesh ? 'remeshed' : 'repacked'} ${ids.length} levels, ${changed} changed`);
}

if (require.main === module) main();

module.exports = { repackRaw, packFairUnits, remeshRaw };
