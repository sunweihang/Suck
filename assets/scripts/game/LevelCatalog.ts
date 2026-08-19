import { JsonAsset, resources, sys } from 'cc';
import {
  ColorToken,
  GAME,
  PLAY,
  fitPlayLayout,
  isColorToken,
} from './GameConfig';
import { assignVoxelTokens, rgbOfVoxel } from './VoxelPalette';
import { playViewBand } from './ViewFit';

export let LEVEL_COUNT = 100;

export type LevelCell = {
  tokens: ColorToken[];
  locked?: boolean[];
  bomb?: boolean[];
  paint?: boolean[];
  magnet?: boolean[];
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
  cells: Array<string | null>;
};

const SAVE_KEY = 'suck.level';
const CATALOG_PATH = 'levels/catalog';

let LEVELS: LevelDef[] = [];
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
  } catch (e) {
    console.warn('[LevelCatalog] save failed', e);
  }
}

export function applyLevel(def: LevelDef): void {
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
  PLAY.wallDepth = depth;
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

export function ensureLevels(): Promise<void> {
  if (LEVELS.length) return Promise.resolve();
  if (loadJob) return loadJob;
  loadJob = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('levels/catalog load timeout'));
    }, 8000);
    resources.load(CATALOG_PATH, JsonAsset, (err, asset) => {
      clearTimeout(timer);
      const pack = asset?.json as { levels?: RawLevel[] } | undefined;
      if (err || !pack?.levels?.length) {
        reject(err ?? new Error('levels/catalog missing'));
        return;
      }
      LEVELS = pack.levels.map(decodeLevel);
      LEVEL_COUNT = LEVELS.length;
      resolve();
    });
  });
  return loadJob;
}

export function getLevel(id: number): LevelDef {
  if (!LEVELS.length) throw new Error('level catalog not loaded');
  const n = Math.max(1, Math.min(LEVELS.length, id | 0));
  return LEVELS[n - 1];
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
  const bomb: boolean[] = [];
  const paint: boolean[] = [];
  const magnet: boolean[] = [];
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
    tokens.push((up ? ch.toLowerCase() : ch) as ColorToken);
    locked.push(up && !mark);
    bomb.push(mark === '*');
    paint.push(mark === '!');
    magnet.push(mark === '^');
    if (up && !mark) anyLock = true;
    if (mark === '*') anyBomb = true;
    if (mark === '!') anyPaint = true;
    if (mark === '^') anyMagnet = true;
  }
  const cell: LevelCell = { tokens };
  if (anyLock) cell.locked = locked;
  if (anyBomb) cell.bomb = bomb;
  if (anyPaint) cell.paint = paint;
  if (anyMagnet) cell.magnet = magnet;
  return cell;
}

function decodeVoxels(
  raw: number[] | undefined,
  palette: string,
  tints?: Partial<Record<ColorToken, readonly [number, number, number]>>,
): Array<{ x: number; y: number; z: number; token: ColorToken; colorId: number }> {
  const out: Array<{ x: number; y: number; z: number; token: ColorToken; colorId: number }> = [];
  if (!raw?.length) return out;
  const counts: Record<number, number> = {};
  for (let i = 0; i + 3 < raw.length; i += 4) {
    const id = raw[i + 3] | 0;
    counts[id] = (counts[id] || 0) + 1;
  }
  const mapped = assignVoxelTokens(counts).map;
  const byRgb = new Map<string, ColorToken>();
  if (tints) {
    for (const key of Object.keys(tints)) {
      if (!isColorToken(key)) continue;
      const rgb = tints[key];
      if (!rgb) continue;
      byRgb.set(`${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0}`, key);
    }
  }
  for (let i = 0; i + 3 < raw.length; i += 4) {
    const colorId = raw[i + 3] | 0;
    const rgb = rgbOfVoxel(colorId);
    const fromTint = byRgb.get(`${rgb[0]},${rgb[1]},${rgb[2]}`);
    const fromId = mapped[colorId];
    const fromPal = palette[colorId];
    const token = fromTint ?? fromId ?? (isColorToken(fromPal) ? fromPal : 'o');
    out.push({ x: raw[i] | 0, y: raw[i + 1] | 0, z: raw[i + 2] | 0, token, colorId });
  }
  return out;
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

function decodeIronRows(raw: RawLevel): number[] {
  if (raw.ironRows?.length) return raw.ironRows.filter((n) => n >= 0).sort((a, b) => a - b);
  if ((raw.ironRow ?? -1) >= 0) return [raw.ironRow as number];
  return [];
}

function decodeLevel(raw: RawLevel): LevelDef {
  const ironRows = decodeIronRows(raw);
  const tints = decodeTints(raw.tints);
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
    voxels: decodeVoxels(raw.voxels, raw.palette, tints),
    palette: [...raw.palette] as ColorToken[],
    units: raw.units.map((u) => {
      const token = u[0] as ColorToken;
      const n = u[1];
      return u[2] ? ([token, n, u[2]] as const) : ([token, n] as const);
    }),
    cells: raw.cells.map(decodeCell),
  };
}
