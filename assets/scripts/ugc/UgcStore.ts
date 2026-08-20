import { sys } from 'cc';
import {
  ALL_COLOR_TOKENS,
  ColorToken,
  TOKEN_RGB,
  TOKEN_VOXEL_ID,
  isColorToken,
} from '../game/GameConfig';
import {
  assignVoxelTokens,
  officialTokenOfVoxel,
  rgbOfVoxel,
  tokenForVoxel,
  uniqueVoxelIds,
} from '../game/VoxelPalette';
import type { LevelDef, UnitSpec } from '../game/LevelCatalog';

export const UGC_COLS = 8;
export const UGC_ROWS = 8;
export const UGC_DEPTH = 4;
export const UGC_MIN_DEPTH = 1;
export const UGC_MAX_DEPTH = 16;
/** Camera / block size stay fixed at this depth so add/remove layer does not shrink the stage. */
export const UGC_LAYOUT_DEPTH = 8;
export const UGC_PALETTE: readonly ColorToken[] = ALL_COLOR_TOKENS;

export type UgcSwatch = {
  token: ColorToken;
  voxelId: number;
};

/**
 * Every unique official ColorLibrary RGB that appears in catalog.json (430 maps).
 * Id 0 is the same white as 16 — keep 16.
 */
export const UGC_SWATCHES: readonly UgcSwatch[] = uniqueVoxelIds()
  .map((id) => (id === 0 ? 16 : id))
  .map((voxelId) => ({
    token: officialTokenOfVoxel(voxelId) ?? tokenForVoxel(voxelId),
    voxelId,
  }));

export type UgcTool = 'paint' | 'erase';

export type UgcBrick = {
  x: number;
  y: number;
  z: number;
  token: ColorToken;
  voxelId?: number;
};

export type UgcMap = {
  id: string;
  name: string;
  cols: number;
  rows: number;
  depth: number;
  bricks: UgcBrick[];
  updatedAt: number;
};

const SAVE_KEY = 'suck.ugc.maps.v1';
const MAX_MAPS = 20;

type RawMap = {
  id?: unknown;
  name?: unknown;
  cols?: unknown;
  rows?: unknown;
  depth?: unknown;
  bricks?: unknown;
  updatedAt?: unknown;
};

function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function clampSize(n: unknown, fallback: number, max: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(1, Math.min(max, v | 0));
}

function parseBricks(raw: unknown, cols: number, rows: number, depth: number): UgcBrick[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: UgcBrick[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const b = item as { x?: unknown; y?: unknown; z?: unknown; token?: unknown; voxelId?: unknown };
    const x = Number(b.x) | 0;
    const y = Number(b.y) | 0;
    const z = Number(b.z) | 0;
    const token = typeof b.token === 'string' && isColorToken(b.token) ? b.token : null;
    if (!token || x < 0 || y < 0 || z < 0 || x >= cols || y >= rows || z >= depth) continue;
    const key = `${x},${y},${z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rawId = Number(b.voxelId);
    const voxelId = Number.isFinite(rawId) ? rawId | 0 : TOKEN_VOXEL_ID[token];
    out.push({ x, y, z, token, voxelId });
  }
  return out;
}

function parseMap(raw: RawMap): UgcMap | null {
  if (typeof raw.id !== 'string' || !raw.id) return null;
  const cols = clampSize(raw.cols, UGC_COLS, 12);
  const rows = clampSize(raw.rows, UGC_ROWS, 12);
  const depth = clampSize(raw.depth, UGC_DEPTH, UGC_MAX_DEPTH);
  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 16) : '我的地图',
    cols,
    rows,
    depth,
    bricks: parseBricks(raw.bricks, cols, rows, depth),
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

/** This module is the only writer of SAVE_KEY, so the parse survives writes. */
let _cache: UgcMap[] | null = null;

function cloneMap(map: UgcMap): UgcMap {
  return { ...map, bricks: map.bricks.slice() };
}

function loadAll(): UgcMap[] {
  if (_cache) return _cache;
  try {
    const raw = sys.localStorage.getItem(SAVE_KEY);
    if (!raw) {
      _cache = [];
      return _cache;
    }
    const pack = JSON.parse(raw) as { maps?: RawMap[] };
    _cache = Array.isArray(pack?.maps)
      ? pack.maps.map(parseMap).filter((m): m is UgcMap => !!m)
      : [];
  } catch {
    _cache = [];
  }
  return _cache;
}

function readAll(): UgcMap[] {
  return loadAll().map(cloneMap);
}

function writeAll(maps: UgcMap[]): void {
  _cache = maps.map(cloneMap);
  try {
    sys.localStorage.setItem(SAVE_KEY, JSON.stringify({ maps }));
  } catch (e) {
    console.warn('[UgcStore] save failed', e);
  }
}

export function listUgcMaps(): UgcMap[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getUgcMap(id: string): UgcMap | null {
  return readAll().find((m) => m.id === id) ?? null;
}

export function newUgcMap(): UgcMap {
  const maps = readAll();
  const map: UgcMap = {
    id: uid(),
    name: `地图 ${maps.length + 1}`,
    cols: UGC_COLS,
    rows: UGC_ROWS,
    depth: UGC_DEPTH,
    bricks: [],
    updatedAt: Date.now(),
  };
  maps.push(map);
  writeAll(maps.slice(-MAX_MAPS));
  return map;
}

export function saveUgcMap(map: UgcMap): void {
  const maps = readAll();
  const next: UgcMap = { ...map, updatedAt: Date.now(), bricks: map.bricks.slice() };
  const i = maps.findIndex((m) => m.id === next.id);
  if (i >= 0) maps[i] = next;
  else maps.push(next);
  writeAll(maps.slice(-MAX_MAPS));
}

export function deleteUgcMap(id: string): void {
  writeAll(readAll().filter((m) => m.id !== id));
}

function bakeUnits(tokens: readonly ColorToken[]): UnitSpec[] {
  const counts = new Map<ColorToken, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  const units: UnitSpec[] = [];
  for (const token of ALL_COLOR_TOKENS) {
    const n = counts.get(token) ?? 0;
    if (n <= 0) continue;
    units.push([token, n]);
  }
  return units;
}

export function ugcToLevelDef(map: UgcMap): LevelDef {
  const counts: Record<number, number> = {};
  for (const b of map.bricks) {
    const colorId = b.voxelId ?? TOKEN_VOXEL_ID[b.token];
    counts[colorId] = (counts[colorId] ?? 0) + 1;
  }
  const assigned = assignVoxelTokens(counts);
  const used = new Set<ColorToken>();
  const voxels = map.bricks.map((b) => {
    const colorId = b.voxelId ?? TOKEN_VOXEL_ID[b.token];
    const token = assigned.map[colorId] ?? b.token;
    used.add(token);
    return { x: b.x, y: b.y, z: b.z, token, colorId };
  });
  const palette: ColorToken[] = [];
  if (used.size) used.forEach((t) => palette.push(t));
  else UGC_PALETTE.forEach((t) => palette.push(t));
  const tints: Partial<Record<ColorToken, readonly [number, number, number]>> = {};
  for (const t of palette) tints[t] = assigned.tints[t] ?? TOKEN_RGB[t];
  for (const v of voxels) tints[v.token] = rgbOfVoxel(v.colorId);
  return {
    id: 0,
    cols: map.cols,
    rows: map.rows,
    cells: [],
    units: bakeUnits(voxels.map((v) => v.token)),
    palette,
    brickMix: 0,
    tints,
    voxels,
    fieldYaw: 0,
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

export function ugcBlankLevel(map: UgcMap): LevelDef {
  return ugcToLevelDef({ ...map, bricks: [] });
}

function paletteText(pal: unknown): string {
  if (typeof pal === 'string') return pal;
  const out: string[] = [];
  if (Array.isArray(pal)) {
    for (let i = 0; i < pal.length; i++) {
      const t = pal[i];
      if (typeof t === 'string') out.push(t);
    }
    return out.join('');
  }
  if (pal && typeof (pal as { forEach?: unknown }).forEach === 'function') {
    (pal as Set<unknown>).forEach((t) => {
      if (typeof t === 'string') out.push(t);
    });
  }
  return out.join('');
}

export function encodeUgcText(map: UgcMap): string {
  const def = ugcToLevelDef(map);
  const voxels: number[] = [];
  for (const v of def.voxels) voxels.push(v.x, v.y, v.z, v.colorId);
  return JSON.stringify({
    v: 1,
    name: map.name,
    cols: map.cols,
    rows: map.rows,
    depth: map.depth,
    bricks: map.bricks.map((b) => ({
      x: b.x,
      y: b.y,
      z: b.z,
      token: b.token,
      voxelId: b.voxelId ?? TOKEN_VOXEL_ID[b.token],
    })),
    palette: paletteText(def.palette),
    units: def.units.map((u) => (u[2] ? [u[0], u[1], u[2]] : [u[0], u[1]])),
    voxels,
    cells: [],
  });
}

export function parseUgcText(text: string): UgcMap | null {
  const raw = text?.trim();
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (Array.isArray(obj)) {
      const first = obj[0];
      return first && typeof first === 'object' ? parseUgcObject(first as Record<string, unknown>) : null;
    }
    if (!obj || typeof obj !== 'object') return null;
    const pack = obj as { maps?: unknown; levels?: unknown };
    if (Array.isArray(pack.maps) && pack.maps[0]) return parseUgcObject(pack.maps[0] as Record<string, unknown>);
    if (Array.isArray(pack.levels) && pack.levels[0]) return parseUgcObject(pack.levels[0] as Record<string, unknown>);
    return parseUgcObject(obj as Record<string, unknown>);
  } catch {
    return null;
  }
}

function parseUgcObject(raw: Record<string, unknown>): UgcMap | null {
  const fromBricks = Array.isArray(raw.bricks)
    ? parseBricks(raw.bricks, clampSize(raw.cols, UGC_COLS, 12), clampSize(raw.rows, UGC_ROWS, 12), clampSize(raw.depth, UGC_DEPTH, UGC_MAX_DEPTH))
    : null;
  const fromVoxels = parseVoxelsField(raw.voxels);
  const bricks = (fromBricks && fromBricks.length) ? fromBricks : fromVoxels;
  if (!bricks) return null;
  let depth = clampSize(raw.depth, UGC_DEPTH, UGC_MAX_DEPTH);
  for (const b of bricks) depth = Math.max(depth, b.z + 1);
  depth = Math.max(UGC_MIN_DEPTH, Math.min(UGC_MAX_DEPTH, depth));
  const cols = clampSize(raw.cols, UGC_COLS, 12);
  const rows = clampSize(raw.rows, UGC_ROWS, 12);
  const id = typeof raw.id === 'string' && raw.id ? raw.id : uid();
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 16) : '导入地图';
  return {
    id,
    name,
    cols,
    rows,
    depth,
    bricks: parseBricks(bricks, cols, rows, depth),
    updatedAt: Date.now(),
  };
}

function parseVoxelsField(raw: unknown): UgcBrick[] | null {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  if (typeof raw[0] === 'object' && raw[0]) {
    return parseBricks(raw.map((item) => {
      const v = item as { x?: unknown; y?: unknown; z?: unknown; token?: unknown; colorId?: unknown; voxelId?: unknown };
      return { x: v.x, y: v.y, z: v.z, token: v.token, voxelId: v.voxelId ?? v.colorId };
    }), 12, 12, UGC_MAX_DEPTH);
  }
  const out: UgcBrick[] = [];
  const seen = new Set<string>();
  for (let i = 0; i + 3 < raw.length; i += 4) {
    const x = Number(raw[i]) | 0;
    const y = Number(raw[i + 1]) | 0;
    const z = Number(raw[i + 2]) | 0;
    const voxelId = Number(raw[i + 3]) | 0;
    if (x < 0 || y < 0 || z < 0) continue;
    const key = `${x},${y},${z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x, y, z, token: tokenForVoxel(voxelId), voxelId });
  }
  return out.length ? out : null;
}
