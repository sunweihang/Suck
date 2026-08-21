import { JsonAsset, resources, sys } from 'cc';
import {
  ColorToken,
  PLAY,
  TOKEN_RGB,
  fitPlayLayout,
  isColorToken,
} from './GameConfig';
import {
  alignUnitTokens,
  assignTokensForVoxels,
  officialTokenOfVoxel,
  rgbLooksSame,
  rgbOfVoxel,
} from './VoxelPalette';
import { playViewBand } from './ViewFit';
import { notifyPlayerDirty } from '../net/PlayerCloud';

export let LEVEL_COUNT = 100;

export type LevelCell = {
  tokens: ColorToken[];
  locked?: boolean[];
  rescue?: ColorToken;
  chest?: boolean;
};

export type UnitSpec = readonly [ColorToken, number] | readonly [ColorToken, number, string];

export type LevelDef = {
  id: number;
  cols: number;
  rows: number;
  cells: Array<LevelCell | null>;
  units: ReadonlyArray<UnitSpec>;
  palette: readonly ColorToken[];
  brickMix: number;
  tints: Partial<Record<ColorToken, readonly [number, number, number]>>;
  voxels: ReadonlyArray<{ x: number; y: number; z: number; token: ColorToken; colorId: number }>;
  fieldYaw: number;
  /** Highest plate row; -1 means none. */
  ironRow: number;
  /** Plate rows, low to high. Bricks at y >= row sit above that plate. */
  ironRows: number[];
  /** Columns with no plate on every iron row. */
  ironGaps: number[];
  sandCols: number[];
  rescuePower: number;
  raftX: number;
  raftY: number;
  raftW: number;
  raftH: number;
  raftTravel: number;
  raftPeriod: number;
};

type RawLevel = {
  id: number;
  cols: number;
  rows: number;
  ironRow?: number;
  ironRows?: number[];
  ironGaps?: number[];
  sandCols?: number[];
  rescuePower?: number;
  raftX?: number;
  raftY?: number;
  raftW?: number;
  raftH?: number;
  raftTravel?: number;
  raftPeriod?: number;
  brickMix?: number;
  palette: string;
  tints?: Record<string, [number, number, number]>;
  fieldYaw?: number;
  depth?: number;
  voxels?: number[];
  units: Array<[string, number] | [string, number, string]>;
  cells?: Array<string | null>;
};

const SAVE_KEY = 'suck.level';
const INDEX_PATH = 'levels/index';

/**
 * The full catalog is ~10MB of voxel arrays. It ships as fixed-size shards so
 * boot pulls a tiny index plus the one shard holding the level being played,
 * and a level only becomes objects when it is actually built.
 */
let SHARD_SIZE = 10;
let indexed = false;
const SHARDS = new Map<number, RawLevel[]>();
const SHARD_JOBS = new Map<number, Promise<void>>();
const SHARD_KEEP = 6;
const DECODED = new Map<number, LevelDef>();
const DECODE_KEEP = 4;
let loadJob: Promise<void> | null = null;

export function loadLevelIndex(): number {
  try {
    const n = Number(sys.localStorage.getItem(SAVE_KEY));
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(LEVEL_COUNT, n | 0));
  } catch {
    return 1;
  }
}

export function saveLevelIndex(n: number): void {
  try {
    sys.localStorage.setItem(SAVE_KEY, String(Math.max(1, Math.min(LEVEL_COUNT, n | 0))));
    notifyPlayerDirty();
  } catch (e) {
    console.warn('[LevelCatalog] save failed', e);
  }
}

export function applyLevel(def: LevelDef, opts?: { minDepth?: number }): void {
  PLAY.levelId = def.id;
  PLAY.wallCols = def.cols;
  PLAY.wallRows = def.rows;
  let depth = 1;
  if (def.voxels.length) {
    for (const v of def.voxels) depth = Math.max(depth, v.z + 1);
  } else {
    for (const cell of def.cells) {
      if (cell) depth = Math.max(depth, cell.tokens.length);
    }
  }
  PLAY.wallDepth = Math.max(depth, opts?.minDepth ?? 0);
  PLAY.palette = def.palette.slice();
  const tints = { ...(def.tints ?? {}) };
  for (const v of def.voxels) tints[v.token] = rgbOfVoxel(v.colorId);
  PLAY.tints = tints;
  PLAY.fieldYawDeg = def.fieldYaw ?? 0;
  PLAY.brickMix = def.brickMix;
  PLAY.ironRows = (def.ironRows ?? []).slice().sort((a, b) => a - b);
  PLAY.ironRow = PLAY.ironRows.length ? PLAY.ironRows[PLAY.ironRows.length - 1] : -1;
  PLAY.ironGaps = (def.ironGaps ?? []).slice();
  PLAY.sandCols = (def.sandCols ?? []).slice();
  PLAY.rescuePower = def.rescuePower ?? 5;
  PLAY.raftX = def.raftX ?? 0;
  PLAY.raftY = def.raftY ?? 0;
  PLAY.raftW = def.raftW ?? 0;
  PLAY.raftH = def.raftH ?? 0;
  PLAY.raftTravel = def.raftTravel ?? 0;
  PLAY.raftPeriod = def.raftPeriod ?? 2.5;
  const occ = occupiedVoxelRows(def);
  fitPlayLayout(def.cols, def.rows, depth, occ.min, occ.max, playViewBand());
}

/** Lowest / highest occupied brick row — used to drop short sculptures onto the pits. */
function occupiedVoxelRows(def: LevelDef): { min: number; max: number } {
  let min = def.rows;
  let max = -1;
  if (def.voxels.length) {
    for (const v of def.voxels) {
      min = Math.min(min, v.y);
      max = Math.max(max, v.y);
    }
  } else {
    for (let y = 0; y < def.rows; y++) {
      for (let x = 0; x < def.cols; x++) {
        if (def.cells[y * def.cols + x]) {
          min = Math.min(min, y);
          max = Math.max(max, y);
        }
      }
    }
  }
  if (max < min) return { min: 0, max: Math.max(0, def.rows - 1) };
  return { min, max };
}

function loadJson<T>(path: string, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${what} load timeout`));
    }, 8000);
    resources.load(path, JsonAsset, (err, asset) => {
      clearTimeout(timer);
      const json = asset?.json as T | undefined;
      if (err || !json) {
        reject(err ?? new Error(`${what} missing`));
        return;
      }
      resolve(json);
    });
  });
}

function clampId(id: number): number {
  return Math.max(1, Math.min(LEVEL_COUNT, id | 0));
}

function shardOf(id: number): number {
  return Math.floor((clampId(id) - 1) / SHARD_SIZE);
}

function shardPath(shard: number): string {
  return `levels/p${String(shard).padStart(3, '0')}`;
}

function touchShard(shard: number, levels: RawLevel[]): void {
  SHARDS.delete(shard);
  SHARDS.set(shard, levels);
  while (SHARDS.size > SHARD_KEEP) {
    const oldest = SHARDS.keys().next();
    if (oldest.done) break;
    SHARDS.delete(oldest.value);
    try {
      resources.release(shardPath(oldest.value), JsonAsset);
    } catch (e) {
      console.warn('[LevelCatalog] shard release failed', e);
    }
  }
}

export function ensureLevels(): Promise<void> {
  if (indexed) return Promise.resolve();
  if (loadJob) return loadJob;
  loadJob = loadJson<{ count?: number; size?: number }>(INDEX_PATH, 'levels/index').then((idx) => {
    LEVEL_COUNT = Math.max(1, idx.count | 0);
    SHARD_SIZE = Math.max(1, idx.size | 0);
    indexed = true;
  });
  return loadJob;
}

/** Pull the shard holding `id`. Must be awaited before getLevel(id). */
export async function ensureLevel(id: number): Promise<void> {
  await ensureLevels();
  const shard = shardOf(id);
  const hit = SHARDS.get(shard);
  if (hit) {
    touchShard(shard, hit);
    return;
  }
  let job = SHARD_JOBS.get(shard);
  if (!job) {
    const path = shardPath(shard);
    job = loadJson<{ levels?: RawLevel[] }>(path, path).then(
      (pack) => {
        SHARD_JOBS.delete(shard);
        if (!pack.levels?.length) throw new Error(`${path} empty`);
        touchShard(shard, pack.levels);
      },
      (err) => {
        SHARD_JOBS.delete(shard);
        throw err;
      },
    );
    SHARD_JOBS.set(shard, job);
  }
  await job;
}

export function getLevel(id: number): LevelDef {
  if (!indexed) throw new Error('level catalog not loaded');
  const n = clampId(id);
  const hit = DECODED.get(n);
  if (hit) {
    // Refresh recency so the levels around the player stay warm.
    DECODED.delete(n);
    DECODED.set(n, hit);
    return hit;
  }
  const shard = shardOf(n);
  const levels = SHARDS.get(shard);
  if (!levels) throw new Error(`level ${n} shard not loaded`);
  touchShard(shard, levels);
  const raw = levels[n - 1 - shard * SHARD_SIZE];
  if (!raw) throw new Error(`level ${n} missing from shard`);
  const def = decodeLevel(raw);
  DECODED.set(n, def);
  while (DECODED.size > DECODE_KEEP) {
    const oldest = DECODED.keys().next();
    if (oldest.done) break;
    DECODED.delete(oldest.value);
  }
  return def;
}

export type ItemId = 'shuffle' | 'hook' | 'shovel' | 'bomb';

export const ITEM_UNLOCK_LEVEL: Record<ItemId, number> = {
  shuffle: 3,
  hook: 4,
  shovel: 5,
  bomb: 6,
};

/** Victory settle: from this cleared level, hide 下一关 and keep only 双倍领取. */
export const WIN_DOUBLE_ONLY_FROM = 35;

/** After this official level, queued bench cubes hide their real color. */
export const HIDDEN_QUEUE_AFTER_LEVEL = 30;

export function itemUnlocked(id: ItemId, level: number): boolean {
  return (level | 0) >= ITEM_UNLOCK_LEVEL[id];
}

export function levelTitle(id: number): string {
  return `第 ${id} 关`;
}

export function levelBadgeText(id: number): string {
  return `关卡${String(Math.max(0, id | 0)).padStart(2, '0')}`;
}

function decodeCell(raw: string | null): LevelCell | null {
  if (!raw) return null;
  if (raw[0] === '@' && raw[1]) {
    return { tokens: [], rescue: raw[1].toLowerCase() as ColorToken };
  }
  if (raw[0] === '$') {
    return { tokens: [], chest: true };
  }
  const tokens: ColorToken[] = [];
  const locked: boolean[] = [];
  let anyLock = false;
  for (let i = 0; i < raw.length; i++) {
    // Drop leftover * / ! / ^ marks from retired bomb / paint / magnet bricks.
    if (raw[i] === '*' || raw[i] === '!' || raw[i] === '^') {
      i += 1;
      if (i >= raw.length) break;
    }
    const ch = raw[i];
    const up = ch >= 'A' && ch <= 'Z';
    tokens.push((up ? ch.toLowerCase() : ch) as ColorToken);
    locked.push(up);
    if (up) anyLock = true;
  }
  const cell: LevelCell = { tokens };
  if (anyLock) cell.locked = locked;
  return cell;
}

function decodeVoxels(
  raw: number[] | undefined,
  palette: string,
  tints?: Partial<Record<ColorToken, readonly [number, number, number]>>,
  units?: ReadonlyArray<UnitSpec>,
): Array<{ x: number; y: number; z: number; token: ColorToken; colorId: number }> {
  const out: Array<{ x: number; y: number; z: number; token: ColorToken; colorId: number }> = [];
  if (!raw?.length) return out;
  const counts: Record<number, number> = {};
  for (let i = 0; i + 3 < raw.length; i += 4) {
    const id = raw[i + 3] | 0;
    counts[id] = (counts[id] || 0) + 1;
  }
  const unitPower: Partial<Record<ColorToken, number>> = {};
  if (units) {
    for (let i = 0; i < units.length; i++) {
      const t = units[i][0];
      unitPower[t] = (unitPower[t] ?? 0) + units[i][1];
    }
  }
  const mapped = assignTokensForVoxels(counts, tints, unitPower).map;
  for (let i = 0; i + 3 < raw.length; i += 4) {
    const colorId = raw[i + 3] | 0;
    const fromPal = palette[colorId];
    const token =
      mapped[colorId]
      ?? officialTokenOfVoxel(colorId)
      ?? (isColorToken(fromPal) ? fromPal : 'o');
    out.push({ x: raw[i] | 0, y: raw[i + 1] | 0, z: raw[i + 2] | 0, token, colorId });
  }
  return out;
}

function remapUnits(
  units: ReadonlyArray<UnitSpec>,
  voxels: ReadonlyArray<{ token: ColorToken; colorId: number }>,
  tints: Partial<Record<ColorToken, readonly [number, number, number]>>,
): UnitSpec[] {
  if (!voxels.length) return units.slice();
  const colorRgb = new Map<number, readonly [number, number, number]>();
  const brickRgb = new Map<ColorToken, readonly [number, number, number]>();
  for (const v of voxels) {
    if (!colorRgb.has(v.colorId)) colorRgb.set(v.colorId, rgbOfVoxel(v.colorId));
    if (!brickRgb.has(v.token)) brickRgb.set(v.token, rgbOfVoxel(v.colorId));
  }
  const covers = (token: ColorToken): boolean => {
    const rgb = tints[token] ?? TOKEN_RGB[token];
    let ok = false;
    colorRgb.forEach((brgb) => {
      if (rgbLooksSame(rgb, brgb)) ok = true;
    });
    return ok;
  };
  const orphans: ColorToken[] = [];
  const seen = new Set<ColorToken>();
  for (let i = 0; i < units.length; i++) {
    const t = units[i][0];
    if (seen.has(t)) continue;
    seen.add(t);
    if (!covers(t)) orphans.push(t);
  }
  const aligned = orphans.length ? alignUnitTokens(orphans, brickRgb, tints) : null;
  return units.map((u) => {
    const next = aligned?.get(u[0]) ?? u[0];
    return u[2] ? ([next, u[1], u[2]] as const) : ([next, u[1]] as const);
  });
}

function decodeTints(
  raw?: Record<string, [number, number, number]>,
): Partial<Record<ColorToken, readonly [number, number, number]>> {
  const out: Partial<Record<ColorToken, readonly [number, number, number]>> = {};
  if (!raw) return out;
  for (const [key, rgb] of Object.entries(raw)) {
    if (!isColorToken(key) || !rgb || rgb.length < 3) continue;
    out[key] = [rgb[0] | 0, rgb[1] | 0, rgb[2] | 0];
  }
  return out;
}

function warnPowerGap(
  id: number,
  voxels: ReadonlyArray<{ token: ColorToken; colorId: number }>,
  units: ReadonlyArray<UnitSpec>,
): void {
  if (!voxels.length) return;
  const bricks = new Map<ColorToken, number>();
  const power = new Map<ColorToken, number>();
  for (let i = 0; i < voxels.length; i++) {
    const t = voxels[i].token;
    bricks.set(t, (bricks.get(t) ?? 0) + 1);
  }
  for (let i = 0; i < units.length; i++) {
    const t = units[i][0];
    power.set(t, (power.get(t) ?? 0) + units[i][1]);
  }
  const short: string[] = [];
  bricks.forEach((n, t) => {
    const have = power.get(t) ?? 0;
    if (have < n) short.push(`${t}:${have}/${n}`);
  });
  if (short.length) console.warn(`[Suck] L${id} color power short`, short.join(' '));
}

function decodeIronRows(raw: RawLevel): number[] {
  if (raw.ironRows?.length) return raw.ironRows.filter((n) => n >= 0).sort((a, b) => a - b);
  if ((raw.ironRow ?? -1) >= 0) return [raw.ironRow as number];
  return [];
}

function decodeLevel(raw: RawLevel): LevelDef {
  const ironRows = decodeIronRows(raw);
  const tints = decodeTints(raw.tints);
  const rawUnits = raw.units.map((u) => {
    const token = u[0] as ColorToken;
    const n = u[1];
    return u[2] ? ([token, n, u[2]] as const) : ([token, n] as const);
  });
  const voxels = decodeVoxels(raw.voxels, raw.palette, tints, rawUnits);
  const units = remapUnits(rawUnits, voxels, tints);
  warnPowerGap(raw.id, voxels, units);
  return {
    id: raw.id,
    cols: raw.cols,
    rows: raw.rows,
    ironRow: ironRows.length ? ironRows[ironRows.length - 1] : -1,
    ironRows,
    ironGaps: (raw.ironGaps ?? []).filter((n) => n >= 0),
    sandCols: (raw.sandCols ?? []).filter((n) => n >= 0),
    rescuePower: raw.rescuePower ?? 5,
    raftX: raw.raftX ?? 0,
    raftY: raw.raftY ?? 0,
    raftW: raw.raftW ?? 0,
    raftH: raw.raftH ?? 0,
    raftTravel: raw.raftTravel ?? 0,
    raftPeriod: raw.raftPeriod ?? 2.5,
    brickMix: raw.brickMix ?? 0,
    tints,
    fieldYaw: raw.fieldYaw ?? 0,
    voxels,
    palette: [...raw.palette] as ColorToken[],
    units,
    cells: (raw.cells ?? []).map(decodeCell),
  };
}
