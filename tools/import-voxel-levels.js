'use strict';

const fs = require('fs');
const path = require('path');
const { TOKENS, assignTokens } = require('./voxel-colors');
const levelIo = require('./level-io');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'tmp-cube-pack', 'levels-json');
const OUT = levelIo.CATALOG;
const UNIT_CHUNK = 72;
/** Default orbit so the face-on bird matches the original 3/4 screenshot. */
const FIELD_YAW = 0;

function stepOf(values) {
  const uniq = [...new Set(values)].sort((a, b) => a - b);
  let step = 0;
  for (let i = 1; i < uniq.length; i++) {
    const d = uniq[i] - uniq[i - 1];
    if (d > 0) step = step ? Math.min(step, d) : d;
  }
  return Math.max(1, step);
}

function convert(raw, id) {
  const voxels = raw.voxels || [];
  if (!voxels.length) throw new Error(`level ${id} empty`);
  const counts = {};
  for (const v of voxels) counts[v.color] = (counts[v.color] || 0) + 1;
  const { map, tints } = assignTokens(counts);

  const xs = voxels.map((v) => v.x);
  const ys = voxels.map((v) => v.y);
  const zs = voxels.map((v) => v.z);
  const step = Math.min(stepOf(xs), stepOf(ys), stepOf(zs));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const minZ = Math.min(...zs);
  const sx = Math.floor((Math.max(...xs) - minX) / step) + 1;
  const sy = Math.floor((Math.max(...ys) - minY) / step) + 1;
  const sz = Math.floor((Math.max(...zs) - minZ) / step) + 1;
  const tokenCounts = new Map();
  for (const v of voxels) {
    const t = map[v.color];
    tokenCounts.set(t, (tokenCounts.get(t) || 0) + 1);
  }
  const palette = TOKENS.filter((t) => tokenCounts.has(t));
  const packed = [];
  const face = Array.from({ length: sx * sy }, () => ({ z: Infinity, t: '' }));
  for (const v of voxels) {
    const x = Math.floor((v.x - minX) / step);
    const y = Math.floor((v.y - minY) / step);
    const z = Math.floor((v.z - minZ) / step);
    const token = map[v.color];
    packed.push(x, y, z, v.color | 0);
    const i = y * sx + x;
    if (z < face[i].z) face[i] = { z, t: token };
  }
  const cells = face.map((c) => (c.t ? c.t : null));
  const remain = palette.map((t) => ({ t, n: tokenCounts.get(t) }));
  const units = [];
  while (remain.some((b) => b.n > 0)) {
    for (const b of remain) {
      if (b.n <= 0) continue;
      const chunk = Math.min(b.n, UNIT_CHUNK);
      units.push([b.t, chunk]);
      b.n -= chunk;
    }
  }
  return {
    id,
    cols: sx,
    rows: sy,
    depth: sz,
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
    brickMix: 0,
    fieldYaw: FIELD_YAW,
    palette: palette.join(''),
    tints,
    units,
    voxels: packed,
    cells,
  };
}

function main() {
  const files = fs.readdirSync(SRC)
    .filter((n) => /^level_\d+\.json$/.test(n))
    .sort((a, b) => Number(a.slice(6, -5)) - Number(b.slice(6, -5)));
  const levels = [];
  for (const file of files) {
    const srcId = Number(file.slice(6, -5));
    const raw = JSON.parse(fs.readFileSync(path.join(SRC, file), 'utf8'));
    const level = convert(raw, srcId);
    if (level.cells.length !== level.cols * level.rows) {
      throw new Error(`L${srcId} cells ${level.cells.length} != ${level.cols}x${level.rows}`);
    }
    levels.push(level);
  }
  levels.sort((a, b) => a.id - b.id);
  levels.forEach((level, i) => {
    level.id = i + 1;
  });
  levelIo.writeCatalogPack({ generatedBy: 'tools/import-voxel-levels.js', levels });
  const l6 = levels[5];
  console.log(
    `wrote ${path.relative(ROOT, OUT)} levels=${levels.length} L6 ${l6.cols}x${l6.rows}x${l6.depth} vox=${l6.voxels.length / 4} pal=${l6.palette}`,
  );
}

if (require.main === module) main();
module.exports = { convert };
