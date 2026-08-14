export const GAME = {
  designWidth: 1080,
  designHeight: 1920,

  worldCamPitchDeg: 28,
  worldCamYawDeg: 0,
  worldCamDist: 15.8,
  worldCamFovDeg: 38,
  worldCamNear: 0.1,
  worldCamFar: 48,
  worldCamLookAtX: 0,
  worldCamLookAtY: 2.45,
  worldCamLookAtZ: -1.55,

  blockHp: 90,
  matchMul: 2.2,
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
  blockStep: 0.36,
  blockSize: 0.354,
  wallFrontZ: -2.08,
  slotStandZ: -1.38,
  slotStart: 4,
  slotMax: 8,
  slotPickR: 0.42,
} as const;

export function slotSpacing(_count: number): number {
  return 0.76;
}

export function slotX(index: number, count: number): number {
  return -((count - 1) * slotSpacing(count)) / 2 + index * slotSpacing(count);
}

export function slotLocked(index: number): boolean {
  const side = (GAME.slotMax - GAME.slotStart) >> 1;
  return index < side || index >= GAME.slotMax - side;
}

export function wallColAtX(x: number): number {
  const startX = -((GAME.wallCols - 1) * GAME.blockStep) / 2;
  const col = Math.round((x - startX) / GAME.blockStep);
  return Math.max(0, Math.min(GAME.wallCols - 1, col));
}

export const ColorId = {
  Orange: 0,
  Yellow: 1,
  Cyan: 2,
  Lime: 3,
  Pink: 4,
  Violet: 5,
} as const;

export type ColorId = (typeof ColorId)[keyof typeof ColorId];

export type ColorToken = 'o' | 'y' | 'c' | 'g' | 'p' | 'v';

export function parseColorToken(token: string): ColorId {
  if (token === 'y') return ColorId.Yellow;
  if (token === 'c') return ColorId.Cyan;
  if (token === 'g') return ColorId.Lime;
  if (token === 'p') return ColorId.Pink;
  if (token === 'v') return ColorId.Violet;
  return ColorId.Orange;
}

export function wallColorToken(x: number, _y: number): ColorToken {
  const tokens: ColorToken[] = ['o', 'y', 'c', 'g', 'p', 'v'];
  const band = Math.floor((x * tokens.length) / GAME.wallCols);
  return tokens[Math.min(tokens.length - 1, Math.max(0, band))];
}

export const UNIT_SETUP: ReadonlyArray<readonly [ColorToken, number]> = [
  ['o', 40], ['y', 49], ['c', 80], ['g', 136], ['p', 40], ['v', 49],
  ['c', 20], ['o', 316], ['y', 40], ['p', 80], ['g', 136], ['v', 49],
  ['g', 80], ['c', 40], ['o', 20], ['y', 40], ['p', 200], ['v', 80],
  ['o', 49], ['v', 20], ['c', 80], ['g', 40], ['p', 20], ['y', 40],
];
