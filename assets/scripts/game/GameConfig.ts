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
  suckRefPower: 60,
  suckRefInterval: 0.08,
  suckFlightSec: 0.34,
  suckArc: 0.62,
  suckMaxFlight: 8,
  suckMaxFlightTotal: 28,
  suckMinInterval: 0.05,
  suckMaxInterval: 0.16,
  /** First shot after an octopus lands in a pit. */
  suckLandDelay: 0.18,
  shotSpeed: 12,
  shotMinSec: 0.11,
  shotMaxSec: 0.28,
  shotArc: 0.02,
  wallSpinPeriod: 28,
  /** Swipe: degrees of field yaw/pitch per screen pixel. */
  wallSpinDragDeg: 0.38,

  wallCols: 28,
  wallRows: 20,
  wallDepth: 4,
  blockStep: 0.38,
  blockSize: 0.374,
  wallFrontZ: -2.08,
  slotStandZ: -1.38,
  slotRowStep: 0.58,
  slotStart: 4,
  slotMax: 6,
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
  wallBaseY: 1.48,
  palette: ['o', 'y', 'c', 'g', 'p', 'r'] as ColorToken[],
  brickMix: 1,
  ironRow: -1,
  ironRows: [] as number[],
  /** Columns with no plate; bricks below stay suckable. */
  ironGaps: [] as number[],
  sandCols: [] as number[],
  rescuePower: 5,
  raftX: 0,
  raftY: 0,
  raftW: 0,
  raftH: 0,
  raftTravel: 0,
  raftPeriod: 2.5,
};

/** World box that stays inside the fixed play camera (28x20 @ ~0.19). */
const WALL_SAFE_HALF_W = 2.85;
const WALL_SAFE_H = 4.18;
/** World Y the play camera can still see; a peeking brick still counts. */
export const VIEW_Y_MIN = 0.95;
export const VIEW_Y_MAX = 1.48 + WALL_SAFE_H + 0.08;
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

/** Rescue / chest / bomb / paint occupy this many cells on each side. */
export const SPECIAL_SPAN = 4;

export type SpecialMark = {
  rescue?: unknown;
  chest?: unknown;
  bomb?: boolean[];
  paint?: boolean[];
};

export function specialCenterX(col: number, startX: number, step: number, span = SPECIAL_SPAN): number {
  return startX + (col + (span - 1) * 0.5) * step;
}

export function specialCenterY(row: number, baseY: number, step: number, span = SPECIAL_SPAN): number {
  return baseY + (row + (span - 1) * 0.5) * step;
}

export function inSpecialFoot(col: number, row: number, x: number, y: number, span = SPECIAL_SPAN): boolean {
  return x >= col && x < col + span && y >= row && y < row + span;
}

export function isSpecialOrigin(cell: SpecialMark | null | undefined): boolean {
  return !!(cell?.rescue || cell?.chest || cell?.bomb?.[0] || cell?.paint?.[0]);
}

/** True when (x, y) sits in another special's 2×2 hole and is not the origin. */
export function coveredBySpecial(
  cells: Array<SpecialMark | null>,
  cols: number,
  x: number,
  y: number,
  span = SPECIAL_SPAN,
): boolean {
  for (let oy = Math.max(0, y - span + 1); oy <= y; oy++) {
    for (let ox = Math.max(0, x - span + 1); ox <= x; ox++) {
      if (ox === x && oy === y) continue;
      if (!isSpecialOrigin(cells[oy * cols + ox])) continue;
      if (inSpecialFoot(ox, oy, x, y, span)) return true;
    }
  }
  return false;
}

export function forSpecialRing(
  col: number,
  row: number,
  visit: (x: number, y: number) => void,
  span = SPECIAL_SPAN,
): void {
  for (let y = row - 1; y <= row + span; y++) {
    for (let x = col - 1; x <= col + span; x++) {
      if (inSpecialFoot(col, row, x, y, span)) continue;
      visit(x, y);
    }
  }
}

/** Inner edges of a holder brick that touch the special footprint. */
export const HOLD_R = 1;
export const HOLD_L = 2;
export const HOLD_U = 4;
export const HOLD_D = 8;

export function holdGlowMask(hx: number, hy: number, col: number, row: number, span = SPECIAL_SPAN): number {
  let m = 0;
  if (inSpecialFoot(col, row, hx + 1, hy, span)) m |= HOLD_R;
  if (inSpecialFoot(col, row, hx - 1, hy, span)) m |= HOLD_L;
  if (inSpecialFoot(col, row, hx, hy + 1, span)) m |= HOLD_U;
  if (inSpecialFoot(col, row, hx, hy - 1, span)) m |= HOLD_D;
  return m;
}

export function wallStartX(cols: number = PLAY.wallCols): number {
  return -((cols - 1) * PLAY.blockStep) / 2;
}

export function wallColAtX(x: number): number {
  const col = Math.round((x - wallStartX()) / PLAY.blockStep);
  return Math.max(0, Math.min(PLAY.wallCols - 1, col));
}

export const BENCH = {
  cols: 4,
  rows: 6,
  stepX: 0.72,
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

export const TOKEN_RGB: Record<ColorToken, readonly [number, number, number]> = {
  o: [255, 132, 28],
  y: [255, 158, 72],
  c: [24, 228, 236],
  g: [96, 224, 48],
  p: [255, 84, 164],
  v: [164, 92, 255],
  r: [255, 60, 76],
  s: [72, 176, 255],
  k: [255, 124, 100],
  m: [0, 212, 128],
  a: [240, 56, 216],
  d: [255, 196, 44],
};

export function isColorToken(token: string): token is ColorToken {
  return Object.prototype.hasOwnProperty.call(TOKEN_TO_ID, token);
}

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

