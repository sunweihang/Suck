import { JsonAsset, resources, sys } from 'cc';
import {
  ColorToken,
  PLAY,
  fitPlayLayout,
} from './GameConfig';

export const LEVEL_COUNT = 100;

export type LevelCell = {
  tokens: ColorToken[];
  locked?: boolean[];
};

export type LevelDef = {
  id: number;
  cols: number;
  rows: number;
  cells: Array<LevelCell | null>;
  units: ReadonlyArray<readonly [ColorToken, number]>;
  palette: readonly ColorToken[];
  brickMix: number;
  /** Highest plate row; -1 means none. */
  ironRow: number;
  /** Plate rows, low to high. Bricks at y >= row sit above that plate. */
  ironRows: number[];
  /** Columns with no plate on every iron row. */
  ironGaps: number[];
};

type RawLevel = {
  id: number;
  cols: number;
  rows: number;
  ironRow?: number;
  ironRows?: number[];
  ironGaps?: number[];
  brickMix?: number;
  palette: string;
  units: Array<[string, number]>;
  cells: Array<string | null>;
};

const SAVE_KEY = 'suck.level';
const CATALOG_PATH = 'levels/catalog';

let LEVELS: LevelDef[] = [];
let loadJob: Promise<void> | null = null;

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
  PLAY.ironRows = (def.ironRows ?? []).slice().sort((a, b) => a - b);
  PLAY.ironRow = PLAY.ironRows.length ? PLAY.ironRows[PLAY.ironRows.length - 1] : -1;
  PLAY.ironGaps = (def.ironGaps ?? []).slice();
  fitPlayLayout(def.cols, def.rows, depth);
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

export function isTutorialLevel(id: number): boolean {
  return (id | 0) === 1;
}

export function levelTitle(id: number): string {
  return isTutorialLevel(id) ? '新手引导' : `第 ${id} 关`;
}

export function levelBadgeText(id: number): string {
  return `关卡${String(Math.max(0, id | 0)).padStart(2, '0')}`;
}

function decodeCell(raw: string | null): LevelCell | null {
  if (!raw) return null;
  const tokens: ColorToken[] = [];
  const locked: boolean[] = [];
  let anyLock = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const up = ch >= 'A' && ch <= 'Z';
    tokens.push((up ? ch.toLowerCase() : ch) as ColorToken);
    locked.push(up);
    if (up) anyLock = true;
  }
  return anyLock ? { tokens, locked } : { tokens };
}

function decodeIronRows(raw: RawLevel): number[] {
  if (raw.ironRows?.length) return raw.ironRows.filter((n) => n >= 0).sort((a, b) => a - b);
  if ((raw.ironRow ?? -1) >= 0) return [raw.ironRow as number];
  return [];
}

function decodeLevel(raw: RawLevel): LevelDef {
  const ironRows = decodeIronRows(raw);
  return {
    id: raw.id,
    cols: raw.cols,
    rows: raw.rows,
    ironRow: ironRows.length ? ironRows[ironRows.length - 1] : -1,
    ironRows,
    ironGaps: (raw.ironGaps ?? []).filter((n) => n >= 0),
    brickMix: raw.brickMix ?? 0,
    palette: [...raw.palette] as ColorToken[],
    units: raw.units.map(([token, n]) => [token as ColorToken, n] as const),
    cells: raw.cells.map(decodeCell),
  };
}
