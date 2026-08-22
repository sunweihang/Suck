'use strict';

/**
 * P1-3: keep tutorial 1–6, insert a stuck-gate at 7, then 1 hard + 2–3
 * normal with a rising curve. Pretty sculptures bias toward earlier slots.
 * Front-load face colors on the first post-tutorial stretch.
 */
const levelIo = require('./level-io');

const TEACH_LAST = 6;
const HIDDEN_AFTER = 6;
const EASY_FRONT_THROUGH = 30;

function unpack(raw) {
  const arr = raw.voxels || [];
  const out = [];
  for (let i = 0; i + 3 < arr.length; i += 4) {
    out.push({ x: arr[i] | 0, y: arr[i + 1] | 0, z: arr[i + 2] | 0, c: arr[i + 3] | 0 });
  }
  return out;
}

function faceMap(vox) {
  const face = new Map();
  for (const v of vox) {
    const key = `${v.x},${v.y}`;
    const prev = face.get(key);
    if (!prev || v.z < prev.z) face.set(key, v);
  }
  return face;
}

function faceFragments(face) {
  const cells = [...face.entries()].map(([key, v]) => {
    const [x, y] = key.split(',').map(Number);
    return { x, y, c: v.c };
  });
  const at = new Map(cells.map((c) => [`${c.x},${c.y}`, c]));
  const seen = new Set();
  let n = 0;
  for (const cell of cells) {
    const start = `${cell.x},${cell.y}`;
    if (seen.has(start)) continue;
    n += 1;
    const q = [cell];
    seen.add(start);
    for (let i = 0; i < q.length; i++) {
      const cur = q[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${cur.x + dx},${cur.y + dy}`;
        const nxt = at.get(k);
        if (!nxt || seen.has(k) || nxt.c !== cur.c) continue;
        seen.add(k);
        q.push(nxt);
      }
    }
  }
  return n;
}

function statsOf(raw) {
  const vox = unpack(raw);
  const bricks = vox.length;
  const palette = typeof raw.palette === 'string' ? raw.palette : (raw.palette || []).join('');
  const colors = palette.length || new Set(vox.map((v) => v.c)).size;
  let maxX = 0;
  let maxY = 0;
  let maxZ = 0;
  const counts = new Map();
  for (const v of vox) {
    maxX = Math.max(maxX, v.x);
    maxY = Math.max(maxY, v.y);
    maxZ = Math.max(maxZ, v.z);
    counts.set(v.c, (counts.get(v.c) || 0) + 1);
  }
  const depth = maxZ + 1;
  const cols = raw.cols || maxX + 1;
  const rows = raw.rows || maxY + 1;
  const face = faceMap(vox);
  const fragments = faceFragments(face);
  const fill = face.size / Math.max(1, cols * rows);
  let top = 0;
  for (const n of counts.values()) top = Math.max(top, n);
  const dominant = bricks ? top / bricks : 1;
  const units = (raw.units || []).length;
  return {
    id: raw.id,
    bricks,
    colors,
    depth,
    cols,
    rows,
    units,
    fragments,
    fill,
    dominant,
    face: face.size,
  };
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function difficultyOf(s) {
  return (
    0.34 * clamp01((s.bricks - 80) / 1400) +
    0.20 * clamp01((s.colors - 2) / 8) +
    0.16 * clamp01((s.fragments - 3) / 28) +
    0.14 * clamp01((s.depth - 3) / 16) +
    0.10 * clamp01((s.units - 8) / 70) +
    0.06 * (1 - s.dominant)
  );
}

function prettyOf(s) {
  const fillBand = 1 - Math.abs(s.fill - 0.52) / 0.52;
  const depthBand = s.depth >= 4 && s.depth <= 16 ? 1 : s.depth >= 3 ? 0.45 : 0.1;
  const brickBand = s.bricks >= 160 && s.bricks <= 900 ? 1 : s.bricks >= 80 && s.bricks <= 1200 ? 0.55 : 0.15;
  const colorBand = s.colors >= 3 && s.colors <= 7 ? 1 : s.colors === 8 ? 0.6 : 0.25;
  const fragBand = s.fragments >= 4 && s.fragments <= 18 ? 1 : s.fragments >= 3 && s.fragments <= 24 ? 0.55 : 0.2;
  const slim = s.cols >= 8 && s.rows >= 8 ? 1 : 0.4;
  return (
    0.22 * clamp01(fillBand) +
    0.20 * depthBand +
    0.22 * brickBand +
    0.16 * colorBand +
    0.14 * fragBand +
    0.06 * slim
  );
}

function isHardSlot(slot) {
  if (slot <= TEACH_LAST) return false;
  if (slot === 7) return true;
  let i = 8;
  let cycle = 0;
  while (i <= slot) {
    const normals = cycle % 2 === 0 ? 2 : 3;
    if (slot < i + normals) return false;
    i += normals;
    if (i === slot) return true;
    i += 1;
    cycle += 1;
  }
  return false;
}

function isGateCandidate(item) {
  const s = item.stats;
  return s.colors >= 6
    && s.bricks >= 800
    && s.bricks <= 1800
    && s.units >= 28
    && s.units <= 52
    && s.fragments >= 12
    && s.depth >= 6
    && !isAwkward(s);
}

function pickGate(pool) {
  const hits = pool.filter(isGateCandidate);
  const from = hits.length ? hits : pool;
  return from.slice().sort((a, b) => {
    const stuck = (b.stats.colors + b.stats.fragments * 0.35) - (a.stats.colors + a.stats.fragments * 0.35);
    if (Math.abs(stuck) > 0.2) return stuck;
    return b.pretty - a.pretty;
  })[0];
}

function isAwkward(s) {
  return s.depth <= 3 || s.fragments <= 1;
}

function takeWindow(rest, n) {
  const slice = rest.splice(0, Math.min(n, rest.length));
  slice.sort((a, b) => a.diff - b.diff);
  const hard = slice.pop();
  slice.sort((a, b) => b.pretty - a.pretty);
  return { normals: slice, hard };
}

function colRun(units, i) {
  const token = units[i]?.[0];
  if (!token) return 0;
  const col = i % 4;
  let n = 1;
  for (let j = i - 4; j >= 0 && units[j][0] === token && j % 4 === col; j -= 4) n += 1;
  for (let j = i + 4; j < units.length && units[j][0] === token && j % 4 === col; j += 4) n += 1;
  return n;
}

function preferHardStart(raw) {
  const cells = raw.cells || [];
  const faceTokens = new Map();
  for (const cell of cells) {
    if (!cell || typeof cell !== 'string') continue;
    const t = cell[0];
    if (!t) continue;
    faceTokens.set(t, (faceTokens.get(t) || 0) + 1);
  }
  const easy = [...faceTokens.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t);
  const out = (raw.units || []).map((u) => u.slice());
  for (let i = 0; i < Math.min(8, out.length); i++) {
    if (!easy.includes(out[i][0])) continue;
    const j = out.findIndex((u, k) => k > i && !easy.includes(u[0]));
    if (j < 0) continue;
    const saved = out[i];
    out[i] = out[j];
    out[j] = saved;
    if (colRun(out, i) >= 3 || colRun(out, j) >= 3) {
      out[j] = out[i];
      out[i] = saved;
    }
  }
  return { ...raw, units: out };
}

function preferEasyColors(raw) {
  const cells = raw.cells || [];
  const faceTokens = new Map();
  for (const cell of cells) {
    if (!cell || typeof cell !== 'string') continue;
    const t = cell[0];
    if (!t) continue;
    faceTokens.set(t, (faceTokens.get(t) || 0) + 1);
  }
  if (!faceTokens.size) return raw;
  const order = [...faceTokens.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const frontWant = order.slice(0, 2);
  const out = (raw.units || []).map((u) => u.slice());
  for (let i = 0; i < Math.min(8, out.length); i++) {
    const want = frontWant[i % frontWant.length];
    if (!want || out[i][0] === want) continue;
    const j = out.findIndex((u, k) => k > i && u[0] === want);
    if (j < 0) continue;
    const saved = out[i];
    out[i] = out[j];
    out[j] = saved;
    if (colRun(out, i) >= 3 || colRun(out, j) >= 3) {
      out[j] = out[i];
      out[i] = saved;
    }
  }
  return { ...raw, units: out };
}

function buildOrder(levels) {
  const scored = levels.map((raw) => {
    const s = statsOf(raw);
    return { raw, stats: s, diff: difficultyOf(s), pretty: prettyOf(s) };
  });
  const keep = scored.filter((x) => x.raw.id <= TEACH_LAST);
  const pool = scored.filter((x) => x.raw.id > TEACH_LAST);
  const out = keep.map((x) => x);
  const gate = pickGate(pool);
  out.push({ ...gate, slot: 7, hard: true });
  const rest = pool
    .filter((x) => x !== gate)
    .sort((a, b) => {
      const awk = Number(isAwkward(a.stats)) - Number(isAwkward(b.stats));
      if (awk) return awk;
      return a.diff - b.diff;
    });
  let cycle = 0;
  while (rest.length) {
    const normals = cycle % 2 === 0 ? 2 : 3;
    const win = takeWindow(rest, normals + 1);
    for (const item of win.normals) out.push({ ...item, hard: false });
    if (win.hard) out.push({ ...win.hard, hard: true });
    cycle += 1;
  }
  return out;
}

function stuckScore(s) {
  return s.fragments * 2 + s.colors * 8 + s.units * 1.2 - Math.max(0, s.bricks - 1600) * 0.01;
}

function hardenGate(levels) {
  const pool = levels
    .filter((raw) => raw.id >= 7 && raw.id <= 30)
    .map((raw) => {
      const s = statsOf(raw);
      return { raw, stats: s, score: stuckScore(s), ok: isGateCandidate({ stats: s }) };
    });
  const hits = pool.filter((x) => x.ok);
  const pick = (hits.length ? hits : pool).slice().sort((a, b) => b.score - a.score)[0];
  const gate = levels.find((raw) => raw.id === 7);
  if (!pick || !gate) throw new Error('missing L7 pool');
  if (pick.raw.id === 7) {
    const i = levels.findIndex((raw) => raw.id === 7);
    levels[i] = preferHardStart({ ...levels[i], id: 7 });
    return { swapped: false, from: 7, stats: statsOf(levels[i]) };
  }
  const i7 = levels.findIndex((raw) => raw.id === 7);
  const iP = levels.findIndex((raw) => raw.id === pick.raw.id);
  levels[i7] = preferHardStart({ ...pick.raw, id: 7 });
  levels[iP] = { ...gate, id: pick.raw.id };
  return {
    swapped: true,
    from: pick.raw.id,
    to: 7,
    stats: statsOf(levels[i7]),
    left: statsOf(levels[iP]),
  };
}

function applyOrder(plan) {
  const next = plan.map((item, i) => {
    const id = i + 1;
    let raw = { ...item.raw, id };
    if (id === 7) raw = preferHardStart(raw);
    else if (id > TEACH_LAST && id <= EASY_FRONT_THROUGH && !item.hard) raw = preferEasyColors(raw);
    return raw;
  });
  levelIo.writeCatalogPack({
    generatedBy: 'tools/reorder-p13-levels.js',
    levels: next,
  });
  return next;
}

function report(plan) {
  const lines = [];
  lines.push('id  src  H  diff  pretty  bricks  col  dpth  frag  units  fill');
  for (let i = 0; i < plan.length; i++) {
    const item = plan[i];
    const s = item.stats;
    const id = i + 1;
    if (id > 40 && id % 10 !== 0 && !item.hard) continue;
    if (id > 80 && id % 20 !== 0 && !item.hard) continue;
    const hard = id <= TEACH_LAST ? 'T' : item.hard ? 'H' : 'n';
    lines.push(
      `${String(id).padStart(3)} ${String(s.id).padStart(3)}  ${hard}  ${item.diff.toFixed(2)}  ${item.pretty.toFixed(2)}   ${String(s.bricks).padStart(5)}   ${String(s.colors).padStart(2)}   ${String(s.depth).padStart(3)}   ${String(s.fragments).padStart(3)}   ${String(s.units).padStart(3)}  ${s.fill.toFixed(2)}`,
    );
  }
  const hards = plan.filter((x, i) => i + 1 > TEACH_LAST && x.hard);
  const normals = plan.filter((x, i) => i + 1 > TEACH_LAST && !x.hard);
  lines.push('');
  lines.push(`teach 1-${TEACH_LAST} frozen; pool ${plan.length - TEACH_LAST}; hard ${hards.length}; normal ${normals.length}`);
  lines.push(`first gate L7 was L${plan[6].stats.id} bricks=${plan[6].stats.bricks} colors=${plan[6].stats.colors} pretty=${plan[6].pretty.toFixed(2)} diff=${plan[6].diff.toFixed(2)}`);
  return lines.join('\n');
}

function verifyPattern(lastId) {
  const slots = [];
  for (let i = 7; i <= Math.min(40, lastId); i++) slots.push(`${i}${isHardSlot(i) ? 'H' : 'n'}`);
  return slots.join(' ');
}

function main() {
  const dry = process.argv.includes('--dry');
  const force = process.argv.includes('--force');
  const pack = levelIo.loadCatalogPack();
  const levels = pack.levels || [];
  if (levels.length < 20) throw new Error(`catalog too small: ${levels.length}`);
  if (process.argv.includes('--harden-gate')) {
    const hit = hardenGate(levels);
    console.log(JSON.stringify(hit, null, 2));
    if (dry) {
      console.log('dry run, catalog not written');
      return;
    }
    levelIo.writeCatalogPack({ generatedBy: pack.generatedBy || 'tools/reorder-p13-levels.js', levels });
    console.log('hardened L7');
    return;
  }
  if (!dry && !force && pack.generatedBy === 'tools/reorder-p13-levels.js') {
    throw new Error('catalog already reordered; pass --force to run again');
  }
  const plan = buildOrder(levels);
  console.log(verifyPattern(levels.length));
  console.log(report(plan));
  if (dry) {
    console.log('dry run, catalog not written');
    return;
  }
  const map = plan.map((item, i) => ({
    from: item.stats.id,
    to: i + 1,
    hard: i + 1 <= TEACH_LAST ? 'teach' : item.hard ? 'hard' : 'normal',
  }));
  const fs = require('fs');
  const path = require('path');
  fs.writeFileSync(
    path.join(__dirname, '..', 'levels', 'p13-order.json'),
    `${JSON.stringify({ generatedBy: 'tools/reorder-p13-levels.js', hiddenAfter: HIDDEN_AFTER, map }, null, 2)}\n`,
  );
  applyOrder(plan);
  console.log(`wrote ${levels.length} levels; set HIDDEN_QUEUE_AFTER_LEVEL to ${HIDDEN_AFTER}`);
}

if (require.main === module) main();

module.exports = {
  TEACH_LAST,
  HIDDEN_AFTER,
  isHardSlot,
  statsOf,
  difficultyOf,
  prettyOf,
  buildOrder,
};
