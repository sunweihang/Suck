export const GAME = {
  designWidth: 1080,
  designHeight: 1920,

  /** Original Game Camera: ortho, local euler X = -25°. */
  worldCamPitchDeg: 25,
  worldCamYawDeg: 0,
  worldCamDist: 38.7,
  worldCamFovDeg: 16,
  worldCamOrthoHeight: 5.45,
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
  suckMaxFlight: 6,
  suckMaxFlightTotal: 16,
  suckMinInterval: 0.05,
  suckMaxInterval: 0.16,
  /** First shot after an octopus lands in a pit. */
  suckLandDelay: 0.18,
  shotSpeed: 7.6,
  shotMinSec: 0.16,
  shotMaxSec: 0.44,
  shotArc: 0.02,
  wallSpinPeriod: 22,
  /** Swipe: degrees of field yaw/pitch per screen pixel. */
  wallSpinDragDeg: 0.38,

  wallCols: 28,
  wallRows: 20,
  wallDepth: 4,
  blockStep: 0.38,
  /**
   * Original Voxel_0: mesh extent 0.5, prefab scale 1, grid step 1 (size == spacing).
   * Our clay mesh corners sit at 0.4155, so scale the cube by 0.5/0.4155 to fill that cell.
   */
  blockSize: 0.457,
  wallFrontZ: -2.08,
  slotStandY: 2.88,
  slotStandZ: -1.38,
  slotRowStep: 0.58,
  slotStart: 4,
  slotMax: 6,
  slotRows: 1,
  slotPickR: 0.42,
} as const;

export type PlayViewBand = {
  pinFrac: number;
  ceilFrac: number;
};

/**
 * Look-at Y that puts the turret dock bottom on `pinFrac` of the camera view
 * (0 = bottom). Extra phone height stays above as the sculpture field.
 */
export function playCamLookAtY(pinFrac: number): number {
  const pitch = (GAME.worldCamPitchDeg * Math.PI) / 180;
  const py = benchSeatY() + STAGE.dockPinY;
  const pz = benchSeatZ(BENCH.rows - 1) + STAGE.dockPinZ;
  const t = Math.min(0.42, Math.max(0.05, pinFrac));
  const targetCamY = GAME.worldCamOrthoHeight * (2 * t - 1);
  return py - (targetCamY + (pz - GAME.worldCamLookAtZ) * Math.sin(pitch)) / Math.cos(pitch);
}

/** Camera-view fraction (0 = bottom) of a world point under the play ortho camera. */
export function viewFracOfWorld(py: number, pz: number, lookY: number): number {
  const pitch = (GAME.worldCamPitchDeg * Math.PI) / 180;
  const camY = (py - lookY) * Math.cos(pitch) - (pz - GAME.worldCamLookAtZ) * Math.sin(pitch);
  return (camY / GAME.worldCamOrthoHeight + 1) * 0.5;
}

/** World Y at `pz` that lands on camera-view fraction `frac`. */
export function worldYAtViewFrac(frac: number, pz: number, lookY: number): number {
  const pitch = (GAME.worldCamPitchDeg * Math.PI) / 180;
  const camY = GAME.worldCamOrthoHeight * (2 * frac - 1);
  return lookY + (camY + (pz - GAME.worldCamLookAtZ) * Math.sin(pitch)) / Math.cos(pitch);
}

export const PLAY = {
  levelId: 1,
  wallCols: GAME.wallCols,
  wallRows: GAME.wallRows,
  wallDepth: GAME.wallDepth,
  blockStep: GAME.blockStep,
  blockSize: GAME.blockSize,
  wallBaseY: 3.2,
  slotStandY: 2.88,
  benchStandY: 2.10,
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
  tints: {} as Partial<Record<ColorToken, readonly [number, number, number]>>,
  fieldYawDeg: 0,
};

/** World box that stays inside the fixed play camera (28x20 @ ~0.19). */
const WALL_SAFE_HALF_W = 2.85;
/** World Y the play camera can still see; a peeking brick still counts. */
export let VIEW_Y_MIN = 0.95;
export let VIEW_Y_MAX = 8.6;
const BLOCK_SIZE_RATIO = GAME.blockSize / GAME.blockStep;

/**
 * One play-stage. `liftY` moves sculpture, pits, and bench together.
 * Short models drop until their occupied bottom sits `sculptureGap` above the pits.
 */
export const STAGE = {
  liftY: 0.55,
  sculptureY: 5.35,
  /** World gap from pit stand to the lowest occupied brick. */
  sculptureGap: 0.32,
  /** Turret / slot pad height used to keep the model above the pit row. */
  slotClearance: 0.62,
  /** Extra camera-view fraction above the pit row before the model floor. */
  modelFloorPad: 0.014,
  slotY: GAME.slotStandY,
  benchY: 2.10,
  /** Last bench row → on-screen dock bottom (slightly below seat, toward camera). */
  dockPinY: -0.06,
  dockPinZ: 0.30,
} as const;

/** Shrink step/size, then sit the sculpture in the camera band above the pits. */
export function fitPlayLayout(
  cols: number,
  rows: number,
  depth = 1,
  occMin = 0,
  occMax = -1,
  view: PlayViewBand = { pinFrac: 0.14, ceilFrac: 0.92 },
): void {
  const spanX = Math.max(1, cols - 1 + BLOCK_SIZE_RATIO);
  const spanZ = Math.max(1, depth - 1 + BLOCK_SIZE_RATIO);
  const lift = STAGE.liftY;
  PLAY.slotStandY = STAGE.slotY + lift;
  PLAY.benchStandY = STAGE.benchY + lift;
  const y0 = Math.max(0, Math.min(Math.max(0, rows - 1), occMin));
  const y1 = occMax >= y0 ? Math.min(Math.max(0, rows - 1), occMax) : Math.max(0, rows - 1);
  const occSpan = Math.max(1, y1 - y0 + BLOCK_SIZE_RATIO);

  let step = Math.min(GAME.blockStep, (2 * WALL_SAFE_HALF_W) / spanX, 3.2 / spanZ);
  const applyStep = (s: number): { floorY: number; ceilY: number } => {
    PLAY.blockStep = s;
    PLAY.blockSize = s * BLOCK_SIZE_RATIO;
    const lookY = playCamLookAtY(view.pinFrac);
    const frontZ = voxelFrontZ();
    const backZ = frontZ - Math.max(0, depth - 1) * s;
    const slotTop = viewFracOfWorld(
      PLAY.slotStandY + STAGE.slotClearance,
      shooterStandZ(),
      lookY,
    );
    const floorY = Math.max(
      PLAY.slotStandY + STAGE.sculptureGap,
      worldYAtViewFrac(slotTop + STAGE.modelFloorPad, frontZ, lookY),
    );
    const ceilY = Math.max(floorY + 0.8, worldYAtViewFrac(view.ceilFrac, backZ, lookY));
    return { floorY, ceilY };
  };

  let band = applyStep(step);
  step = Math.min(step, (band.ceilY - band.floorY) / occSpan);
  band = applyStep(step);

  const half = PLAY.blockSize * 0.5;
  const mid = (band.floorY + band.ceilY) * 0.5;
  let base = mid - (y0 + y1) * step * 0.5;
  const top = base + y1 * step + half;
  if (top > band.ceilY) base -= top - band.ceilY;
  const bottom = base + y0 * step - half;
  if (bottom < band.floorY) base += band.floorY - bottom;
  PLAY.wallBaseY = base;
  VIEW_Y_MIN = band.floorY - half;
  VIEW_Y_MAX = band.ceilY + half;
}

export function slotSpacing(_count: number): number {
  return 0.78;
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

export function slotY(_index?: number): number {
  return PLAY.slotStandY;
}

/** Camera-facing face of the voxel volume (world Z, before Field spin). */
export function voxelFrontZ(): number {
  const step = PLAY.blockStep;
  return GAME.worldCamLookAtZ + Math.max(0, PLAY.wallDepth - 1) * step * 0.5 + PLAY.blockSize * 0.5;
}

/** Turrets sit in front of that face, same as the original foreground guns. */
export function shooterStandZ(): number {
  return voxelFrontZ() + 0.48;
}

export function slotZ(index: number): number {
  return shooterStandZ() + slotRowOf(index) * GAME.slotRowStep;
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
  rows: 4,
  /** Same as slotSpacing so each column sits under a turret. */
  stepX: 0.78,
  stepZ: 1.52,
  /** First bench row sits below the pads, not on them. */
  frontGap: 0.82,
  startZ: 0.50,
  standY: 2.10,
} as const;

export function benchSeatY(): number {
  return PLAY.benchStandY;
}

export function benchColOf(index: number): number {
  return index % BENCH.cols;
}

export function benchRankOf(index: number): number {
  return Math.floor(index / BENCH.cols);
}

export function benchSeatX(col: number): number {
  const side = (GAME.slotMax - GAME.slotStart) >> 1;
  return slotX(side + col);
}

export function benchSeatZ(rank: number): number {
  return shooterStandZ() + BENCH.frontGap + rank * BENCH.stepZ;
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

/** Official ColorLibrary id each token stands for. */
export const TOKEN_VOXEL_ID: Record<ColorToken, number> = {
  o: 11,
  y: 17,
  c: 2,
  g: 7,
  p: 15,
  v: 12,
  r: 14,
  s: 1,
  k: 22,
  m: 4,
  a: 20,
  d: 10,
};

/** Official M_Pixel _BaseColor for each token. Keep in sync with VoxelPalette LOOK. */
export const TOKEN_RGB: Record<ColorToken, readonly [number, number, number]> = {
  o: [214, 123, 19],
  y: [224, 197, 43],
  c: [17, 183, 214],
  g: [61, 149, 30],
  p: [231, 58, 148],
  v: [113, 52, 226],
  r: [207, 36, 48],
  s: [33, 95, 200],
  k: [236, 99, 136],
  m: [2, 161, 144],
  a: [238, 143, 199],
  d: [195, 175, 113],
};

export function isColorToken(token: string): token is ColorToken {
  return ALL_COLOR_TOKENS.indexOf(token as ColorToken) >= 0;
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

