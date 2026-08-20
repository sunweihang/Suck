'use strict';

/** Shared catalog / per-level override I/O. Overrides live outside resources so they are not shipped. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
/** Authoring copy. Kept out of assets/ so the 10MB pack never ships. */
const CATALOG = path.join(ROOT, 'levels/catalog.json');
const OVERRIDE_DIR = path.join(ROOT, 'levels');
/** Shipped shards. The runtime pulls only the shard holding the level it plays. */
const SHIP_DIR = path.join(ROOT, 'assets/resources/levels');
const SHARD_SIZE = 10;
const INDEX_UUID = '7e22bb20-0360-4b02-8002-000000000060';

function catalogCount() {
  try {
    const pack = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
    return Math.max(1, pack.levels?.length | 0);
  } catch {
    return 100;
  }
}

const LEVEL_COUNT = catalogCount();

function levelCount() {
  try {
    return catalogCount();
  } catch {
    return LEVEL_COUNT;
  }
}

const SPECIAL_TITLE = {
  1: '新手引导',
  2: '两种颜色',
  3: '解锁洗牌',
  5: '解锁合并',
  8: '解锁钩子',
  10: '解锁铲子',
  11: '挡板',
  21: '染色',
  41: '钉子锁',
  51: '炸弹',
  61: '拯救宝箱',
};

function overridePath(id) {
  return path.join(OVERRIDE_DIR, `L${String(id).padStart(3, '0')}.json`);
}

function loadOverride(id) {
  const file = overridePath(id);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || typeof raw !== 'object') return null;
    raw.id = id;
    return raw;
  } catch (err) {
    throw new Error(`bad override ${path.relative(ROOT, file)}: ${err.message}`);
  }
}

function saveOverride(id, raw) {
  fs.mkdirSync(OVERRIDE_DIR, { recursive: true });
  const packed = { ...raw, id: id | 0, hand: true };
  fs.writeFileSync(overridePath(id), `${JSON.stringify(packed, null, 2)}\n`);
  return overridePath(id);
}

function hasOverride(id) {
  return fs.existsSync(overridePath(id));
}

function decodeCell(raw) {
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

function encodeCell(cell) {
  if (!cell) return null;
  if (cell.rescue) return `@${cell.rescue}`;
  if (cell.chest) return '$';
  return (cell.tokens || [])
    .map((t, z) => {
      return cell.locked?.[z] ? t.toUpperCase() : t;
    })
    .join('');
}

function decodeLevel(raw) {
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
    brickMix: raw.brickMix ?? 0,
    palette: typeof raw.palette === 'string' ? [...raw.palette] : [...(raw.palette || [])],
    units: raw.units || [],
    cells: (raw.cells || []).map((c) => decodeCell(c)),
    hand: !!raw.hand,
  };
}

function encodeLevel(level) {
  const palette = Array.isArray(level.palette) ? level.palette.join('') : String(level.palette || '');
  return {
    id: level.id,
    cols: level.cols,
    rows: level.rows,
    ironRow: level.ironRow ?? -1,
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
    brickMix: level.brickMix ?? 0,
    palette,
    units: level.units || [],
    cells: (level.cells || []).map(encodeCell),
    hand: !!level.hand,
  };
}

function emptyRaw(id, cols = 22, rows = 16) {
  return {
    id,
    cols,
    rows,
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
    palette: 'oyc',
    units: [],
    cells: Array.from({ length: cols * rows }, () => null),
    hand: true,
  };
}

function loadCatalogPack() {
  if (!fs.existsSync(CATALOG)) return { generatedBy: 'tools/level-io.js', count: 0, levels: [] };
  return JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
}

function loadCatalogLevel(id) {
  const hand = loadOverride(id);
  if (hand) return hand;
  const pack = loadCatalogPack();
  const raw = (pack.levels || []).find((lv) => lv.id === id) || (pack.levels || [])[id - 1];
  return raw || emptyRaw(id);
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

function shardStem(i) {
  return `p${String(i).padStart(3, '0')}`;
}

function shardUuid(i) {
  return `7e22bb20-0360-4b02-8002-${String(100000 + i).padStart(12, '0')}`;
}

function writeJsonAsset(file, data, uuid) {
  fs.writeFileSync(file, `${JSON.stringify(data)}\n`);
  const meta = `${file}.meta`;
  if (!fs.existsSync(meta)) {
    fs.writeFileSync(meta, `${JSON.stringify(jsonMeta(uuid), null, 2)}\n`);
  }
}

/** Re-emit the shipped shards. Called on every catalog write so they cannot drift. */
function writeShipShards(levels) {
  fs.mkdirSync(SHIP_DIR, { recursive: true });
  const shards = Math.ceil(levels.length / SHARD_SIZE);
  for (const name of fs.readdirSync(SHIP_DIR)) {
    const hit = /^p(\d+)\.json(\.meta)?$/.exec(name);
    if (hit && (hit[1] | 0) >= shards) fs.unlinkSync(path.join(SHIP_DIR, name));
  }
  for (let i = 0; i < shards; i++) {
    const from = i * SHARD_SIZE;
    writeJsonAsset(
      path.join(SHIP_DIR, `${shardStem(i)}.json`),
      { from: from + 1, levels: levels.slice(from, from + SHARD_SIZE) },
      shardUuid(i),
    );
  }
  writeJsonAsset(
    path.join(SHIP_DIR, 'index.json'),
    { count: levels.length, size: SHARD_SIZE, shards },
    INDEX_UUID,
  );
  return shards;
}

function writeCatalogPack(pack) {
  fs.mkdirSync(path.dirname(CATALOG), { recursive: true });
  const levels = pack.levels || [];
  const out = {
    generatedBy: pack.generatedBy || 'tools/level-io.js',
    count: levels.length,
    levels,
  };
  fs.writeFileSync(CATALOG, `${JSON.stringify(out)}\n`);
  writeShipShards(levels);
  return CATALOG;
}

function patchCatalogLevel(raw) {
  const pack = loadCatalogPack();
  const levels = pack.levels || [];
  const id = raw.id | 0;
  const idx = levels.findIndex((lv) => lv.id === id);
  const cells = raw.cells || [];
  const looksEncoded = cells.every((c) => c == null || typeof c === 'string');
  const encoded = looksEncoded ? { ...raw, id } : encodeLevel(raw);
  delete encoded.hand;
  if (idx >= 0) levels[idx] = encoded;
  else {
    levels.push(encoded);
    levels.sort((a, b) => a.id - b.id);
  }
  pack.levels = levels;
  pack.count = levels.length;
  writeCatalogPack(pack);
  return encoded;
}

function levelTitle(id) {
  if (SPECIAL_TITLE[id]) return SPECIAL_TITLE[id];
  return `第 ${id} 关`;
}

function summarizeRaw(raw) {
  const packed = raw.voxels || [];
  if (packed.length >= 4) {
    const used = new Set();
    let maxZ = 0;
    let filled = 0;
    const seen = new Set();
    for (let i = 0; i + 3 < packed.length; i += 4) {
      used.add(packed[i + 3] | 0);
      maxZ = Math.max(maxZ, packed[i + 2] | 0);
      const key = `${packed[i] | 0},${packed[i + 1] | 0}`;
      if (!seen.has(key)) {
        seen.add(key);
        filled += 1;
      }
    }
    return {
      id: raw.id,
      cols: raw.cols,
      rows: raw.rows,
      depth: maxZ + 1,
      filled,
      bricks: (packed.length / 4) | 0,
      units: (raw.units || []).length,
      palette: typeof raw.palette === 'string' ? raw.palette : (raw.palette || []).join(''),
      used: [...used].join(','),
      hand: !!raw.hand || hasOverride(raw.id),
      ironRows: raw.ironRows || [],
      ironGaps: raw.ironGaps || [],
    };
  }
  const cells = raw.cells || [];
  let bricks = 0;
  let filled = 0;
  let depth = 0;
  const used = new Set();
  for (const cell of cells) {
    const decoded = typeof cell === 'string' || cell === null ? decodeCell(cell) : cell;
    if (!decoded) continue;
    filled += 1;
    bricks += decoded.tokens?.length || 0;
    depth = Math.max(depth, decoded.tokens?.length || 0);
    for (const t of decoded.tokens || []) used.add(t);
    if (decoded.rescue) used.add(decoded.rescue);
  }
  return {
    id: raw.id,
    cols: raw.cols,
    rows: raw.rows,
    depth,
    filled,
    bricks,
    units: (raw.units || []).length,
    palette: typeof raw.palette === 'string' ? raw.palette : (raw.palette || []).join(''),
    used: [...used].join(''),
    hand: !!raw.hand || hasOverride(raw.id),
    ironRows: raw.ironRows || [],
    ironGaps: raw.ironGaps || [],
  };
}

module.exports = {
  ROOT,
  CATALOG,
  SHIP_DIR,
  SHARD_SIZE,
  OVERRIDE_DIR,
  LEVEL_COUNT,
  levelCount,
  SPECIAL_TITLE,
  overridePath,
  loadOverride,
  saveOverride,
  hasOverride,
  decodeCell,
  encodeCell,
  decodeLevel,
  encodeLevel,
  emptyRaw,
  loadCatalogPack,
  loadCatalogLevel,
  writeCatalogPack,
  writeShipShards,
  patchCatalogLevel,
  levelTitle,
  summarizeRaw,
};
