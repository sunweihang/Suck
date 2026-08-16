export const GAME = {
  designWidth: 1080,
  designHeight: 1920,

  worldCamPitchDeg: 28,
  worldCamYawDeg: 0,
  worldCamDist: 38.7,
  worldCamFovDeg: 16,
  worldCamNear: 0.1,
  worldCamFar: 80,
  worldCamLookAtX: 0,
  worldCamLookAtY: 2.45,
  worldCamLookAtZ: -1.55,

  blockHp: 90,
  matchMul: 1.45,
  missMul: 0.35,
  unitSpeed: 3.4,
  attackRange: 0.95,
  dragPickPx: 72,
  suckRefPower: 40,
  suckRefInterval: 0.08,
  suckFlightSec: 0.34,
  suckArc: 0.62,
  suckMaxFlight: 12,
  suckMinInterval: 0.022,

  wallCols: 15,
  wallRows: 11,
  wallDepth: 4,
  blockStep: 0.38,
  blockSize: 0.374,
  wallFrontZ: -2.08,
  slotStandZ: -1.38,
  slotRowStep: 0.58,
  slotStart: 4,
  slotMax: 8,
  slotRows: 1,
  slotPickR: 0.42,
} as const;

export const PLAY = {
  levelId: 1,
  wallCols: GAME.wallCols,
  wallRows: GAME.wallRows,
  wallDepth: GAME.wallDepth,
  blockStep: GAME.blockStep,
  blockSize: GAME.blockSize,
  wallBaseY: 0.22,
  palette: ['o', 'y', 'c', 'g', 'p', 'r'] as ColorToken[],
  brickMix: 1,
  ironRow: -1,
  ironRows: [] as number[],
};

/** World box that stays inside the fixed play camera (15x11 @ 0.38). */
const WALL_SAFE_HALF_W = 2.85;
const WALL_SAFE_H = 4.18;
const BLOCK_SIZE_RATIO = GAME.blockSize / GAME.blockStep;

/** Shrink step/size so this grid stays inside the current camera frustum. */
export function fitPlayLayout(cols: number, rows: number, _depth = 1): void {
  const spanX = Math.max(1, cols - 1 + BLOCK_SIZE_RATIO);
  const spanY = Math.max(1, rows - 1 + BLOCK_SIZE_RATIO);
  const step = Math.min(GAME.blockStep, (2 * WALL_SAFE_HALF_W) / spanX, WALL_SAFE_H / spanY);
  PLAY.blockStep = step;
  PLAY.blockSize = step * BLOCK_SIZE_RATIO;
}

export function slotSpacing(_count: number): number {
  return 0.76;
}

export function slotColOf(index: number): number {
  return index % GAME.slotMax;
}

export function slotRowOf(index: number): number {
  return Math.floor(index / GAME.slotMax);
}

export function slotTotal(): number {
  return GAME.slotMax * GAME.slotRows;
}

export function slotX(index: number, count: number = GAME.slotMax): number {
  const col = slotColOf(index);
  return -((count - 1) * slotSpacing(count)) / 2 + col * slotSpacing(count);
}

export function slotZ(index: number): number {
  return GAME.slotStandZ + slotRowOf(index) * GAME.slotRowStep;
}

export function slotLocked(index: number): boolean {
  if (slotRowOf(index) > 0) return true;
  const col = slotColOf(index);
  const side = (GAME.slotMax - GAME.slotStart) >> 1;
  return col < side || col >= GAME.slotMax - side;
}

export function wallStartX(cols: number = PLAY.wallCols): number {
  return -((cols - 1) * PLAY.blockStep) / 2;
}

export function wallColAtX(x: number): number {
  const col = Math.round((x - wallStartX()) / PLAY.blockStep);
  return Math.max(0, Math.min(PLAY.wallCols - 1, col));
}

export const BENCH = {
  cols: 6,
  rows: 6,
  stepX: 0.52,
  stepZ: 0.74,
  startZ: 0.62,
} as const;

export function benchColOf(index: number): number {
  return index % BENCH.cols;
}

export function benchRankOf(index: number): number {
  return Math.floor(index / BENCH.cols);
}

export function benchSeatX(col: number): number {
  return -((BENCH.cols - 1) * BENCH.stepX) / 2 + col * BENCH.stepX;
}

export function benchSeatZ(rank: number): number {
  return BENCH.startZ + rank * BENCH.stepZ;
}

export const ColorId = {
  Orange: 0,
  Yellow: 1,
  Cyan: 2,
  Lime: 3,
  Pink: 4,
  Violet: 5,
  Red: 6,
  Sky: 7,
  Coral: 8,
  Mint: 9,
  Magenta: 10,
  Gold: 11,
} as const;

export type ColorId = (typeof ColorId)[keyof typeof ColorId];

export const COLOR_COUNT = 12;

export type ColorToken = 'o' | 'y' | 'c' | 'g' | 'p' | 'v' | 'r' | 's' | 'k' | 'm' | 'a' | 'd';

export const ALL_COLOR_TOKENS: readonly ColorToken[] = [
  'o', 'y', 'c', 'g', 'p', 'v', 'r', 's', 'k', 'm', 'a', 'd',
];

const TOKEN_TO_ID: Record<ColorToken, ColorId> = {
  o: ColorId.Orange,
  y: ColorId.Yellow,
  c: ColorId.Cyan,
  g: ColorId.Lime,
  p: ColorId.Pink,
  v: ColorId.Violet,
  r: ColorId.Red,
  s: ColorId.Sky,
  k: ColorId.Coral,
  m: ColorId.Mint,
  a: ColorId.Magenta,
  d: ColorId.Gold,
};

export function parseColorToken(token: string): ColorId {
  return TOKEN_TO_ID[token as ColorToken] ?? ColorId.Orange;
}

export function tokenOfColorId(id: ColorId): ColorToken {
  return ALL_COLOR_TOKENS[id] ?? 'o';
}

export function wallColorToken(x: number, _y: number): ColorToken {
  const tokens = PLAY.palette.length > 0 ? PLAY.palette : ALL_COLOR_TOKENS;
  const band = Math.floor((x * tokens.length) / Math.max(1, PLAY.wallCols));
  return tokens[Math.min(tokens.length - 1, Math.max(0, band))];
}

