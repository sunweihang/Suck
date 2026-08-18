'use strict';

/** Shared catalog / per-level override I/O. Overrides live outside resources so they are not shipped. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CATALOG = path.join(ROOT, 'assets/resources/levels/catalog.json');
const CATALOG_META = `${CATALOG}.meta`;
const OVERRIDE_DIR = path.join(ROOT, 'levels');
const CATALOG_UUID = '7e22bb20-0360-4b02-8002-000000000060';

function catalogCount() {
  try {
    const pack = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
    return Math.max(1, pack.levels?.length | 0);
  } catch {
    return 100;
  }
}

const LEVEL_COUNT = catalogCount();

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
  const bomb = [];
  const paint = [];
  const magnet = [];
  let anyLock = false;
  let anyBomb = false;
  let anyPaint = false;
  let anyMagnet = false;
  for (let i = 0; i < raw.length; i++) {
    let mark = '';
    if (raw[i] === '*' || raw[i] === '!' || raw[i] === '^') {
      mark = raw[i];
      i += 1;
      if (i >= raw.length) break;
    }
    const ch = raw[i];
    const up = ch >= 'A' && ch <= 'Z';
    tokens.push(up ? ch.toLowerCase() : ch);
    locked.push(up && !mark);
    bomb.push(mark === '*');
    paint.push(mark === '!');
    magnet.push(mark === '^');
    if (up && !mark) anyLock = true;
    if (mark === '*') anyBomb = true;
    if (mark === '!') anyPaint = true;
    if (mark === '^') anyMagnet = true;
  }
  const cell = { tokens };
  if (anyLock) cell.locked = locked;
  if (anyBomb) cell.bomb = bomb;
  if (anyPaint) cell.paint = paint;
  if (anyMagnet) cell.magnet = magnet;
  return cell;
}

function encodeCell(cell) {
  if (!cell) return null;
  if (cell.rescue) return `@${cell.rescue}`;
  if (cell.chest) return '$';
  return (cell.tokens || [])
    .map((t, z) => {
      const ch = cell.locked?.[z] ? t.toUpperCase() : t;
      if (cell.magnet?.[z]) return `^${ch}`;
      if (cell.paint?.[z]) return `!${ch}`;
      if (cell.bomb?.[z]) return `*${ch}`;
      return ch;
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

function writeCatalogPack(pack) {
  fs.mkdirSync(path.dirname(CATALOG), { recursive: true });
  const levels = pack.levels || [];
  const out = {
    generatedBy: pack.generatedBy || 'tools/level-io.js',
    count: levels.length,
    levels,
  };
  fs.writeFileSync(CATALOG, `${JSON.stringify(out)}\n`);
  if (!fs.existsSync(CATALOG_META)) {
    fs.writeFileSync(CATALOG_META, `${JSON.stringify(jsonMeta(CATALOG_UUID), null, 2)}\n`);
  }
  return CATALOG;
}

function patchCatalogLevel(raw) {
  const pack = loadCatalogPack();
  const levels = pack.levels || [];
  const id = raw.id | 0;
  const idx = levels.findIndex((lv) => lv.id === id);
  const encoded = raw.cells && raw.cells.length && typeof raw.cells[0] !== 'object'
    ? { ...raw, id }
    : encodeLevel(raw);
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
  OVERRIDE_DIR,
  LEVEL_COUNT,
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
  patchCatalogLevel,
  levelTitle,
  summarizeRaw,
};
