'use strict';

/**
 * Put iron plates on later voxel levels.
 * Picks a mid-height cut, keeps the existing unit queue when it can still
 * clear each band, and only swaps front cannons when the top band would
 * otherwise have nothing to shoot.
 */
const fs = require('fs');
const path = require('path');
const levelIo = require('./level-io');
const { decodeCatalogLevel } = require('./voxel-colors');

const MIN_ID = 31;
const MIN_SPAN = 8;
const MIN_BAND = 40;
const MIN_COLORS = 2;
const ABOVE_LO = 0.28;
const ABOVE_HI = 0.68;
const MIN_GAP = 7;
const TWO_PLATE_FROM = 180;
const TWO_PLATE_SPAN = 14;
const BENCH_COLS = 4;

function loadHardIds() {
  const file = path.join(levelIo.ROOT, 'levels/p13-order.json');
  const hard = new Set();
  try {
    const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const row of pack.map || []) {
      if (row.hard === 'hard') hard.add(row.to | 0);
    }
  } catch {
    /* optional */
  }
  return hard;
}

function yRange(voxels) {
  let minY = 1e9;
  let maxY = -1e9;
  for (let i = 0; i < voxels.length; i++) {
    const y = voxels[i].y;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minY, maxY, span: maxY - minY };
}

function tokenCounts(list) {
  const n = new Map();
  for (let i = 0; i < list.length; i++) {
    const t = list[i].token;
    n.set(t, (n.get(t) || 0) + 1);
  }
  return n;
}

function bandOf(voxels, lo, hi) {
  return voxels.filter((v) => v.y >= lo && v.y < hi);
}

function scoreBands(voxels, rows) {
  const cuts = [...rows].sort((a, b) => b - a);
  const bands = [];
  let hi = Infinity;
  for (let i = 0; i < cuts.length; i++) {
    bands.push(bandOf(voxels, cuts[i], hi));
    hi = cuts[i];
  }
  bands.push(bandOf(voxels, -Infinity, hi));
  if (bands.some((b) => b.length < MIN_BAND)) return null;
  if (bands.some((b) => tokenCounts(b).size < MIN_COLORS)) return null;
  const top = bands[0].length / voxels.length;
  if (top < ABOVE_LO || top > ABOVE_HI) return null;
  const smallest = Math.min(...bands.map((b) => b.length));
  const colors = bands.reduce((s, b) => s + tokenCounts(b).size, 0);
  return { bands, score: smallest * colors, top };
}

function chooseRows(voxels, count) {
  const { minY, maxY, span } = yRange(voxels);
  if (span < MIN_SPAN) return null;
  let best = null;
  if (count <= 1) {
    for (let t = 0.36; t <= 0.64; t += 0.04) {
      const row = minY + Math.round(span * t);
      if (row <= minY || row > maxY) continue;
      const scored = scoreBands(voxels, [row]);
      if (scored && (!best || scored.score > best.score)) best = { rows: [row], ...scored };
    }
    return best;
  }
  if (span < TWO_PLATE_SPAN) return chooseRows(voxels, 1);
  for (let a = 0.28; a <= 0.42; a += 0.04) {
    for (let b = 0.58; b <= 0.72; b += 0.04) {
      const lo = minY + Math.round(span * a);
      const hi = minY + Math.round(span * b);
      if (hi - lo < 3 || lo <= minY || hi > maxY) continue;
      const scored = scoreBands(voxels, [lo, hi]);
      if (scored && (!best || scored.score > best.score)) best = { rows: [lo, hi], ...scored };
    }
  }
  return best || chooseRows(voxels, 1);
}

function cloneUnits(units) {
  return (units || []).map((u) => u.slice());
}

function canClearBands(bands, units) {
  const q = cloneUnits(units).map((u) => ({ t: u[0], n: u[1] }));
  for (let i = 0; i < bands.length; i++) {
    const need = tokenCounts(bands[i]);
    for (let k = 0; k < q.length && need.size; k++) {
      const left = need.get(q[k].t) || 0;
      if (!left || q[k].n <= 0) continue;
      const take = Math.min(left, q[k].n);
      q[k].n -= take;
      if (take === left) need.delete(q[k].t);
      else need.set(q[k].t, left - take);
    }
    if (need.size) return false;
  }
  return true;
}

function topColors(bands) {
  return new Set(tokenCounts(bands[0]).keys());
}

function frontHits(units, colors) {
  let n = 0;
  for (let i = 0; i < Math.min(BENCH_COLS, units.length); i++) {
    if (colors.has(units[i][0])) n += 1;
  }
  return n;
}

function preferTopFront(units, colors) {
  if (frontHits(units, colors) >= 2) return units;
  const out = cloneUnits(units);
  for (let slot = 0; slot < Math.min(BENCH_COLS, out.length) && frontHits(out, colors) < 2; slot++) {
    if (colors.has(out[slot][0])) continue;
    const later = out.findIndex((u, i) => i >= BENCH_COLS && colors.has(u[0]));
    if (later < 0) break;
    const saved = out[slot];
    out[slot] = out[later];
    out[later] = saved;
  }
  return out;
}

function prepareLevel(raw, wantTwo) {
  const dec = decodeCatalogLevel(raw);
  if (!dec.voxels.length) return null;
  const picked = chooseRows(dec.voxels, wantTwo ? 2 : 1);
  if (!picked) return null;
  let units = preferTopFront(cloneUnits(raw.units), topColors(picked.bands));
  if (frontHits(units, topColors(picked.bands)) < 1) return null;
  if (!canClearBands(picked.bands, units)) {
    units = preferTopFront(cloneUnits(raw.units), topColors(picked.bands));
    if (!canClearBands(picked.bands, units)) return null;
  }
  const rows = [...picked.rows].sort((a, b) => a - b);
  return {
    units,
    ironRows: rows,
    ironRow: rows[rows.length - 1],
    ironGaps: [],
    top: picked.top,
    score: picked.score,
  };
}

function pickIds(pack, hard) {
  const byId = new Map((pack.levels || []).map((lv) => [lv.id | 0, lv]));
  const chosen = [];
  let last = -999;
  for (let id = MIN_ID; id <= (pack.count || 0); id++) {
    const raw = byId.get(id);
    if (!raw || levelIo.hasOverride(id)) continue;
    const wantTwo = id >= TWO_PLATE_FROM;
    const ready = prepareLevel(raw, wantTwo);
    if (!ready) continue;
    const gap = id - last;
    const take = !chosen.length || gap >= (hard.has(id) ? MIN_GAP : MIN_GAP + 3);
    if (!take) continue;
    chosen.push({ id, ...ready });
    last = id;
  }
  return chosen;
}

function apply(pack, chosen) {
  const byId = new Map((pack.levels || []).map((lv) => [lv.id | 0, lv]));
  for (const hit of chosen) {
    const raw = byId.get(hit.id);
    raw.ironRows = hit.ironRows;
    raw.ironRow = hit.ironRow;
    raw.ironGaps = hit.ironGaps;
    raw.units = hit.units;
  }
  pack.generatedBy = 'tools/inject-iron-plates.js';
  pack.count = (pack.levels || []).length;
  levelIo.writeCatalogPack(pack);
}

function main() {
  const dry = process.argv.includes('--dry');
  const pack = levelIo.loadCatalogPack();
  const hard = loadHardIds();
  const chosen = pickIds(pack, hard);
  if (!chosen.length) {
    console.error('no suitable later levels for iron plates');
    process.exit(1);
  }
  for (const hit of chosen) {
    const kind = hard.has(hit.id) ? 'hard' : 'norm';
    console.log(
      `L${String(hit.id).padStart(3, '0')} ${kind} iron=${hit.ironRows.join('/')} ` +
        `top=${(hit.top * 100).toFixed(0)}% front=${hit.units.slice(0, 4).map((u) => u[0]).join('')}`,
    );
  }
  console.log(`${dry ? 'dry' : 'write'} ${chosen.length} iron levels, first=${chosen[0].id}`);
  if (!dry) apply(pack, chosen);
}

main();
