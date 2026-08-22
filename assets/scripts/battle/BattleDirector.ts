import {
  _decorator,
  Camera,
  Component,
  director,
  EventMouse,
  EventTouch,
  geometry,
  input,
  Input,
  instantiate,
  Node,
  Prefab,
  Quat,
  screen,
  UIOpacity,
  UITransform,
  Vec3,
} from 'cc';
import { gameAudio } from '../audio/AudioService';
import { itemTrayTopFromBottom, uiFromBottomToScreenY, uiVisibleSize } from '../game/ViewFit';
import { playBaozhaBurst, preloadBaozhaBurst } from './BaozhaBurst';
import { playMergeBurst, preloadMergeBurst } from './MergeBurst';
import { playShuaxinBurst, preloadShuaxinBurst } from './ShuaxinBurst';
import { bindPowerLayer } from './PowerMark';
import {
  BENCH,
  ColorId,
  ColorToken,
  benchSeatX,
  benchSeatY,
  benchSeatZ,
  GAME,
  PLAY,
  SPECIAL_SPAN,
  VIEW_Y_MAX,
  VIEW_Y_MIN,
  HOLD_U,
  forSpecialRing,
  holdGlowMask,
  COLOR_COUNT,
  TOKEN_RGB,
  parseColorToken,
  tokenOfColorId,
  wallStartX,
  shooterStandZ,
  slotY,
} from '../game/GameConfig';
import { nearestVoxelId, rgbOfVoxel, voxelsAlias } from '../game/VoxelPalette';
import { attachBrickRenderer, paintUnitColor, readPaintRgb, tickHiddenPattern } from './BrickSpecials';
import type { PlayerWallet } from '../game/PlayerWallet';
import { itemUnlocked, UnitSpec, type ItemId } from '../game/LevelCatalog';
import { activeGuide, completeGuide, guideIdForLevel, isGuideDone, pickGuide, type GuideContext, type GuideView } from '../game/TutorialGuide';
import { SLOT_PAD_TOP, SLOT_UNIT_FWD, SLOT_UNIT_LIFT } from './ToySlotMesh';
import { BlockCell } from './BlockCell';
import { clearDestroyBurst, destroyBurstBusy, playDestroyBurst, tickDestroyBurst } from './DestroyBurst';
import { createInkShot, InkShot, playHitFlash, playMuzzleFlash, warmInkShots } from './InkShot';
import { HintHand } from './HintHand';
import { IronPlate } from './IronPlate';
import { ChestActor } from './ChestActor';
import { applyLockNails, clearLockLook } from './LockNails';
import { SlotPad } from './SlotPad';
import { bindBrickSkin, brickSkinBatched, brickSkinNeedsFlush, clearBrickSkin, coverBrickSkin, flushBrickSkin, popBrickSkin, requestBrickSkinFlush, tickBrickSkin } from './BrickSkin';
import { adoptNodeToActors, bindFieldActors, fieldWorldOf, mountOnFieldActors, restToWorld, setFieldSpin, worldToRest } from './FieldSpin';
import { setBrickMeshEnabled } from './ToyBlockMesh';
import { UnitActor } from './UnitActor';

const { ccclass } = _decorator;

export type { ItemId };
export type ItemHudState = {
  coins: number;
  shuffle: number;
  hook: number;
  shovel: number;
  bomb: number;
  hookPick: boolean;
  shovelPick: boolean;
  bombPick: boolean;
  canShovel: boolean;
};

export type ItemUseFx = {
  id: ItemId;
  world: Vec3 | null;
  onArrive: () => void;
};

const _ray = new geometry.Ray();
const _world = new Vec3();
const _tmp = new Vec3();
const _camP = new Vec3();
const _camLocal = new Vec3();
const _screen = new Vec3();
const UI_MODALS = [
  'FailPanel',
  'VictoryPanel',
  'SettingsPanel',
  'ChestPanel',
  'ItemShopPanel',
  'HomePanel',
  'RankingPanel',
  'UgcHub',
  'UgcHud',
] as const;
const PICK_R2 = 0.38 * 0.38;
const SPIN_THRESH_PX = 8;
const SPIN_FRICTION = 6.2;
const SPIN_BOX_PAD = 0.95;
const SPIN_SCREEN_PAD_PX = 180;
const TURRET_PAD_PX = 28;
const _boxMin = new Vec3();
const _boxMax = new Vec3();
const _spinDq = new Quat();
const _camQ = new Quat();
const _camRight = new Vec3();
const _camUp = new Vec3();
const _spinAxis = new Vec3();
const _faceN = new Vec3();
const _hitLocal = new Vec3();
const _hitDir = new Vec3();
const _hitMin = new Vec3(-0.5, -0.5, -0.5);
const _hitMax = new Vec3(0.5, 0.5, 0.5);
const _hintA = new Vec3();
const _hintB = new Vec3();
const FACE = [
  [1, 0, 0, 1, 0, 0],
  [-1, 0, 0, -1, 0, 0],
  [0, 1, 0, 0, 1, 0],
  [0, -1, 0, 0, -1, 0],
  [0, 0, 1, 0, 0, -1],
  [0, 0, -1, 0, 0, 1],
] as const;
const LOCK_WALK = [[-1, 0], [1, 0], [0, 1], [0, -1]] as const;
const HOLD_SIDES = [[-1, 0], [1, 0], [0, 1]] as const;
/** Renderers built per frame for bricks still waiting inside the sculpture. */
const MESH_WARM_PER_FRAME = 8;
/** Cap the walk too, or a mostly-warmed backlog costs a long scan for nothing. */
const MESH_WARM_SCAN = 96;
const EMPTY_BLOCKS: readonly BlockCell[] = [];
/** Drag spin changes the vis bucket every frame; aim can lag without players noticing. */
const VIS_SKIP_SPIN = 10;
const VIS_SKIP_REST = 8;

const COLOR_WALK = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
] as const;

function rayHitsAabb(o: Vec3, d: Vec3, min: Vec3, max: Vec3): boolean {
  let tmin = 0;
  let tmax = 1e6;
  for (let i = 0; i < 3; i++) {
    const orig = i === 0 ? o.x : i === 1 ? o.y : o.z;
    const dir = i === 0 ? d.x : i === 1 ? d.y : d.z;
    const lo = i === 0 ? min.x : i === 1 ? min.y : min.z;
    const hi = i === 0 ? max.x : i === 1 ? max.y : max.z;
    if (Math.abs(dir) < 1e-8) {
      if (orig < lo || orig > hi) return false;
      continue;
    }
    let t1 = (lo - orig) / dir;
    let t2 = (hi - orig) / dir;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  return tmax >= 0;
}

function rayHitAabbAt(o: Vec3, d: Vec3, min: Vec3, max: Vec3, out: Vec3): boolean {
  let tmin = 0;
  let tmax = 1e6;
  for (let i = 0; i < 3; i++) {
    const orig = i === 0 ? o.x : i === 1 ? o.y : o.z;
    const dir = i === 0 ? d.x : i === 1 ? d.y : d.z;
    const lo = i === 0 ? min.x : i === 1 ? min.y : min.z;
    const hi = i === 0 ? max.x : i === 1 ? max.y : max.z;
    if (Math.abs(dir) < 1e-8) {
      if (orig < lo || orig > hi) return false;
      continue;
    }
    let t1 = (lo - orig) / dir;
    let t2 = (hi - orig) / dir;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  if (tmax < 0) return false;
  const t = Math.max(0, tmin);
  out.set(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t);
  return true;
}

type PointerEvt = EventTouch | EventMouse;

function setBrickDrawn(cell: BlockCell, on: boolean): void {
  cell.buried = !on;
  if (on && cell.meshless) {
    if (brickSkinBatched() || attachBrickRenderer(cell.node, cell.voxelId)) {
      cell.meshless = false;
    }
  }
  setBrickMeshEnabled(cell.node, on);
}

function pullFrom(list: BlockCell[] | undefined, block: BlockCell): void {
  if (!list) return;
  const i = list.indexOf(block);
  if (i >= 0) {
    list[i] = list[list.length - 1];
    list.pop();
  }
}

function rayPointDistSq(ray: geometry.Ray, p: Vec3): number {
  const ox = p.x - ray.o.x;
  const oy = p.y - ray.o.y;
  const oz = p.z - ray.o.z;
  const t = Math.max(0, ox * ray.d.x + oy * ray.d.y + oz * ray.d.z);
  const dx = ray.o.x + ray.d.x * t - p.x;
  const dy = ray.o.y + ray.d.y * t - p.y;
  const dz = ray.o.z + ray.d.z * t - p.z;
  return dx * dx + dy * dy + dz * dz;
}

@ccclass('BattleDirector')
export class BattleDirector extends Component {
  private _cam: Camera | null = null;
  private _canvas: Node | null = null;
  private _playing = false;
  private _won = false;
  private _lost = false;
  private readonly _blocks: BlockCell[] = [];
  private readonly _units: UnitActor[] = [];
  private readonly _slots: SlotPad[] = [];
  private readonly _shots: InkShot[] = [];
  private _flyRoot: Node | null = null;
  private _fromTouch = false;
  private readonly _byCol: BlockCell[][] = [];
  private readonly _byRow: BlockCell[][] = [];
  /** Dense occupancy: layer * layerStride + row * cols + col. */
  private _grid: (BlockCell | null)[] = [];
  private _gCols = 0;
  private _gRows = 0;
  private _gLayers = 0;
  private _gRowStride = 0;
  private _gLayerStride = 0;
  /** Unburied bricks. Spin rebuilds scan this instead of the whole sculpture. */
  private readonly _shell: BlockCell[] = [];
  private readonly _vis = new Set<BlockCell>();
  private readonly _visList: BlockCell[] = [];
  private readonly _visByRgb = new Map<number, BlockCell[]>();
  private readonly _visByColor = new Map<number, BlockCell[]>();
  private readonly _visScratch: BlockCell[] = [];
  private readonly _visPatch: BlockCell[] = [];
  private _visKey = 0x7fffffff;
  private _visGen = 0;
  private _needHoldRefresh = false;
  private _visDirty = true;
  private _visSkip = 0;
  private _unstickT = 0;
  private _hintT = 0;
  private readonly _incoming = new Set<BlockCell>();
  private readonly _idVoxel = new Int16Array(COLOR_COUNT).fill(-2);
  private _shotStuck = 0;
  private readonly _raftBricks: BlockCell[] = [];
  private readonly _aimBest = new Map<UnitActor, BlockCell>();
  private _aimVisKey = 0x7fffffff;
  private _uiHits: Node[] = [];
  private readonly _lockSeen = new Set<BlockCell>();
  private readonly _lockGroup: BlockCell[] = [];
  private readonly _lockStack: BlockCell[] = [];
  private readonly _bombGroup: BlockCell[] = [];
  private readonly _bombStack: BlockCell[] = [];
  private readonly _bombSeen = new Set<BlockCell>();
  private readonly _meshless: BlockCell[] = [];
  private _meshCursor = 0;
  private readonly _onShotLand = (shot: InkShot): void => {
    this._landShot(shot);
  };
  private _stuckT = 0;
  private _sw = 1;
  private _sh = 1;
  private _remain = 0;
  private _unitPfs: Record<string, Prefab> = Object.create(null);
  private _reserve: UnitSpec[] = [];
  private _bench: Node | null = null;
  private _nextUnitIndex = 0;
  private _cols = PLAY.wallCols;
  private _onWin: (() => void) | null = null;
  private _onLose: (() => void) | null = null;
  private _onItems: ((state: ItemHudState) => void) | null = null;
  private _onGuide: ((guide: GuideView | null) => void) | null = null;
  private _guideKey = '';
  private _lastGuide: GuideView | null = null;
  private _itemsReady = true;
  private readonly _guideCtx: GuideContext = {
    hookPick: false,
    shovelPick: false,
    bombPick: false,
    canShuffle: false,
    hasRear: false,
    canShovel: false,
    canBomb: false,
    itemsReady: true,
  };
  private _onGoldDenied: (() => void) | null = null;
  private _wallet: PlayerWallet | null = null;
  private _hookPick = false;
  private _shovelPick = false;
  private _bombPick = false;
  private _canShovelHud = false;
  private _hint: HintHand | null = null;
  private readonly _plates: IronPlate[] = [];
  private _ironRows: number[] = [];
  private readonly _ironGaps = new Set<number>();
  private readonly _openRows = new Set<number>();
  private _platesOpen = false;
  private _platesBreaking = false;
  private _breakingRow = -1;
  private _plateBreakT = 0;
  private readonly _sandCols = new Set<number>();
  private readonly _rescues: UnitActor[] = [];
  private readonly _chests: ChestActor[] = [];
  private readonly _chestQueue: ChestActor[] = [];
  private _chestBusy = false;
  private _onChest: ((chest: ChestActor) => void) | null = null;
  private _onUnlockSlot: ((slot: SlotPad) => void) | null = null;
  private _onItemUseFx: ((req: ItemUseFx) => void) | null = null;
  private _itemFxBusy = false;
  private _fxHoldUnit: UnitActor | null = null;
  private _fxHoldSlot: SlotPad | null = null;
  private _raft: Node | null = null;
  private _raftCarry: Node | null = null;
  private _raftShift = 0;
  private _raftT = 0;
  private _frontDirty = true;
  private readonly _frontByCol: (UnitActor | null)[] = [];
  private _wall: Node | null = null;
  private _platesRoot: Node | null = null;
  private _field: Node | null = null;
  private _fieldActors: Node | null = null;
  private _fieldCy = 0;
  private _fieldCz = 0;
  private readonly _spinRot = new Quat();
  private _spinVel = 0;
  private _pitchVel = 0;
  private _ptrDown = false;
  private _dragSpin = false;
  private _spinning = false;
  private _dragStartX = 0;
  private _dragStartY = 0;
  private _dragLastX = 0;
  private _dragLastY = 0;
  private _winSettle = 0;
  private _lookDirty = true;
  private _nudgeCool = 0;
  private _autoPlacing = false;
  private readonly _posedRot = new Quat(NaN, NaN, NaN, NaN);

  armSpawn(
    unitPfs: Record<string, Prefab>,
    reserve: ReadonlyArray<UnitSpec> = [],
  ): void {
    this._unitPfs = unitPfs;
    this._reserve = reserve.slice();
  }

  bind(opts: {
    camera: Camera;
    canvas: Node;
    onWin?: () => void;
    onLose?: () => void;
    onItems?: (state: ItemHudState) => void;
    onGuide?: (guide: GuideView | null) => void;
    onGoldDenied?: () => void;
    onChest?: (chest: ChestActor) => void;
    onUnlockSlot?: (slot: SlotPad) => void;
    onItemUseFx?: (req: ItemUseFx) => void;
    wallet?: PlayerWallet;
  }): void {
    this._cam = opts.camera;
    this._canvas = opts.canvas;
    bindPowerLayer(opts.canvas);
    this._onWin = opts.onWin ?? null;
    this._onLose = opts.onLose ?? null;
    this._onItems = opts.onItems ?? null;
    this._onGuide = opts.onGuide ?? null;
    this._guideKey = '*';
    this._lastGuide = null;
    this._itemsReady = true;
    this._itemFxBusy = false;
    this._clearFxHold();
    this._onGoldDenied = opts.onGoldDenied ?? null;
    this._onChest = opts.onChest ?? null;
    this._onUnlockSlot = opts.onUnlockSlot ?? null;
    this._onItemUseFx = opts.onItemUseFx ?? null;
    this._wallet = opts.wallet ?? null;
    this._won = false;
    this._lost = false;
    this._collect();
    this._bindUiHits();
    this._bindTouch();
    this.setPlaying(false);
    void preloadMergeBurst();
    void preloadShuaxinBurst();
    void preloadBaozhaBurst();
  }

  setItemsReady(on: boolean): void {
    if (this._itemsReady === on) return;
    this._itemsReady = on;
    this._guideKey = '*';
    this._hintT = 1;
  }

  setPlaying(on: boolean): void {
    this._playing = on;
    UnitActor.animLive = on;
    const units = this._units;
    if (!units) return;
    for (const u of units) u.setPowerVisible(on);
    if (!on && (this._hookPick || this._shovelPick || this._bombPick)) {
      this._clearPicks();
      this._emitItems();
    }
  }

  forceWin(): void {
    if (this._won || this._lost) return;
    this._won = true;
    this._onWin?.();
  }

  forceLose(): void {
    if (this._won || this._lost) return;
    this._lost = true;
    this._onLose?.();
  }

  onDestroy(): void {
    this._resetDock();
    this._unbindTouch();
    bindFieldActors(null);
    clearBrickSkin();
    clearDestroyBurst();
  }

  /** Tray stays at the origin; the field owns spin. */
  parkView(): void {
    this._resetDock();
    this._posedRot.set(NaN, NaN, NaN, NaN);
  }

  reposeView(): void {
    this.parkView();
  }

  update(dt: number): void {
    this._unstickT += dt;
    if (this._unstickT >= 0.12) {
      this._unstickT = 0;
      this._unstickCombat();
    }
    this._tickShots(dt);
    BlockCell.tickMotion(dt);
    tickDestroyBurst(dt);
    this._fireUnits(dt);
    this._tickField(dt);
    tickHiddenPattern(dt);
    this._tickRaft(dt);
    if (this._nudgeCool > 0) this._nudgeCool -= dt;
    this._tickCombat(dt);
    this._refreshPlates(dt);
    this._syncHint(dt);
    this._warmBuriedMeshes();
    if (brickSkinNeedsFlush()) this._flushSkin();
    else tickBrickSkin();
  }

  /**
   * Deep interiors hang an empty renderer at build. Assign the shared cube a few
   * at a time so peeling a layer does not rebuild a pile of models in one frame.
   */
  private _warmBuriedMeshes(): void {
    if (brickSkinBatched()) return;
    const list = this._meshless;
    let budget = MESH_WARM_PER_FRAME;
    let scan = MESH_WARM_SCAN;
    while (budget > 0 && scan > 0 && this._meshCursor < list.length) {
      const b = list[this._meshCursor];
      this._meshCursor += 1;
      scan -= 1;
      if (!b?.isValid || !b.meshless || !b.node.active) continue;
      if (!attachBrickRenderer(b.node, b.voxelId)) break;
      b.meshless = false;
      budget -= 1;
    }
    if (this._meshCursor >= list.length && list.length) {
      list.length = 0;
      this._meshCursor = 0;
    }
  }

  private _tickShots(dt: number): void {
    for (let i = 0; i < this._shots.length; i++) {
      const s = this._shots[i];
      if (s.busy) s.advance(dt);
    }
  }

  private _unstickCombat(): void {
    if (this._won || this._lost) return;
    if (this._units.length === 0 || this._blocks.length === 0) return;
    if (this.node.activeInHierarchy && !this._playing) this._playing = true;
    let flying = 0;
    let moving = 0;
    const incoming = this._incoming;
    incoming.clear();
    for (let i = 0; i < this._shots.length; i++) {
      const s = this._shots[i];
      if (!s.busy) continue;
      const block = s.landBlock as BlockCell | null;
      if (block) incoming.add(block);
      flying += 1;
      if (s.progress > 0.01) moving += 1;
    }
    if (flying && moving === 0) {
      this._shotStuck += 1;
      if (this._shotStuck >= 2) {
        for (let i = 0; i < this._shots.length; i++) {
          if (this._shots[i].busy) this._shots[i].forceLand();
        }
        this._shotStuck = 0;
      }
    } else {
      this._shotStuck = 0;
    }
    if (flying === 0) {
      for (let i = 0; i < this._units.length; i++) {
        if (this._units[i].inflight) this._units[i].inflight = 0;
      }
    }
    let freed = 0;
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
      if (!b.claimed || incoming.has(b)) continue;
      b.releaseClaim();
      freed += 1;
    }
    if (freed) this._indexBlocks();
  }

  private _collect(): void {
    this.parkView();
    this._blocks.length = 0;
    this._units.length = 0;
    this._aimBest.clear();
    this._raftBricks.length = 0;
    this._raftCarry = null;
    this._raftShift = 0;
    this._frontDirty = true;
    this._frontByCol.length = 0;
    this._slots.length = 0;
    this._shots.length = 0;
    this._plates.length = 0;
    this._ironRows = (PLAY.ironRows ?? []).slice().sort((a, b) => a - b);
    this._ironGaps.clear();
    for (const col of PLAY.ironGaps ?? []) this._ironGaps.add(col);
    this._openRows.clear();
    this._platesOpen = this._ironRows.length === 0;
    this._platesBreaking = false;
    this._breakingRow = -1;
    this._plateBreakT = 0;
    this._sandCols.clear();
    for (const col of PLAY.sandCols ?? []) this._sandCols.add(col);
    this._rescues.length = 0;
    this._chests.length = 0;
    this._chestQueue.length = 0;
    this._chestBusy = false;
    this._raftT = 0;
    Quat.fromAxisAngle(this._spinRot, Vec3.UNIT_Y, (PLAY.fieldYawDeg * Math.PI) / 180);
    this._spinVel = 0;
    this._pitchVel = 0;
    this._ptrDown = false;
    this._dragSpin = false;
    this._spinning = false;
    this._winSettle = 0;
    this._bindField();
    const wall = this._wall;
    const bench = this.node.getChildByName('Bench');
    const slots = this.node.getChildByName('Slots');
    const leftoverPool = this.node.getChildByName('DebrisPool');
    if (leftoverPool) leftoverPool.active = false;
    wall?.children.forEach((n) => {
      if (n.name === 'BrickSkins' || n.name === 'RaftCarry') return;
      if (n.name.startsWith('Chest_')) {
        const c = n.getComponent(ChestActor) ?? n.addComponent(ChestActor);
        c.syncFromName();
        c.trapped = true;
        this._chests.push(c);
        return;
      }
      if (n.name.startsWith('Rescue_')) {
        const u = n.getComponent(UnitActor);
        if (!u) return;
        u.syncFromName();
        u.trapped = true;
        this._rescues.push(u);
        this._units.push(u);
        return;
      }
      const c = n.getComponent(BlockCell) ?? n.addComponent(BlockCell);
      c.syncFromName();
      this._blocks.push(c);
    });
    for (let i = 0; i < this._chests.length; i++) adoptNodeToActors(this._chests[i].node);
    for (let i = 0; i < this._rescues.length; i++) adoptNodeToActors(this._rescues[i].node);
    for (let i = 0; i < this._blocks.length; i++) {
      const brick = this._blocks[i].node;
      const nails = brick.getChildByName('LockNails');
      if (!nails) continue;
      brick.getWorldPosition(_tmp);
      mountOnFieldActors(nails, _tmp);
    }
    bench?.children.forEach((n) => {
      const c = n.getComponent(UnitActor) ?? n.addComponent(UnitActor);
      c.syncFromName();
      c.applySpecialLook();
      this._units.push(c);
    });
    slots?.children.forEach((n) => {
      const c = n.getComponent(SlotPad) ?? n.addComponent(SlotPad);
      this._slots.push(c);
    });
    this._platesRoot?.children.forEach((n) => {
      const p = n.getComponent(IronPlate) ?? n.addComponent(IronPlate);
      p.syncFromName();
      this._plates.push(p);
    });
    this._flyRoot = this.node.getChildByName('FlyRoot');
    this._flyRoot?.children.forEach((n) => {
      if (!n.name.startsWith('Shot_')) return;
      const s = n.getComponent(InkShot) ?? n.addComponent(InkShot);
      n.active = false;
      this._shots.push(s);
    });
    const fly = this._flyRoot;
    const need = 4 - this._shots.length;
    if (fly && need > 0) {
      const extra = warmInkShots(fly, need);
      for (let i = 0; i < extra.length; i++) this._shots.push(extra[i]);
    }
    this._canvas?.getChildByName('PlayHud')?.getChildByName('HintHand')?.getComponent(HintHand)?.hide();
    this._hint = this._ensureWorldHint();
    this._emitGuide(null);
    this._hint?.hide();
    this._slots.sort((a, b) => a.index - b.index);
    this._units.sort((a, b) => a.index - b.index);
    this._bench = bench;
    this._nextUnitIndex = 0;
    for (const u of this._units) {
      u.inflight = 0;
      u.suckWait = 0;
      if (u.index >= this._nextUnitIndex) this._nextUnitIndex = u.index + 1;
    }
    this._indexBlocks();
    this._mountRaftCarry();
    this._poseFieldSpin();
    this._lookDirty = true;
    this._needHoldRefresh = false;
    this._stuckT = 0;
    this._unstickT = 0;
    this._hintT = 0;
    this._incoming.clear();
    this._idVoxel.fill(-2);
    this._shotStuck = 0;
    this._nudgeCool = 0;
    this._refreshLocks();
    this._placeRaft(0);
    this._refreshPlateGray();
    this._refreshRescues();
    this._refreshChests();
    this._resetItems();
  }

  claimChest(chest: ChestActor): void {
    chest.dismiss();
    this._chestBusy = false;
    this._flushChest();
    if (!this._chestBusy) this.setPlaying(true);
  }

  itemState(): ItemHudState {
    return {
      coins: this._wallet?.coins ?? 0,
      shuffle: this._wallet?.itemCount('shuffle') ?? 0,
      hook: this._wallet?.itemCount('hook') ?? 0,
      shovel: this._wallet?.itemCount('shovel') ?? 0,
      bomb: this._wallet?.itemCount('bomb') ?? 0,
      hookPick: this._hookPick,
      shovelPick: this._shovelPick,
      bombPick: this._bombPick,
      canShovel: this._canShovel(),
    };
  }

  useItem(id: ItemId): boolean {
    if (!this._playing || this._won || this._lost) return false;
    if (this._itemFxBusy || !this._itemsReady) {
      this._emitItems();
      return false;
    }
    if (this._lastGuide?.phase === 'icon' && this._lastGuide.item && this._lastGuide.item !== id) {
      this._emitItems();
      return false;
    }
    if (!itemUnlocked(id, PLAY.levelId)) {
      this._emitItems();
      return false;
    }
    if (id !== 'hook' && this._hookPick) this._hookPick = false;
    if (id !== 'shovel' && this._shovelPick) this._shovelPick = false;
    if (id !== 'bomb' && this._bombPick) this._bombPick = false;
    if (id === 'shuffle') {
      if (!this._afford('shuffle')) {
        this._emitItems();
        return false;
      }
      if (!this._canShuffle()) {
        this._emitItems();
        return false;
      }
      this._commitItemFx('shuffle', null, () => {
        this._shuffleBench();
      });
      return true;
    }
    if (id === 'hook') {
      if (!this._afford('hook')) {
        this._emitItems();
        return false;
      }
      if (this._hookPick) {
        this._hookPick = false;
        this._emitItems();
        this._kickGuide();
        return true;
      }
      if (!this._hasRearBench()) {
        this._emitItems();
        return false;
      }
      this._hookPick = true;
      this._emitItems();
      this._kickGuide();
      return true;
    }
    if (id === 'shovel') {
      if (!this._afford('shovel')) {
        this._emitItems();
        return false;
      }
      if (this._shovelPick) {
        this._shovelPick = false;
        this._emitItems();
        this._kickGuide();
        return true;
      }
      if (!this._canShovel()) {
        this._emitItems();
        return false;
      }
      this._shovelPick = true;
      this._emitItems();
      this._kickGuide();
      return true;
    }
    if (id === 'bomb') {
      if (!this._afford('bomb')) {
        this._emitItems();
        return false;
      }
      if (this._bombPick) {
        this._bombPick = false;
        this._emitItems();
        this._kickGuide();
        return true;
      }
      if (!this._canBomb()) {
        this._emitItems();
        return false;
      }
      this._bombPick = true;
      this._emitItems();
      this._kickGuide();
      return true;
    }
    this._emitItems();
    return false;
  }

  private _canHookUnit(u: UnitActor): boolean {
    return u.onBench && !u.traveling && u !== this._fxHoldUnit && !this._isColFront(u);
  }

  /** Plant the item on the visible face of the clicked turret. */
  private _unitItemLand(u: UnitActor, out: Vec3): Vec3 {
    u.node.getWorldPosition(out);
    const cam = this._cam;
    if (!cam?.node?.isValid) return out;
    cam.node.getWorldPosition(_camP);
    const dx = _camP.x - out.x;
    const dy = _camP.y - out.y;
    const dz = _camP.z - out.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    out.x += (dx / len) * 0.16;
    out.y += (dy / len) * 0.06;
    out.z += (dz / len) * 0.16;
    return out;
  }

  private _hasRearBench(): boolean {
    for (const u of this._units) {
      if (this._canHookUnit(u)) return true;
    }
    return false;
  }

  private _canShovel(): boolean {
    if (!this._bench) return false;
    for (const s of this._slots) {
      const u = s.occupant;
      if (!s.empty && u?.node?.isValid && u.node.active) return true;
    }
    return false;
  }

  private _syncShovelHud(): void {
    const can = this._canShovel();
    if (this._shovelPick && !can) {
      this._shovelPick = false;
      this._canShovelHud = can;
      this._emitItems();
      this._kickGuide();
      return;
    }
    if (can === this._canShovelHud) return;
    this._canShovelHud = can;
    this._emitItems();
  }

  /** Shortest column’s next seat. Rank may exceed the visible rows — overflow is data-only. */
  private _shortestBenchSeat(): { col: number; rank: number } {
    let bestCol = 0;
    let bestN = 1e9;
    for (let c = 0; c < BENCH.cols; c++) {
      let n = 0;
      for (const o of this._units) {
        if (!o.node.active || o.trapped) continue;
        if (o.state !== 'bench' && o.state !== 'drag') continue;
        if (o.benchCol === c) n += 1;
      }
      if (n < bestN) {
        bestN = n;
        bestCol = c;
      }
    }
    return { col: bestCol, rank: bestN };
  }

  private _ensureWorldHint(): HintHand | null {
    let n = this.node.getChildByName('HintHand');
    if (!n) {
      n = new Node('HintHand');
      n.active = false;
      this.node.addChild(n);
    }
    const hint = n.getComponent(HintHand) ?? n.addComponent(HintHand);
    hint.bindCamera(this._cam);
    hint.hide();
    return hint;
  }

  private _syncHint(dt: number): void {
    if (!this._playing || this._won || this._lost || this._itemFxBusy) {
      this._emitGuide(null);
      this._hint?.hide();
      return;
    }
    const guideId = guideIdForLevel(PLAY.levelId);
    const teaching = !!guideId && !isGuideDone(guideId);
    if (!teaching && !this._hookPick && !this._shovelPick && !this._bombPick) {
      this._emitGuide(null);
      this._hint?.hide();
      return;
    }
    this._hintT += dt;
    const moving = this._spinning || this._spinVel !== 0 || this._pitchVel !== 0;
    // The four can* probes each walk the bench or the wall, so keep them off
    // every frame even while the field is turning.
    if (this._hintT < (moving ? 0.03 : 0.08) && this._guideKey) {
      return;
    }
    this._hintT = 0;
    const ctx = this._guideCtx;
    ctx.hookPick = this._hookPick;
    ctx.shovelPick = this._shovelPick;
    ctx.bombPick = this._bombPick;
    ctx.canShuffle = this._canShuffle();
    ctx.hasRear = this._hasRearBench();
    ctx.canShovel = this._canShovel();
    ctx.canBomb = this._canBomb();
    ctx.itemsReady = this._itemsReady;
    const guide = activeGuide(PLAY.levelId, ctx) ?? pickGuide(ctx);
    this._emitGuide(guide);
    const hint = this._hint;
    if (!hint || !guide || guide.phase === 'icon' || !teaching) {
      hint?.hide();
      return;
    }
    hint.bindCamera(this._cam);
    if (guide.id === 'spin') {
      this._placeSpinHint(hint);
      return;
    }
    if (guide.id === 'hook' && guide.phase === 'target') {
      const rear = this._guideRearUnit();
      if (rear) this._placeTapHint(hint, rear.node, 0.02, 0.06);
      else hint.hide();
      return;
    }
    if (guide.id === 'shovel' && guide.phase === 'world') {
      const idle = this._guideIdleFrontUnit();
      if (idle) this._placeTapHint(hint, idle.node, 0.02, 0.06);
      else hint.hide();
      return;
    }
    if (guide.id === 'shovel' && guide.phase === 'target') {
      const unit = this._guideSlotUnit();
      if (unit) this._placeTapHint(hint, unit.node, 0.18, 0.04);
      else hint.hide();
      return;
    }
    if (guide.id === 'bomb' && guide.phase === 'target') {
      const brick = this._guideBrick();
      if (brick) this._placeTapHint(hint, brick.node, 0, 0.02);
      else hint.hide();
      return;
    }
    const unit = this._guideFrontUnit();
    if (unit) this._placeTapHint(hint, unit.node, 0.02, 0.06);
    else hint.hide();
  }

  private _emitGuide(guide: GuideView | null): void {
    this._lastGuide = guide;
    const key = guide ? `${guide.id}:${guide.phase}:${guide.tip}` : '';
    if (key === this._guideKey) return;
    this._guideKey = key;
    this._onGuide?.(guide);
  }

  private _guideBlocksWorld(): boolean {
    if (!this._itemsReady) return true;
    return this._lastGuide?.phase === 'icon';
  }

  private _guideKeepPick(): boolean {
    const id = guideIdForLevel(PLAY.levelId);
    return !!id && !isGuideDone(id) && this._lastGuide?.phase === 'target';
  }

  private _placeTapHint(hint: HintHand, node: Node, liftY: number, liftZ: number): void {
    node.getWorldPosition(_hintA);
    _hintA.y += liftY;
    _hintA.z += liftZ;
    hint.placeWorld(_hintA, _hintA);
  }

  private _placeSpinHint(hint: HintHand): void {
    const field = this._field;
    if (!field) {
      hint.hide();
      return;
    }
    field.getWorldPosition(_hintA);
    this._camSpinAxes(_camRight, _camUp);
    const span = 1.35;
    _hintB.set(
      _hintA.x + _camRight.x * span,
      _hintA.y + 0.08,
      _hintA.z + _camRight.z * span,
    );
    _hintA.set(
      _hintA.x - _camRight.x * span,
      _hintA.y + 0.08,
      _hintA.z - _camRight.z * span,
    );
    hint.placeWorld(_hintA, _hintB);
  }

  private _teachingShovel(): boolean {
    return guideIdForLevel(PLAY.levelId) === 'shovel' && !isGuideDone('shovel');
  }

  private _guideFrontUnit(): UnitActor | null {
    this._ensureVis();
    for (const u of this._units) {
      if (!u.usable || u.state !== 'bench' || !this._isColFront(u)) continue;
      if (this._canNowAbsorb(u)) return u;
    }
    return null;
  }

  /** Front bench unit with the fewest currently exposed matches. */
  private _guideIdleFrontUnit(): UnitActor | null {
    this._visDirty = true;
    this._ensureVis();
    if (this._visList.length <= 0) return null;
    let best: UnitActor | null = null;
    let bestN = 1e9;
    for (const u of this._units) {
      if (!u.usable || u.state !== 'bench' || !this._isColFront(u)) continue;
      if (!this._hintSlot(u)) continue;
      const n = this._visHitCount(u);
      if (n < bestN) {
        bestN = n;
        best = u;
      }
    }
    return best;
  }

  private _visHitCount(u: UnitActor): number {
    let n = 0;
    const list = this._visHits(u);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.suckable || !this._sameColor(b, u) || this._plateBlocks(b.row, b.col)) continue;
      n += 1;
    }
    return n;
  }

  private _visRgbKey(colorId: number, voxelId: number): number {
    const id = voxelId >= 0 ? voxelId : this._voxelOfColorId(colorId);
    if (id >= 0) {
      const rgb = rgbOfVoxel(id);
      return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
    }
    return (colorId + 0x1000000) | 0;
  }

  private _visHits(u: UnitActor): readonly BlockCell[] {
    const byRgb = this._visByRgb.get(this._visRgbKey(u.colorId, this._unitVoxel(u)));
    const byColor = this._visByColor.get(u.colorId);
    const scratch = this._visScratch;
    scratch.length = 0;
    const take = (list: readonly BlockCell[] | undefined): void => {
      if (!list) return;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b && this._sameColor(b, u)) scratch.push(b);
      }
    };
    take(byRgb);
    if (byColor && byColor !== byRgb) take(byColor);
    if (scratch.length) return scratch;
    take(this._visList);
    return scratch.length ? scratch : EMPTY_BLOCKS;
  }

  /** Camera-facing same-color shell. */
  private _shellHits(u: UnitActor): readonly BlockCell[] {
    return this._colorHits(u, true);
  }

  /** Surface same-color bricks, even if the vis bucket / camera test missed. */
  private _looseHits(u: UnitActor): readonly BlockCell[] {
    return this._colorHits(u, false);
  }

  private _colorHits(u: UnitActor, camOnly: boolean): readonly BlockCell[] {
    const shell = this._shell.length ? this._shell : this._blocks;
    const scratch = this._visScratch;
    scratch.length = 0;
    this._syncCamLocal();
    for (let i = 0; i < shell.length; i++) {
      const b = shell[i];
      if (!b?.suckable || b.buried || !this._sameColor(b, u) || this._plateBlocks(b.row, b.col)) continue;
      if (camOnly) {
        if (!this._camExposed(b, u.ghost)) continue;
      } else if (this._occluded(b)) {
        continue;
      }
      scratch.push(b);
    }
    return scratch;
  }

  private _colorBucketOf(block: BlockCell): BlockCell[] {
    let list = this._visByColor.get(block.colorId);
    if (!list) {
      list = [];
      this._visByColor.set(block.colorId, list);
    }
    return list;
  }

  private _rgbBucketOf(block: BlockCell): BlockCell[] {
    const key = this._visRgbKey(block.colorId, block.voxelId);
    let list = this._visByRgb.get(key);
    if (!list) {
      list = [];
      this._visByRgb.set(key, list);
    }
    return list;
  }

  private _addVis(block: BlockCell): void {
    if (this._vis.has(block)) return;
    this._vis.add(block);
    this._visList.push(block);
    this._rgbBucketOf(block).push(block);
    this._colorBucketOf(block).push(block);
  }

  private _removeVis(block: BlockCell): void {
    if (!this._vis.delete(block)) return;
    pullFrom(this._visList, block);
    pullFrom(this._rgbBucketOf(block), block);
    pullFrom(this._colorBucketOf(block), block);
  }

  private _queueVisPatch(block: BlockCell): void {
    if (this._visDirty) return;
    this._visPatch.push(block);
  }

  private _guideRearUnit(): UnitActor | null {
    for (const u of this._units) {
      if (this._canHookUnit(u)) return u;
    }
    return null;
  }

  private _guideSlotUnit(): UnitActor | null {
    this._visDirty = true;
    this._ensureVis();
    let best: UnitActor | null = null;
    let bestN = 1e9;
    for (const s of this._slots) {
      const u = s.occupant;
      if (!u?.usable) continue;
      const n = this._visList.length > 0 ? this._visHitCount(u) : 0;
      if (n < bestN) {
        bestN = n;
        best = u;
      }
    }
    return best;
  }

  private _guideBrick(): BlockCell | null {
    const list = this._visList;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.node?.isValid && b.node.active && b.hp > 0 && !b.inFlight) return b;
    }
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
      if (b.node?.isValid && b.node.active && b.hp > 0 && !b.inFlight) return b;
    }
    return null;
  }

  private _canShuffle(): boolean {
    let n = 0;
    for (const u of this._units) {
      if (u.onBench) n += 1;
      if (n >= 2) return true;
    }
    return false;
  }

  private _hintSlot(unit: UnitActor): SlotPad | null {
    let best: SlotPad | null = null;
    let bestScore = 1e9;
    unit.node.getWorldPosition(_world);
    for (const s of this._slots) {
      if (!this._slotOpenFor(s, unit)) continue;
      s.node.getWorldPosition(_tmp);
      const dx = _tmp.x - _world.x;
      const dz = _tmp.z - _world.z;
      const score = dx * dx + dz * dz
        + (this._colHasMatch(s.homeCol, unit.colorId) ? -2 : 0)
        + this._raftHintBias(s.homeCol);
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  private _indexBlocks(): void {
    let cols = PLAY.wallCols;
    let rows = PLAY.wallRows;
    let layers = PLAY.wallDepth + 2;
    for (const b of this._blocks) {
      cols = Math.max(cols, b.col + 1);
      rows = Math.max(rows, b.row + 1);
      layers = Math.max(layers, b.layer + 1);
    }
    this._cols = Math.max(1, cols);
    this._byCol.length = 0;
    this._byRow.length = 0;
    this._raftBricks.length = 0;
    this._allocGrid(this._cols, Math.max(1, rows), layers);
    for (let i = 0; i < this._cols; i++) this._byCol.push([]);
    for (let i = 0; i < Math.max(1, rows); i++) this._byRow.push([]);
    this._remain = 0;
    for (const b of this._blocks) {
      if (b.raft) this._raftBricks.push(b);
      if (!b.alive || b.col < 0 || b.col >= this._cols) continue;
      this._byCol[b.col].push(b);
      this._rowList(b.row).push(b);
      this._setCell(b);
      this._remain += 1;
    }
    this._hideBuried();
    this._bumpVis();
    requestBrickSkinFlush();
    this._flushSkin();
  }

  private _rowList(row: number): BlockCell[] {
    while (this._byRow.length <= row) this._byRow.push([]);
    return this._byRow[row];
  }

  private _unindex(block: BlockCell): void {
    this._clearCell(block);
    pullFrom(this._byCol[block.col], block);
    pullFrom(this._byRow[block.row], block);
    pullFrom(this._shell, block);
    this._removeVis(block);
    if (block.raft) pullFrom(this._raftBricks, block);
    this._needHoldRefresh = true;
    this._queueVisPatch(block);
    this._revealAround(block);
  }

  private _bindTouch(): void {
    this._unbindTouch();
    input.on(Input.EventType.TOUCH_START, this._onTouchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
    input.on(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    input.on(Input.EventType.MOUSE_DOWN, this._onMouseDown, this);
    input.on(Input.EventType.MOUSE_MOVE, this._onMouseMove, this);
    input.on(Input.EventType.MOUSE_UP, this._onMouseUp, this);
  }

  private _unbindTouch(): void {
    input.off(Input.EventType.TOUCH_START, this._onTouchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
    input.off(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    input.off(Input.EventType.MOUSE_DOWN, this._onMouseDown, this);
    input.off(Input.EventType.MOUSE_MOVE, this._onMouseMove, this);
    input.off(Input.EventType.MOUSE_UP, this._onMouseUp, this);
  }

  private _onTouchStart(e: EventTouch): void {
    this._fromTouch = true;
    this._beginPointer(e);
  }

  private _onTouchMove(e: EventTouch): void {
    this._movePointer(e);
  }

  private _onTouchEnd(e: EventTouch): void {
    this._endPointer(e);
    this._fromTouch = false;
  }

  private _onMouseDown(e: EventMouse): void {
    if (this._fromTouch || e.getButton() !== EventMouse.BUTTON_LEFT) return;
    this._beginPointer(e);
  }

  private _onMouseMove(e: EventMouse): void {
    if (this._fromTouch) return;
    this._movePointer(e);
  }

  private _onMouseUp(e: EventMouse): void {
    if (this._fromTouch) return;
    this._endPointer(e);
  }

  private _beginPointer(e: PointerEvt): void {
    if (!this._playing || this._won || this._lost) return;
    if (this._overUi(e)) return;
    if (this._guideBlocksWorld()) return;
    const loc = e.getLocation();
    this._ptrDown = true;
    this._dragSpin = this._teachingShovel() || this._lastGuide?.phase === 'target' ? false : this._canSpinAt(e);
    this._spinning = false;
    this._dragStartX = loc.x;
    this._dragStartY = loc.y;
    this._dragLastX = loc.x;
    this._dragLastY = loc.y;
  }

  private _movePointer(e: PointerEvt): void {
    if (!this._dragSpin || !this._playing || this._won || this._lost) return;
    const loc = e.getLocation();
    const dx = loc.x - this._dragLastX;
    const dy = loc.y - this._dragLastY;
    if (!this._spinning) {
      const ax = loc.x - this._dragStartX;
      const ay = loc.y - this._dragStartY;
      if (ax * ax + ay * ay < SPIN_THRESH_PX * SPIN_THRESH_PX) return;
      this._spinning = true;
      completeGuide('spin');
    }
    this._applySpinDelta(dx, dy);
    this._dragLastX = loc.x;
    this._dragLastY = loc.y;
  }

  private _endPointer(e: PointerEvt): void {
    if (!this._ptrDown) return;
    const spun = this._spinning;
    this._ptrDown = false;
    this._dragSpin = false;
    this._spinning = false;
    if (spun) {
      this._visKey = 0x7fffffff;
      this._visSkip = VIS_SKIP_REST;
    } else {
      this._onTap(e);
    }
  }

  private _canSpinAt(e: PointerEvt): boolean {
    if (this._inTurretBand(e.getLocation())) return false;
    if (this._hitsFieldModel(e)) return true;
    return this._nearFieldScreen(e.getLocation());
  }

  private _itemTrayTopScreen(): number {
    const vis = uiVisibleSize();
    return uiFromBottomToScreenY(itemTrayTopFromBottom(vis.h), vis.h);
  }

  private _turretBandTop(): number {
    const trayTop = this._itemTrayTopScreen();
    const cam = this._cam;
    if (!cam) return Math.max(trayTop, screen.windowSize.height * 0.42);
    let top = 0;
    for (let i = 0; i < this._slots.length; i++) {
      const n = this._slots[i].node;
      if (!n?.isValid || !n.activeInHierarchy) continue;
      n.getWorldPosition(_tmp);
      _tmp.y += 0.62;
      cam.worldToScreen(_tmp, _screen);
      if (_screen.y > top) top = _screen.y;
    }
    for (let i = 0; i < this._units.length; i++) {
      const u = this._units[i];
      if (!u.usable || (u.state !== 'bench' && u.state !== 'attack')) continue;
      u.node.getWorldPosition(_tmp);
      _tmp.y += 0.28;
      cam.worldToScreen(_tmp, _screen);
      if (_screen.y > top) top = _screen.y;
    }
    if (top <= 0) {
      _tmp.set(0, slotY() + 0.62, shooterStandZ());
      cam.worldToScreen(_tmp, _screen);
      top = _screen.y;
    }
    return Math.max(top + TURRET_PAD_PX, trayTop);
  }

  private _inTurretBand(loc: { x: number; y: number }): boolean {
    return loc.y <= this._turretBandTop();
  }

  private _hitsFieldModel(e: PointerEvt): boolean {
    const field = this._field;
    if (!field || !this._aimRay(e)) return false;
    this._fieldLocalBox(_boxMin, _boxMax);
    worldToRest(_ray.o, _tmp);
    field.inverseTransformPoint(_tmp, _tmp);
    Vec3.scaleAndAdd(_world, _ray.o, _ray.d, 80);
    worldToRest(_world, _world);
    field.inverseTransformPoint(_world, _world);
    _world.subtract(_tmp);
    return rayHitsAabb(_tmp, _world, _boxMin, _boxMax);
  }

  private _nearFieldScreen(loc: { x: number; y: number }): boolean {
    const cam = this._cam;
    const field = this._field;
    if (!cam || !field) return false;
    this._fieldLocalBox(_boxMin, _boxMax);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < 8; i++) {
      _tmp.set(
        i & 1 ? _boxMax.x : _boxMin.x,
        i & 2 ? _boxMax.y : _boxMin.y,
        i & 4 ? _boxMax.z : _boxMin.z,
      );
      Vec3.transformMat4(_world, _tmp, field.worldMatrix);
      restToWorld(_world, _world);
      cam.worldToScreen(_world, _screen);
      if (_screen.x < minX) minX = _screen.x;
      if (_screen.y < minY) minY = _screen.y;
      if (_screen.x > maxX) maxX = _screen.x;
      if (_screen.y > maxY) maxY = _screen.y;
    }
    const floor = this._turretBandTop();
    return (
      loc.x >= minX - SPIN_SCREEN_PAD_PX &&
      loc.x <= maxX + SPIN_SCREEN_PAD_PX &&
      loc.y >= Math.max(minY - SPIN_SCREEN_PAD_PX, floor) &&
      loc.y <= maxY + SPIN_SCREEN_PAD_PX
    );
  }

  private _fieldLocalBox(min: Vec3, max: Vec3): void {
    const half = PLAY.blockSize * 0.5 + SPIN_BOX_PAD;
    const step = PLAY.blockStep;
    const spanX = Math.max(0, this._cols - 1) * step;
    const spanY = Math.max(0, PLAY.wallRows - 1) * step;
    const spanZ = Math.max(0, PLAY.wallDepth - 1) * step;
    const startX = wallStartX(this._cols);
    min.set(startX - half, PLAY.wallBaseY - half - this._fieldCy, GAME.wallFrontZ - spanZ - half - this._fieldCz);
    max.set(startX + spanX + half, PLAY.wallBaseY + spanY + half - this._fieldCy, GAME.wallFrontZ + half - this._fieldCz);
  }

  private _applySpinDelta(dx: number, dy: number): void {
    const dt = Math.max(1 / 120, director.getDeltaTime());
    const k = GAME.wallSpinDragDeg * (Math.PI / 180);
    // Screen follow: UI Y is up, so drag right/down moves the grabbed face the same way.
    const dYaw = dx * k;
    const dPitch = -dy * k;
    this._orbitSpin(dYaw, dPitch);
    this._spinVel = dYaw / dt;
    this._pitchVel = dPitch / dt;
  }

  private _camSpinAxes(right: Vec3, up: Vec3): void {
    const n = this._cam?.node;
    if (n?.isValid) {
      n.getWorldRotation(_camQ);
      Vec3.transformQuat(right, Vec3.UNIT_X, _camQ);
      Vec3.transformQuat(up, Vec3.UNIT_Y, _camQ);
      return;
    }
    right.set(1, 0, 0);
    up.set(0, 1, 0);
  }

  private _orbitSpin(dYaw: number, dPitch: number): void {
    if (dYaw === 0 && dPitch === 0) return;
    this._camSpinAxes(_camRight, _camUp);
    _spinAxis.set(
      _camUp.x * dYaw + _camRight.x * dPitch,
      _camUp.y * dYaw + _camRight.y * dPitch,
      _camUp.z * dYaw + _camRight.z * dPitch,
    );
    const ang = _spinAxis.length();
    if (ang < 1e-10) return;
    _spinAxis.multiplyScalar(1 / ang);
    Quat.fromAxisAngle(_spinDq, _spinAxis, ang);
    Quat.multiply(this._spinRot, _spinDq, this._spinRot);
    Quat.normalize(this._spinRot, this._spinRot);
  }

  private _onTap(e: PointerEvt): void {
    if (!this._playing || this._won || this._lost || this._itemFxBusy) return;
    if (this._overUi(e)) return;
    if (this._guideBlocksWorld()) return;
    if (this._hookPick) {
      const rear = this._pickAnyBench(e);
      if (rear && this._canHookUnit(rear)) {
        this._unitItemLand(rear, _world);
        this._commitItemFx('hook', _world, () => {
          this._deployHooked(rear);
        }, rear, this._hintSlot(rear));
      } else if (!this._guideKeepPick()) {
        this._hookPick = false;
        this._emitItems();
        this._kickGuide();
      }
      return;
    }
    if (this._shovelPick) {
      const unit = this._pickSlotUnit(e);
      if (unit) {
        this._unitItemLand(unit, _world);
        this._commitItemFx('shovel', _world, () => {
          this._shovelToBench(unit);
        }, unit, this._slotOf(unit));
      } else if (!this._guideKeepPick()) {
        this._shovelPick = false;
        this._emitItems();
        this._kickGuide();
      }
      return;
    }
    if (this._bombPick) {
      const block = this._pickBrick(e);
      if (block) {
        this._commitItemFx('bomb', null, () => {
          this._blastColorGroup(block);
        });
      } else if (!this._guideKeepPick()) {
        this._bombPick = false;
        this._emitItems();
        this._kickGuide();
      }
      return;
    }
    const unit = this._pickBench(e);
    if (unit) {
      this._placeOrMerge(unit);
      return;
    }
    this._tryUnlockSlot(e);
  }

  private _slotOpenFor(s: SlotPad, unit?: UnitActor | null): boolean {
    if (!s.open) return false;
    if (s === this._fxHoldSlot && unit !== this._fxHoldUnit) return false;
    return s.empty || (!!unit && s.occupant === unit);
  }

  private _countOpenEmptySlots(): number {
    let n = 0;
    for (const s of this._slots) {
      if (this._slotOpenFor(s)) n += 1;
    }
    return n;
  }

  /** Bench + reserve + still-trapped rescues that will need a pit. */
  private _countAwaitingUnits(): number {
    let n = this._reserve.length;
    for (const u of this._units) {
      if (!u.node.active) continue;
      if (u.trapped || u.freeing || u.onBench) n += 1;
      else if (u.state === 'bench') n += 1;
    }
    return n;
  }

  /** Last empty pits == leftover octopuses → seat them without a tap. */
  private _maybeAutoPlace(): void {
    if (this._autoPlacing || !this._playing || this._won || this._lost || this._remain === 0) return;
    if (!this._itemsReady || this._lastGuide || this._itemFxBusy) return;
    if (this._hookPick || this._shovelPick || this._bombPick) return;
    const pits = this._countOpenEmptySlots();
    if (pits <= 0 || pits !== this._countAwaitingUnits()) return;
    this._autoPlacing = true;
    let guard = 0;
    let delay = 0;
    while (guard++ < GAME.slotMax) {
      if (this._countOpenEmptySlots() !== this._countAwaitingUnits()) break;
      let placed = false;
      for (const u of this._units) {
        if (!u.usable || u.state !== 'bench' || !this._isColFront(u)) continue;
        const slot = this._hintSlot(u);
        if (!slot) continue;
        this._placeUnit(u, slot, delay);
        delay += 0.07;
        placed = true;
        break;
      }
      if (!placed) break;
    }
    this._autoPlacing = false;
  }

  private _placeOrMerge(unit: UnitActor): void {
    if (this._teachingShovel()) {
      const idle = this._guideIdleFrontUnit();
      if (idle && unit !== idle) return;
    }
    completeGuide('tap');
    const slot = this._hintSlot(unit);
    if (slot) this._placeUnit(unit, slot);
  }

  private _mergeUnit(unit: UnitActor, merge: UnitActor): void {
    gameAudio()?.playUiClick();
    merge.power += unit.power;
    merge.maxPower = Math.max(merge.maxPower, merge.power);
    merge.syncPowerLabel();
    unit.node.active = false;
    unit.state = 'bench';
    this._refillBenchCol(unit.benchCol);
  }

  private _placeUnit(unit: UnitActor, slot: SlotPad, delay = 0, keepScale = false): void {
    if (!this._slotOpenFor(slot, unit)) {
      const next = this._hintSlot(unit);
      if (!next) return;
      slot = next;
    }
    gameAudio()?.playUiClick();
    slot.occupant = unit;
    unit.lockedCol = slot.homeCol;
    unit.asBlock = false;
    unit.state = 'walk';
    slot.node.getWorldPosition(_tmp);
    _tmp.y += SLOT_PAD_TOP + SLOT_UNIT_LIFT;
    _tmp.z += SLOT_UNIT_FWD;
    unit.flyToWorld(_tmp, delay, keepScale);
    unit.suckWait = Math.max(unit.suckWait, GAME.suckLandDelay);
    if (!keepScale) unit.refreshSeatLook();
    this._refillBenchCol(unit.benchCol);
    this._hint?.hide();
    this._maybeAutoPlace();
    this._syncShovelHud();
  }

  private _tickCombat(dt: number): void {
    if (!this._playing || this._won || this._lost || this._platesBreaking) return;
    if (this._remain <= 0) this._remain = this._countAlive();
    if (this._remain === 0) {
      this._retireLeftoverUnits();
      if (!this._platesOpen && this._ironRows.length) return;
      this._refreshChests();
      if (this._chestBusy || this._chestQueue.length) return;
      this._winSettle += dt;
      if (this._stillClearing() || this._winSettle < 0.42) return;
      this._won = true;
      this._onWin?.();
      return;
    }
    this._maybeAutoPlace();
    this._winSettle = 0;
    if (this._needHoldRefresh) {
      this._needHoldRefresh = false;
      this._refreshLocks();
      this._refreshRescues();
      this._refreshChests();
    }
    this._stuckT += dt;
    if (this._stuckT >= 0.15) {
      this._stuckT = 0;
      this._checkStuckLose();
      this._syncShovelHud();
    }
  }

  private _countAlive(): number {
    let n = 0;
    for (let i = 0; i < this._blocks.length; i++) {
      if (this._blocks[i].node.active && this._blocks[i].hp > 0) n += 1;
    }
    return n;
  }

  private _fireUnits(dt: number): void {
    if (!this._playing || this._won || this._lost || this._remain === 0) return;
    const units = this._units;
    if (!units) return;
    let flying = this._flightBusy();
    let seated = false;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.node.activeInHierarchy || u.trapped || u.asBlock || u.power <= 0) continue;
      if (u.lockedCol < 0 && u.state !== 'bench' && u.state !== 'drag') this._recoverSeat(u);
      if (!this._canFire(u)) continue;
      if (!seated) {
        this._ensureVis();
        seated = true;
      }
      u.suckWait = Math.max(0, u.suckWait - dt);
      u.state = 'attack';
      const block = this._bestBlock(u);
      if (block) u.aimAt(block.worldPos(_world));
      else u.clearAim();
      if (u.suckWait > 0 || u.inflight >= GAME.suckMaxFlight || u.power <= u.inflight) continue;
      if (flying >= GAME.suckMaxFlightTotal) continue;
      if (!block) {
        if (this._nudgeCool <= 0) {
          this._nudgeLocked(u.colorId);
          this._nudgeCool = 0.28;
        }
        continue;
      }
      this._shootBrick(u, block);
      flying += 1;
      u.suckWait = this._suckInterval(u);
    }
  }

  /** Shots, incoming bricks, or budgeted destroy chips still on the field. */
  private _stillClearing(): boolean {
    for (let i = 0; i < this._shots.length; i++) {
      if (this._shots[i].busy) return true;
    }
    for (let i = 0; i < this._blocks.length; i++) {
      if (this._blocks[i].node.active) return true;
    }
    if (destroyBurstBusy()) return true;
    const units = this._units;
    if (units) {
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (u.inflight > 0 || u.vanishing) return true;
      }
    }
    return false;
  }

  /** Open pits full, wall still has bricks, and nothing can progress → fail. */
  private _checkStuckLose(): void {
    if (this._won || this._lost || this._platesBreaking) return;
    let openSlots = 0;
    let filled = 0;
    let absorbing = false;
    let canAbsorb = false;
    for (const s of this._slots) {
      if (!s.open) continue;
      openSlots += 1;
      if (s.empty) continue;
      filled += 1;
      const u = s.occupant;
      if (u?.traveling) {
        absorbing = true;
        continue;
      }
      if (!u?.usable) continue;
      if (u.inflight > 0) absorbing = true;
      else if (u.power > 0 && this._canEventuallyAbsorb(u)) canAbsorb = true;
    }
    if (openSlots <= 0 || filled < openSlots || absorbing || canAbsorb) return;
    if (this._afford('bomb') && this._canBomb()) return;
    if (this._afford('shovel') && this._canShovel()) return;
    this._lost = true;
    this._onLose?.();
  }

  private _suckInterval(u: UnitActor): number {
    const power = Math.max(1, u.maxPower);
    const interval = GAME.suckRefInterval * (power / GAME.suckRefPower);
    return Math.min(GAME.suckMaxInterval, Math.max(GAME.suckMinInterval, interval));
  }

  private _shootBrick(u: UnitActor, block: BlockCell): void {
    if (!block.node?.isValid || !block.node.active || block.hp <= 0 || u.power <= u.inflight) return;
    const sandCol = block.col;
    const sandLayer = block.layer;
    this._unindex(block);
    if (this._sandCols.has(sandCol)) this._settleSand(sandCol, sandLayer);
    block.beginIncoming();
    u.inflight += 1;
    try {
      gameAudio()?.playAbsorb();
      this._brickFace(block, _world);
      _world.x += (Math.random() - 0.5) * 0.03;
      _world.y += (Math.random() - 0.5) * 0.02;
      u.aimAt(_world);
      u.mouthWorld(_tmp);
      const dx = _world.x - _tmp.x;
      const dy = _world.y - _tmp.y;
      const dz = _world.z - _tmp.z;
      const dist = Math.hypot(dx, dy, dz) || 1;
      _tmp.x += (dx / dist) * 0.02;
      _tmp.y += (dy / dist) * 0.02;
      _tmp.z += (dz / dist) * 0.02;
      _hitDir.set(dx, dy, dz);
      const dur = Math.min(GAME.shotMaxSec, Math.max(GAME.shotMinSec, dist / GAME.shotSpeed));
      const shot = this._nextShot();
      shot.landUnit = u;
      shot.landBlock = block;
      shot.landToken = tokenOfColorId(block.colorId);
      const fireToken = tokenOfColorId(u.colorId);
      const fireRgb = this._tintOf(u.colorId);
      shot.fire(_tmp, _world, fireToken, dur, 0, this._onShotLand, fireRgb);
      playMuzzleFlash(this._flyRoot ?? this.node, _tmp, _hitDir, fireToken, fireRgb);
    } catch {
      _hitDir.set(0, 1, 0);
      this._shatterBrick(block, _hitDir);
      this._spendShot(u, true);
      this._syncSpentColor(u.colorId);
    }
  }

  private _landShot(shot: InkShot): void {
    const u = shot.landUnit as UnitActor | null;
    const block = shot.landBlock as BlockCell | null;
    const token = (shot.landToken || 'y') as ColorToken;
    shot.landUnit = null;
    shot.landBlock = null;
    if (!block?.node?.isValid) {
      if (u?.isValid) {
        this._spendShot(u, false);
        this._syncSpentColor(u.colorId);
      }
      return;
    }
    fieldWorldOf(block.node, _world);
    playHitFlash(
      this._flyRoot ?? this.node,
      _world,
      u ? tokenOfColorId(u.colorId) : token,
      u ? this._tintOf(u.colorId) : undefined,
    );
    // landKick follows the bolt into the sculpture. Bounce XZ back out so a
    // solid apple does not swallow the cube; keep Y so shots from below still pop up.
    _hitDir.set(-shot.landKick.x, shot.landKick.y, -shot.landKick.z);
    if (this._cam?.node?.isValid) {
      this._cam.node.getWorldPosition(_camP);
      _faceN.set(_camP.x - _world.x, 0, _camP.z - _world.z);
      const toward = Math.sqrt(_faceN.lengthSqr()) || 1;
      _hitDir.x += _faceN.x / toward * 0.65;
      _hitDir.z += _faceN.z / toward * 0.65;
    }
    const broke = this._shatterBrick(block, _hitDir);
    if (u?.isValid) {
      this._spendShot(u, broke);
      this._syncSpentColor(u.colorId);
    }
  }

  /** Visible surface toward the lens — same as original worldHitPoint. */
  private _brickFace(block: BlockCell, out: Vec3): Vec3 {
    const n = block.node;
    const cam = this._cam;
    if (!cam?.node?.isValid) return fieldWorldOf(n, out);
    cam.node.getWorldPosition(_camP);
    worldToRest(_camP, _camP);
    n.inverseTransformPoint(_faceN, _camP);
    _hitDir.set(-_faceN.x, -_faceN.y, -_faceN.z);
    if (rayHitAabbAt(_faceN, _hitDir, _hitMin, _hitMax, _hitLocal)) {
      Vec3.transformMat4(out, _hitLocal, n.worldMatrix);
      restToWorld(out, out);
    } else {
      fieldWorldOf(n, out);
    }
    _faceN.set(_camP.x - out.x, _camP.y - out.y, _camP.z - out.z);
    const len = Math.sqrt(_faceN.lengthSqr()) || 1;
    out.x += (_faceN.x / len) * 0.1;
    out.y += (_faceN.y / len) * 0.1;
    out.z += (_faceN.z / len) * 0.1;
    return out;
  }

  private _spendShot(u: UnitActor, destroyed: boolean): void {
    u.inflight = Math.max(0, u.inflight - 1);
    if (!destroyed || u === this._fxHoldUnit) return;
    u.power = Math.max(0, u.power - 1);
    u.syncPowerLabel();
    if (u.power <= 0) {
      const col = (u.state === 'bench' || u.state === 'drag') ? u.benchCol : -1;
      this._retireUnit(u);
      if (col >= 0) this._refillBenchCol(col);
    }
  }

  private _shatterBrick(block: BlockCell, kick?: Vec3): boolean {
    if (!block?.node?.isValid) return false;
    const counted = block.node.active && block.hp > 0;
    const host = this._flyRoot ?? this.node;
    fieldWorldOf(block.node, _world);
    popBrickSkin(block);
    if (block.node.parent !== host) block.node.setParent(host, true);
    const rgb = this._brickRgb(block);
    block.blowOff(kick);
    playDestroyBurst(this._flyRoot ?? this.node, _world, rgb);
    if (counted) this._remain = Math.max(0, this._remain - 1);
    this._lookDirty = true;
    return counted;
  }

  private _brickRgb(block: BlockCell): readonly [number, number, number] {
    return readPaintRgb(block.node)
      ?? (block.voxelId >= 0 ? rgbOfVoxel(block.voxelId) : this._tintOf(block.colorId));
  }

  private _nextShot(): InkShot {
    for (let i = 0; i < this._shots.length; i++) {
      if (!this._shots[i].busy) return this._shots[i];
    }
    const shot = createInkShot(this._flyRoot ?? this.node);
    shot.node.name = `Shot_${this._shots.length}`;
    this._shots.push(shot);
    return shot;
  }

  private _flightBusy(): number {
    let n = 0;
    for (let i = 0; i < this._units.length; i++) n += this._units[i].inflight;
    return n;
  }

  private _retireUnit(u: UnitActor): void {
    for (const s of this._slots) {
      if (s.occupant === u) s.occupant = null;
    }
    u.lockedCol = -1;
    u.inflight = 0;
    u.playVanish(() => {
      if (u.node?.isValid) u.node.active = false;
    });
  }

  /** Only guns that have finished flying into a pit. */
  private _canFire(u: UnitActor): boolean {
    if (this._teachingShovel() || u === this._fxHoldUnit) return false;
    return !u.asBlock && u.lockedCol >= 0 && (u.state === 'walk' || u.state === 'attack') && !u.trapped && !u.traveling;
  }

  private _recoverSeat(u: UnitActor): void {
    if (u.asBlock || u.state === 'bench' || u.state === 'drag') return;
    for (let i = 0; i < this._slots.length; i++) {
      const s = this._slots[i];
      if (s.occupant !== u) continue;
      u.lockedCol = s.homeCol;
      return;
    }
    u.node.getWorldPosition(_tmp);
    let best: SlotPad | null = null;
    let bestD = 0.28 * 0.28;
    for (let i = 0; i < this._slots.length; i++) {
      const s = this._slots[i];
      if (!this._slotOpenFor(s, u)) continue;
      s.node.getWorldPosition(_world);
      _world.y += SLOT_PAD_TOP + SLOT_UNIT_LIFT;
      _world.z += SLOT_UNIT_FWD;
      const dx = _tmp.x - _world.x;
      const dy = _tmp.y - _world.y;
      const dz = _tmp.z - _world.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    if (!best) return;
    best.occupant = u;
    u.lockedCol = best.homeCol;
  }

  private _tintOf(colorId: number): readonly [number, number, number] {
    if (colorId < 0 || colorId >= COLOR_COUNT) return rgbOfVoxel(colorId);
    const token = tokenOfColorId(colorId);
    return PLAY.tints[token] ?? TOKEN_RGB[token] ?? rgbOfVoxel(colorId);
  }

  private _canonRgb(colorId: number): readonly [number, number, number] {
    if (colorId < 0 || colorId >= COLOR_COUNT) return rgbOfVoxel(colorId);
    return TOKEN_RGB[tokenOfColorId(colorId)];
  }

  private _unitVoxel(u: UnitActor): number {
    return u.voxelId >= 0 ? u.voxelId : this._voxelOfColorId(u.colorId);
  }

  private _sameColor(block: BlockCell, u: UnitActor): boolean {
    if (block.colorId === u.colorId) return true;
    const unitVoxel = this._unitVoxel(u);
    if (block.voxelId >= 0 && unitVoxel >= 0 && voxelsAlias(block.voxelId, unitVoxel)) return true;
    return this._idsMatch(block.colorId, u.colorId);
  }

  private _bestBlock(u: UnitActor): BlockCell | null {
    if (u.ghost || this._visDirty || this._visPatch.length) this._visibleSet(u.ghost);
    this._syncCamLocal();
    if (this._aimVisKey !== this._visKey) {
      this._aimBest.clear();
      this._aimVisKey = this._visKey;
    } else {
      const cached = this._aimBest.get(u);
      if (
        cached?.suckable
        && !cached.buried
        && this._sameColor(cached, u)
        && !this._plateBlocks(cached.row, cached.col)
        && !this._occluded(cached)
      ) {
        return cached;
      }
    }
    const best = this._pickTarget(u);
    if (best) this._aimBest.set(u, best);
    else this._aimBest.delete(u);
    return best;
  }

  private _pickTarget(u: UnitActor): BlockCell | null {
    this._syncCamLocal();
    let list = this._visHits(u);
    if (!list.length) {
      this._visDirty = true;
      this._visibleSet(u.ghost);
      list = this._visHits(u);
    }
    let best = this._scoreHits(u, list);
    if (best) return best;
    best = this._scoreHits(u, this._shellHits(u));
    if (best) return best;
    return this._scoreHits(u, this._looseHits(u));
  }

  private _scoreHits(u: UnitActor, list: readonly BlockCell[]): BlockCell | null {
    let best: BlockCell | null = null;
    let bestScore = -1e9;
    u.node.getWorldPosition(_tmp);
    worldToRest(_tmp, _tmp);
    const wall = this._wall;
    if (wall?.isValid) wall.inverseTransformPoint(_tmp, _tmp);
    const ux = _tmp.x;
    const uy = _tmp.y;
    const cx = _camLocal.x;
    const cy = _camLocal.y;
    const cz = _camLocal.z;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.node?.isValid || !b.suckable || b.buried || !this._sameColor(b, u)) continue;
      if (this._plateBlocks(b.row, b.col) || this._occluded(b)) continue;
      const p = b.node.position;
      const dx = p.x - ux;
      const dy = p.y - uy;
      const depth = Math.hypot(p.x - cx, p.y - cy, p.z - cz);
      const score =
        -depth * 48 -
        dx * dx -
        dy * dy * 0.35 +
        (this._sandCols.has(b.col) ? -b.row : 0);
      if (score > bestScore) {
        bestScore = score;
        best = b;
      }
    }
    return best;
  }

  private _colHasMatch(col: number, colorId: number, ghost = false): boolean {
    const list = this._byCol[col];
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (this._idsMatch(b.colorId, colorId) && b.suckable && this._isVisible(b, ghost)) return true;
    }
    return false;
  }

  private _isVisible(block: BlockCell, ghost = false): boolean {
    if (this._plateBlocks(block.row, block.col)) return false;
    if (ghost) return this._inView(block);
    return this._vis.has(block);
  }

  private _raftHintBias(col: number): number {
    if ((PLAY.raftW | 0) <= 0) return 0;
    const lo = PLAY.raftX + PLAY.raftTravel;
    const hi = lo + PLAY.raftW - 1;
    const a = Math.min(lo, hi);
    const b = Math.max(lo, hi);
    return col >= a && col <= b ? -4 : 1.5;
  }

  /** Same-color brick that is only turned away will face the camera again. */
  private _canEventuallyAbsorb(u: UnitActor): boolean {
    for (let col = 0; col < this._byCol.length; col++) {
      const list = this._byCol[col];
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (!this._sameColor(b, u) || !b.suckable || b.buried) continue;
        if (this._plateBlocks(b.row, b.col)) continue;
        return true;
      }
    }
    return false;
  }

  /** Visible same-color brick the turret can shoot without spinning first. */
  private _canNowAbsorb(u: UnitActor): boolean {
    this._ensureVis();
    return this._visHitCount(u) > 0;
  }

  private _bumpVis(): void {
    this._visGen = (this._visGen + 1) & 0xffff;
    this._visKey = 0x7fffffff;
    this._visDirty = true;
    this._visPatch.length = 0;
  }

  private _visBucket(): number {
    const q = this._spinRot;
    const qx = (q.x * 8) | 0;
    const qy = (q.y * 8) | 0;
    const qz = (q.z * 8) | 0;
    return ((qx + 64) << 20) | ((qy + 64) << 10) | ((qz + 64) & 1023);
  }

  private _syncScreen(): void {
    const size = screen.windowSize;
    this._sw = size.width;
    this._sh = size.height;
  }

  private _ensureVis(): void {
    this._visibleSet(false);
  }

  private _visibleSet(ghost: boolean): Set<BlockCell> {
    const key = this._visBucket() ^ (ghost ? 0x20000000 : 0) ^ (this._visGen << 1);
    if (this._visPatch.length) this._patchCamVis(ghost);
    if (key === this._visKey && !this._visDirty && this._visList.length > 0) return this._vis;
    if (!this._visDirty && this._visList.length > 0) {
      // A drag spin changes the bucket every frame; aim may lag a couple of
      // frames behind the wall without the player noticing.
      this._visSkip += 1;
      if (this._visSkip < (this._spinning ? VIS_SKIP_SPIN : VIS_SKIP_REST)) return this._vis;
      this._visSkip = 0;
    } else {
      this._visSkip = 0;
    }
    this._visDirty = false;
    this._visPatch.length = 0;
    this._visKey = key;
    this._rebuildCamVis(ghost);
    return this._vis;
  }

  private _syncCamLocal(): void {
    const cam = this._cam;
    if (cam?.node?.isValid) cam.node.getWorldPosition(_camP);
    else _camP.set(0, 8, 20);
    worldToRest(_camP, _camP);
    const wall = this._wall;
    if (wall?.isValid) wall.inverseTransformPoint(_camLocal, _camP);
    else _camLocal.set(_camP);
  }

  /**
   * Camera-facing outer shell. A brick is visible if any camera-facing
   * face is open, and nothing sits in front along the view axis.
   */
  private _rebuildCamVis(ghost: boolean): void {
    this._vis.clear();
    this._visList.length = 0;
    this._visByRgb.forEach((list) => {
      list.length = 0;
    });
    this._visByColor.forEach((list) => {
      list.length = 0;
    });
    this._syncCamLocal();
    const shell = this._shell.length ? this._shell : this._blocks;
    for (let i = 0; i < shell.length; i++) {
      const b = shell[i];
      if (b.buried || !b.suckable || this._plateBlocks(b.row, b.col)) continue;
      if (this._camExposed(b, ghost)) this._addVis(b);
    }
  }

  private _patchCamVis(ghost: boolean): void {
    const seeds = this._visPatch;
    if (!seeds.length) return;
    this._syncCamLocal();
    const seen = new Set<BlockCell>();
    const consider = (b: BlockCell | null): void => {
      if (!b?.alive || seen.has(b)) return;
      seen.add(b);
      if (b.buried || !b.suckable || this._plateBlocks(b.row, b.col)) {
        this._removeVis(b);
        return;
      }
      if (this._camExposed(b, ghost)) this._addVis(b);
      else this._removeVis(b);
    };
    for (let i = 0; i < seeds.length; i++) {
      const block = seeds[i];
      this._removeVis(block);
      for (let k = 0; k < COLOR_WALK.length; k++) {
        const d = COLOR_WALK[k];
        consider(this._aliveAt(block.col + d[0], block.row + d[1], block.layer + d[2]));
      }
      this._walkVisBehind(block, consider);
    }
    seeds.length = 0;
    this._aimBest.clear();
  }

  /** Cells that sat behind a removed brick along the last camera axis. */
  private _walkVisBehind(block: BlockCell, consider: (b: BlockCell | null) => void): void {
    const p = block.node?.isValid ? block.node.position : _tmp.set(0, 0, 0);
    const gx = _camLocal.x - p.x;
    const gy = _camLocal.y - p.y;
    const gz = -(_camLocal.z - p.z);
    const ax = Math.abs(gx);
    const ay = Math.abs(gy);
    const az = Math.abs(gz);
    let dc = 0;
    let dr = 0;
    let dl = 0;
    if (ax >= ay && ax >= az) dc = gx > 0 ? -1 : 1;
    else if (ay >= az) dr = gy > 0 ? -1 : 1;
    else dl = gz > 0 ? -1 : 1;
    let c = block.col + dc;
    let r = block.row + dr;
    let l = block.layer + dl;
    const maxC = this._gCols;
    const maxR = this._gRows;
    const maxL = this._gLayers;
    for (let s = 0; s < 32; s++) {
      if (c < 0 || r < 0 || l < 0 || c >= maxC || r >= maxR || l >= maxL) return;
      consider(this._aliveAt(c, r, l));
      c += dc;
      r += dr;
      l += dl;
    }
  }

  /** Another live brick sits between this cell and the camera. */
  private _occluded(block: BlockCell): boolean {
    if (!block.node?.isValid) return true;
    const p = block.node.position;
    return this._hiddenBehind(block, _camLocal.x - p.x, _camLocal.y - p.y, _camLocal.z - p.z);
  }

  private _camExposed(block: BlockCell, _ghost: boolean): boolean {
    if (!this._hasOpenFace(block)) return false;
    const p = block.node.position;
    return !this._hiddenBehind(block, _camLocal.x - p.x, _camLocal.y - p.y, _camLocal.z - p.z);
  }

  private _hasOpenFace(block: BlockCell): boolean {
    for (let i = 0; i < FACE.length; i++) {
      const f = FACE[i];
      if (!this._blockedAt(block.col + f[0], block.row + f[1], block.layer + f[2])) return true;
    }
    return false;
  }

  /** 3D DDA toward the camera so a hollow window counts as line of sight. */
  private _hiddenBehind(block: BlockCell, dx: number, dy: number, dz: number): boolean {
    const gx = dx;
    const gy = dy;
    const gz = -dz;
    const len = Math.hypot(gx, gy, gz);
    if (len < 1e-8) return false;
    const sx = gx / len;
    const sy = gy / len;
    const sz = gz / len;
    const stepC = sx > 1e-8 ? 1 : sx < -1e-8 ? -1 : 0;
    const stepR = sy > 1e-8 ? 1 : sy < -1e-8 ? -1 : 0;
    const stepL = sz > 1e-8 ? 1 : sz < -1e-8 ? -1 : 0;
    const tDeltaC = stepC === 0 ? 1e9 : Math.abs(1 / sx);
    const tDeltaR = stepR === 0 ? 1e9 : Math.abs(1 / sy);
    const tDeltaL = stepL === 0 ? 1e9 : Math.abs(1 / sz);
    let tMaxC = stepC === 0 ? 1e9 : 0.5 / Math.abs(sx);
    let tMaxR = stepR === 0 ? 1e9 : 0.5 / Math.abs(sy);
    let tMaxL = stepL === 0 ? 1e9 : 0.5 / Math.abs(sz);
    let c = block.col;
    let r = block.row;
    let l = block.layer;
    const maxC = this._gCols;
    const maxR = this._gRows;
    const maxL = this._gLayers;
    const grid = this._grid;
    const rowStride = this._gRowStride;
    const layerStride = this._gLayerStride;
    for (let s = 0; s < 48; s++) {
      if (tMaxC <= tMaxR && tMaxC <= tMaxL) {
        c += stepC;
        tMaxC += tDeltaC;
      } else if (tMaxR <= tMaxL) {
        r += stepR;
        tMaxR += tDeltaR;
      } else {
        l += stepL;
        tMaxL += tDeltaL;
      }
      if (c < 0 || r < 0 || l < 0 || c >= maxC || r >= maxR || l >= maxL) return false;
      if (grid[l * layerStride + r * rowStride + c]) return true;
    }
    return false;
  }

  private _inView(block: BlockCell): boolean {
    block.worldPos(_tmp);
    const half = PLAY.blockSize * 0.5;
    if (_tmp.y + half <= VIEW_Y_MIN || _tmp.y - half >= VIEW_Y_MAX) return false;
    return true;
  }

  private _nudgeLocked(colorId: number): void {
    const v = nearestVoxelId(this._tintOf(colorId));
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
      if (!b.locked || !b.alive) continue;
      const same = v >= 0 && b.voxelId >= 0
        ? voxelsAlias(b.voxelId, v)
        : this._idsMatch(b.colorId, colorId);
      if (same) b.nudge();
    }
  }

  /** Whole nailed blob stays shut until no member has a free neighbor on the left, right, or top. */
  private _groupHeld(group: BlockCell[]): boolean {
    for (let i = 0; i < group.length; i++) {
      const b = group[i];
      for (let k = 0; k < HOLD_SIDES.length; k++) {
        const n = this._aliveAt(b.col + HOLD_SIDES[k][0], b.row + HOLD_SIDES[k][1], b.layer);
        if (n && !n.locked) return true;
      }
    }
    return false;
  }

  private _collectLockGroup(start: BlockCell, out: BlockCell[], seen: Set<BlockCell>): void {
    const stack = this._lockStack;
    stack.length = 0;
    stack.push(start);
    while (stack.length) {
      const b = stack.pop()!;
      if (seen.has(b)) continue;
      seen.add(b);
      out.push(b);
      for (let i = 0; i < LOCK_WALK.length; i++) {
        const n = this._aliveAt(b.col + LOCK_WALK[i][0], b.row + LOCK_WALK[i][1], b.layer);
        if (n && n.locked && !seen.has(n)) stack.push(n);
      }
    }
  }

  private _allocGrid(cols: number, rows: number, layers: number): void {
    this._gCols = Math.max(1, cols);
    this._gRows = Math.max(1, rows);
    this._gLayers = Math.max(1, layers);
    this._gRowStride = this._gCols;
    this._gLayerStride = this._gCols * this._gRows;
    const n = this._gLayerStride * this._gLayers;
    const grid = this._grid;
    if (grid.length !== n) this._grid = new Array<BlockCell | null>(n).fill(null);
    else for (let i = 0; i < n; i++) grid[i] = null;
  }

  private _growGrid(cols: number, rows: number, layers: number): void {
    const oc = this._gCols;
    const or = this._gRows;
    const ol = this._gLayers;
    if (cols <= oc && rows <= or && layers <= ol) return;
    const old = this._grid;
    const osr = this._gRowStride;
    const osl = this._gLayerStride;
    this._allocGrid(Math.max(oc, cols), Math.max(or, rows), Math.max(ol, layers));
    const grid = this._grid;
    const sr = this._gRowStride;
    const sl = this._gLayerStride;
    for (let l = 0; l < ol; l++) {
      for (let r = 0; r < or; r++) {
        for (let c = 0; c < oc; c++) {
          grid[l * sl + r * sr + c] = old[l * osl + r * osr + c];
        }
      }
    }
  }

  private _setCell(block: BlockCell): void {
    const c = block.col;
    const r = block.row;
    const l = block.layer;
    if (c < 0 || r < 0 || l < 0) return;
    if (c >= this._gCols || r >= this._gRows || l >= this._gLayers) this._growGrid(c + 1, r + 1, l + 1);
    this._grid[l * this._gLayerStride + r * this._gRowStride + c] = block;
  }

  private _clearCell(block: BlockCell): void {
    const c = block.col;
    const r = block.row;
    const l = block.layer;
    if (c < 0 || r < 0 || l < 0 || c >= this._gCols || r >= this._gRows || l >= this._gLayers) return;
    const i = l * this._gLayerStride + r * this._gRowStride + c;
    if (this._grid[i] === block) this._grid[i] = null;
  }

  private _blockedAt(col: number, row: number, layer: number): boolean {
    if (col < 0 || row < 0 || layer < 0 || col >= this._gCols || row >= this._gRows || layer >= this._gLayers) {
      return false;
    }
    return this._grid[layer * this._gLayerStride + row * this._gRowStride + col] !== null;
  }

  private _aliveAt(col: number, row: number, layer: number): BlockCell | null {
    if (col < 0 || row < 0 || layer < 0 || col >= this._gCols || row >= this._gRows || layer >= this._gLayers) {
      return null;
    }
    const b = this._grid[layer * this._gLayerStride + row * this._gRowStride + col];
    return b?.alive ? b : null;
  }

  private _relocate(block: BlockCell, col: number, row: number): void {
    if (block.col === col && block.row === row) return;
    this._clearCell(block);
    pullFrom(this._byCol[block.col], block);
    pullFrom(this._byRow[block.row], block);
    block.col = col;
    block.row = row;
    if (col < 0 || col >= this._cols) return;
    this._byCol[col].push(block);
    this._rowList(row).push(block);
    this._setCell(block);
  }

  /** Fully boxed-in cubes never show; hiding them does not punch hollow models. */
  private _isBuried(block: BlockCell): boolean {
    if (block.locked || block.raft) return false;
    for (let i = 0; i < COLOR_WALK.length; i++) {
      const d = COLOR_WALK[i];
      if (!this._aliveAt(block.col + d[0], block.row + d[1], block.layer + d[2])) return false;
    }
    return true;
  }

  private _hideBuried(): void {
    this._meshless.length = 0;
    this._shell.length = 0;
    this._meshCursor = 0;
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
      if (!b.alive) continue;
      setBrickDrawn(b, !this._isBuried(b));
      if (!b.buried) this._shell.push(b);
      if (b.meshless) this._meshless.push(b);
    }
    this._meshless.sort((a, b) => {
      const sa = this._nextToShell(a) ? 0 : 1;
      const sb = this._nextToShell(b) ? 0 : 1;
      return sa - sb || a.layer - b.layer || a.row - b.row;
    });
    requestBrickSkinFlush();
  }

  private _nextToShell(block: BlockCell): boolean {
    for (let i = 0; i < COLOR_WALK.length; i++) {
      const d = COLOR_WALK[i];
      const n = this._aliveAt(block.col + d[0], block.row + d[1], block.layer + d[2]);
      if (n && !n.buried) return true;
    }
    return false;
  }

  private _touchBuried(block: BlockCell): void {
    const was = block.buried;
    setBrickDrawn(block, !this._isBuried(block));
    if (!block.alive || block.buried) {
      pullFrom(this._shell, block);
      if (!was && block.buried) popBrickSkin(block);
    } else {
      if (this._shell.indexOf(block) < 0) this._shell.push(block);
      if (was && !block.buried) coverBrickSkin(block);
    }
  }

  private _hideBuriedInCols(cols: ReadonlySet<number>): void {
    const seen = new Set<BlockCell>();
    cols.forEach((col) => {
      for (let c = col - 1; c <= col + 1; c++) {
        const list = this._byCol[c];
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (seen.has(b)) continue;
          seen.add(b);
          this._touchBuried(b);
        }
      }
    });
  }

  private _flushSkin(): void {
    flushBrickSkin(this._blocks, (b) => this._isBuried(b));
  }

  private _revealAround(block: BlockCell): void {
    for (let i = 0; i < COLOR_WALK.length; i++) {
      const d = COLOR_WALK[i];
      const n = this._aliveAt(block.col + d[0], block.row + d[1], block.layer + d[2]);
      if (!n) continue;
      this._touchBuried(n);
    }
  }

  private _refreshLocks(): void {
    const seen = this._lockSeen;
    seen.clear();
    let popped = 0;
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
      if (!b.locked || !b.alive || seen.has(b)) continue;
      const group = this._lockGroup;
      group.length = 0;
      this._collectLockGroup(b, group, seen);
      if (this._groupHeld(group)) continue;
      const mid = group[group.length >> 1];
      mid.node.getWorldPosition(_world);
      playBaozhaBurst(this.node, _world, 0, 0.36);
      for (let k = 0; k < group.length; k++) {
        if (group[k].unlock()) popped += 1;
      }
    }
    if (popped > 0) gameAudio()?.playRemove();
  }

  private _plateBlocks(row: number, col: number): boolean {
    if (this._ironGaps.has(col)) return false;
    for (let i = 0; i < this._ironRows.length; i++) {
      const p = this._ironRows[i];
      if (row < p && !this._openRows.has(p)) return true;
    }
    return false;
  }

  private _refreshPlateGray(): void {
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
      b.setGrayed(b.alive && this._plateBlocks(b.row, b.col));
    }
    this._bumpVis();
  }

  private _rowHasBricksAtOrAbove(ironRow: number): boolean {
    for (let r = ironRow; r < this._byRow.length; r++) {
      const list = this._byRow[r];
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        if (list[i].node.active) return true;
      }
    }
    return false;
  }

  private _nextBreakRow(): number {
    let next = -1;
    for (let i = 0; i < this._ironRows.length; i++) {
      const p = this._ironRows[i];
      if (this._openRows.has(p)) continue;
      if (!this._rowHasBricksAtOrAbove(p)) next = p;
    }
    return next;
  }

  private _refreshPlates(dt: number): void {
    if (this._ironRows.length === 0) return;
    if (this._platesOpen && !this._platesBreaking) return;
    if (this._platesBreaking) {
      this._plateBreakT += dt;
      if (this._plateBreakT >= 0.72) {
        for (let i = 0; i < this._plates.length; i++) {
          if (this._plates[i].row === this._breakingRow) this._plates[i].shatter();
        }
        if (this._breakingRow >= 0 && !this._openRows.has(this._breakingRow)) {
          this._openRows.add(this._breakingRow);
          this._refreshPlateGray();
        }
        this._platesBreaking = false;
        this._breakingRow = -1;
        this._platesOpen = this._ironRows.every((p) => this._openRows.has(p));
      }
      return;
    }
    const next = this._nextBreakRow();
    if (next < 0) return;
    this._platesBreaking = true;
    this._breakingRow = next;
    this._plateBreakT = 0;
    for (let i = 0; i < this._plates.length; i++) {
      if (this._plates[i].row === next) this._plates[i].beginBreak();
    }
    this._blastPlates(next);
  }

  private _blastPlates(row: number): void {
    gameAudio()?.playBoom();
    const layer: IronPlate[] = [];
    for (let i = 0; i < this._plates.length; i++) {
      if (this._plates[i].row === row && this._plates[i].node.active) layer.push(this._plates[i]);
    }
    if (layer.length <= 0) return;
    const mid = layer[layer.length >> 1];
    mid.node.getWorldPosition(_world);
    playBaozhaBurst(this.node, _world);
  }

  private _bindUiHits(): void {
    const hits: Node[] = [];
    const hud = this._canvas?.getChildByName('PlayHud');
    const push = (n: Node | null | undefined): void => {
      if (n) hits.push(n);
    };
    push(hud?.getChildByName('BackBtn'));
    push(hud?.getChildByName('NextBtn'));
    push(hud?.getChildByName('SettingsBtn'));
    push(hud?.getChildByName('ScoreBoard'));
    push(hud?.getChildByName('Powers'));
    push(this._canvas?.getChildByName('GoldHud'));
    const gm = this._canvas?.getChildByName('GmPanel');
    push(gm?.getChildByName('Toggle'));
    push(gm?.getChildByName('Dim'));
    push(gm?.getChildByName('Card'));
    this._uiHits = hits;
  }

  private _overUi(e: PointerEvt): boolean {
    if (this._uiHits.length === 0) this._bindUiHits();
    const loc = e.getLocation();
    const hits = this._uiHits;
    for (let i = 0; i < hits.length; i++) {
      if (this._hitsUi(hits[i], loc)) return true;
    }
    for (let i = 0; i < UI_MODALS.length; i++) {
      const n = this._canvas?.getChildByName(UI_MODALS[i]);
      if (this._modalBlocksPlay(n)) return true;
    }
    return false;
  }

  /** Victory stays active at 0 opacity after GPU warmup; do not treat that as a modal. */
  private _modalBlocksPlay(node: Node | null | undefined): boolean {
    if (!node?.activeInHierarchy) return false;
    const op = node.getComponent(UIOpacity);
    return !op || op.opacity > 0;
  }

  private _hitsUi(node: Node | null | undefined, loc: ReturnType<PointerEvt['getLocation']>): boolean {
    if (!node?.activeInHierarchy) return false;
    const op = node.getComponent(UIOpacity);
    if (op && op.opacity <= 0) return false;
    if (node.getComponent(UITransform)?.hitTest(loc)) return true;
    for (const child of node.children) {
      if (this._hitsUi(child, loc)) return true;
    }
    return false;
  }

  private _aimRay(e: PointerEvt): boolean {
    const cam = this._cam;
    if (!cam) return false;
    const loc = e.getLocation();
    cam.screenPointToRay(loc.x, loc.y, _ray);
    return true;
  }

  private _pickBench(e: PointerEvt): UnitActor | null {
    return this._pickBenchAt(e, true);
  }

  private _pickAnyBench(e: PointerEvt): UnitActor | null {
    return this._pickBenchAt(e, false);
  }

  private _pickBenchAt(e: PointerEvt, frontOnly: boolean): UnitActor | null {
    if (!this._aimRay(e)) return null;
    let best: UnitActor | null = null;
    let bestD = frontOnly ? PICK_R2 : 0.5 * 0.5;
    for (const u of this._units) {
      if (!u.usable || u.state !== 'bench' || u === this._fxHoldUnit) continue;
      if (frontOnly) {
        if (!this._isColFront(u)) continue;
      } else if (!this._canHookUnit(u)) {
        continue;
      }
      u.node.getWorldPosition(_world);
      _world.y += 0.12;
      const d = rayPointDistSq(_ray, _world);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  private _bestMerge(unit: UnitActor): UnitActor | null {
    let best: UnitActor | null = null;
    let bestPower = -1;
    for (const o of this._units) {
      if (o === unit || !o.usable || o.state !== 'bench') continue;
      if (!this._idsMatch(o.colorId, unit.colorId) || !this._isColFront(o)) continue;
      if (o.power > bestPower) {
        bestPower = o.power;
        best = o;
      }
    }
    return best;
  }

  private _markFrontDirty(): void {
    this._frontDirty = true;
  }

  private _ensureFront(): void {
    if (!this._frontDirty) return;
    this._frontDirty = false;
    const n = BENCH.cols;
    const front = this._frontByCol;
    while (front.length < n) front.push(null);
    for (let i = 0; i < n; i++) front[i] = null;
    const units = this._units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.onBench) continue;
      const col = u.benchCol;
      if (col < 0 || col >= n) continue;
      const cur = front[col];
      if (!cur || u.benchRank < cur.benchRank) front[col] = u;
    }
  }

  private _isColFront(u: UnitActor): boolean {
    if (!u.onBench) return false;
    this._ensureFront();
    return this._frontByCol[u.benchCol] === u;
  }

  private _advanceBenchCol(col: number): void {
    this._markFrontDirty();
    const seated: UnitActor[] = [];
    for (const u of this._units) {
      if (u.onBench && u.benchCol === col) seated.push(u);
    }
    seated.sort((a, b) => a.benchRank - b.benchRank);
    for (let i = 0; i < seated.length; i++) {
      const u = seated[i];
      if (u.benchRank === i) continue;
      u.benchRank = i;
      u.homePos.set(benchSeatX(col), benchSeatY(), benchSeatZ(i));
      if (u.state === 'bench') u.slideToHome();
      u.refreshSeatLook();
    }
  }

  private _refillBenchCol(col: number): void {
    this._advanceBenchCol(col);
    let seated = 0;
    for (const u of this._units) {
      if (u.onBench && u.benchCol === col) seated += 1;
    }
    while (seated < BENCH.rows) {
      if (!this._spawnBenchUnit(col, seated)) break;
      seated += 1;
    }
  }

  private _spawnBenchUnit(col: number, rank: number): boolean {
    const bench = this._bench;
    if (!bench) return false;
    const next = this._reserve.shift();
    if (!next) return false;
    const [token, power, extra] = next;
    return this._spawnNamedUnit(col, rank, token, power, extra);
  }

  private _spawnNamedUnit(
    col: number,
    rank: number,
    token: ColorToken,
    power: number,
    extra?: string,
  ): boolean {
    const bench = this._bench;
    if (!bench) return false;
    const pf = this._unitPfs[token] || this._unitPfs['o'];
    if (!pf) return false;
    const index = this._nextUnitIndex++;
    const x = benchSeatX(col);
    const homeZ = benchSeatZ(rank);
    const tag = extra ? `_${extra}` : '';
    const name = `Unit_${String(index).padStart(2, '0')}_${token}_${power}${tag}`;
    let unit: UnitActor | null = null;
    for (let i = 0; i < this._units.length; i++) {
      const u = this._units[i];
      if (u.recyclable && u.colorId === parseColorToken(token)) {
        unit = u;
        break;
      }
    }
    if (unit) {
      unit.reuse(name);
      if (unit.node.parent !== bench) bench.addChild(unit.node);
    } else {
      const n = instantiate(pf);
      n.name = name;
      bench.addChild(n);
      unit = n.getComponent(UnitActor) ?? n.addComponent(UnitActor);
      unit.syncFromName();
      this._units.push(unit);
    }
    unit.node.setPosition(x, benchSeatY(), homeZ + BENCH.stepZ);
    paintUnitColor(unit.node, token);
    unit.applySpecialLook();
    unit.benchCol = col;
    unit.benchRank = rank;
    this._markFrontDirty();
    unit.homePos.set(x, benchSeatY(), homeZ);
    unit.refreshSeatLook();
    unit.slideToHome();
    unit.setPowerVisible(this._playing);
    return true;
  }

  private _settleSand(col: number, layer: number): void {
    const list: BlockCell[] = [];
    const src = this._byCol[col];
    if (src) {
      for (let i = 0; i < src.length; i++) {
        const b = src[i];
        if (b.alive && !b.raft && b.layer === layer) list.push(b);
      }
    }
    list.sort((a, b) => a.row - b.row);
    for (let i = 0; i < list.length; i++) {
      if (list[i].row === i) continue;
      this._relocate(list[i], col, i);
      list[i].beginMove(list[i].node.position.x, PLAY.wallBaseY + i * PLAY.blockStep, 0.38);
    }
    this._reindexCols(new Set([col]));
  }

  private _reindexSpatial(): void {
    for (let i = 0; i < this._byCol.length; i++) this._byCol[i].length = 0;
    for (let i = 0; i < this._byRow.length; i++) this._byRow[i].length = 0;
    this._allocGrid(this._gCols || this._cols, Math.max(1, this._gRows, this._byRow.length), this._gLayers || PLAY.wallDepth + 2);
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
      if (!b.alive || b.col < 0 || b.col >= this._cols) continue;
      this._byCol[b.col].push(b);
      this._rowList(b.row).push(b);
      this._setCell(b);
    }
  }

  private _reindexCols(dirtyCols?: ReadonlySet<number>): void {
    if (dirtyCols && dirtyCols.size) this._hideBuriedInCols(dirtyCols);
    else {
      this._reindexSpatial();
      this._hideBuried();
    }
    this._bumpVis();
  }

  private _blocksHold(block: BlockCell, skipColor?: ColorId): boolean {
    if (skipColor === undefined) return true;
    return block.colorId !== skipColor || block.locked;
  }

  private _trapHeld(col: number, row: number, span = SPECIAL_SPAN, skipColor?: ColorId): boolean {
    let held = false;
    forSpecialRing(col, row, (x, y) => {
      const mask = holdGlowMask(x, y, col, row, span);
      if (held || !mask || mask === HOLD_U) return;
      const n = this._aliveAt(x, y, 0);
      if (n && this._blocksHold(n, skipColor)) held = true;
    }, span);
    return held;
  }

  private _rescueHeld(u: UnitActor): boolean {
    return this._trapHeld(u.trapCol, u.trapRow, u.trapSpan || SPECIAL_SPAN, u.colorId);
  }

  private _pickBenchSeat(): { col: number; rank: number } {
    let bestCol = 0;
    let bestN = 1e9;
    for (let c = 0; c < BENCH.cols; c++) {
      let n = 0;
      for (const o of this._units) {
        if ((o.onBench || o.freeing) && o.benchCol === c) n += 1;
      }
      if (n < bestN) {
        bestN = n;
        bestCol = c;
      }
    }
    if (bestN >= BENCH.rows) return { col: 0, rank: 0 };
    return { col: bestCol, rank: bestN };
  }

  private _beginRescueFree(u: UnitActor): void {
    if (u.freeing) return;
    this._lookDirty = true;
    const bench = this._bench;
    if (!bench) return;
    u.freeing = true;
    const seat = this._pickBenchSeat();
    this._markFrontDirty();
    u.benchCol = seat.col;
    u.benchRank = seat.rank;
    u.homePos.set(benchSeatX(seat.col), benchSeatY(), benchSeatZ(seat.rank));
    u.flashFree();
    this.scheduleOnce(() => {
      if (!u.isValid || !u.node.isValid) return;
      u.node.getWorldPosition(_world);
      playBaozhaBurst(this.node, _world, 0, 1.35);
      clearLockLook(u.node);
      gameAudio()?.playBoom();
      this.scheduleOnce(() => {
        if (!u.isValid || !u.node.isValid || !this._bench) return;
        u.trapped = false;
        u.freeing = false;
        u.state = 'bench';
        u.node.setParent(this._bench, true);
        u.node.setRotationFromEuler(0, 0, 0);
        u.rebindPower();
        u.flyToHome();
        u.setPowerVisible(this._playing);
      }, 0.16);
    }, 0.3);
  }

  private _refreshRescues(): void {
    const bench = this._bench;
    if (!bench) {
      this._refreshRescueLook();
      return;
    }
    for (let i = 0; i < this._rescues.length; i++) {
      const u = this._rescues[i];
      if (!u.trapped || u.freeing || this._rescueHeld(u)) continue;
      this._beginRescueFree(u);
    }
    this._refreshRescueLook();
  }

  private _refreshChests(): void {
    for (let i = 0; i < this._chests.length; i++) {
      const c = this._chests[i];
      if (!c.trapped || c.claimed || this._trapHeld(c.trapCol, c.trapRow, c.trapSpan || SPECIAL_SPAN)) continue;
      c.trapped = false;
      this._lookDirty = true;
      clearLockLook(c.node);
      c.node.getWorldPosition(_world);
      _world.y += 0.18;
      playMergeBurst(this.node, _world);
      gameAudio()?.playRemove();
      this._chestQueue.push(c);
    }
    this._refreshRescueLook();
    this._flushChest();
  }

  private _flushChest(): void {
    if (this._chestBusy) return;
    while (this._chestQueue.length) {
      const next = this._chestQueue.shift()!;
      if (next.claimed || !next.node.active) continue;
      this._chestBusy = true;
      this.setPlaying(false);
      this._onChest?.(next);
      return;
    }
  }

  private _refreshRescueLook(): void {
    if (!this._lookDirty) return;
    this._lookDirty = false;
    if (this._rescues.length === 0 && this._chests.length === 0) return;
    for (let i = 0; i < this._rescues.length; i++) {
      const u = this._rescues[i];
      if (u.freeing) continue;
      if (!u.trapped || !u.node.active) {
        clearLockLook(u.node);
        continue;
      }
      applyLockNails(u.node, 'octopus');
    }
    for (let i = 0; i < this._chests.length; i++) {
      const c = this._chests[i];
      if (!c.trapped || c.claimed || !c.node.active) {
        if (!c.trapped) clearLockLook(c.node);
        continue;
      }
      applyLockNails(c.node, 'chest');
    }
  }

  private _raftOffset(): number {
    if ((PLAY.raftW | 0) <= 0) return 0;
    const period = Math.max(0.4, PLAY.raftPeriod);
    const cycle = period * 2;
    let u = (this._raftT % cycle) / period;
    if (u > 1) u = 2 - u;
    const k = u * u * (3 - 2 * u);
    return k * PLAY.raftTravel * PLAY.blockStep;
  }

  private _bindField(): void {
    let field = this.node.getChildByName('Field');
    if (!field) {
      field = new Node('Field');
      this.node.addChild(field);
    }
    this._field = field;
    this._fieldCy = PLAY.wallBaseY + Math.max(0, PLAY.wallRows - 1) * PLAY.blockStep * 0.5;
    this._fieldCz = GAME.worldCamLookAtZ;
    field.setPosition(0, this._fieldCy, this._fieldCz);
    field.setRotationFromEuler(0, 0, 0);
    let actors = field.getChildByName('FieldActors');
    if (!actors) {
      actors = new Node('FieldActors');
      field.addChild(actors);
    }
    actors.setPosition(0, 0, 0);
    actors.setRotationFromEuler(0, 0, 0);
    this._fieldActors = actors;
    bindFieldActors(actors);
    // Inactive standby worlds have stale world matrices; keepWorldTransform
    // would park Wall at Field's origin and hide every brick from the turret.
    _tmp.set(0, -this._fieldCy, -this._fieldCz);
    const wall = this.node.getChildByName('Wall') ?? field.getChildByName('Wall');
    if (wall) {
      if (wall.parent !== field) wall.setParent(field, false);
      wall.setPosition(_tmp);
      wall.setRotationFromEuler(0, 0, 0);
    }
    for (const name of ['Plates', 'Raft'] as const) {
      const n = this.node.getChildByName(name) ?? field.getChildByName(name) ?? actors.getChildByName(name);
      if (!n) continue;
      if (n.parent !== actors) n.setParent(actors, false);
      n.setPosition(_tmp);
      n.setRotationFromEuler(0, 0, 0);
    }
    this._wall = field.getChildByName('Wall');
    this._platesRoot = actors.getChildByName('Plates');
    this._raft = actors.getChildByName('Raft');
    bindBrickSkin(field, actors);
  }

  private _poseFieldSpin(): void {
    const field = this._field;
    if (!field?.isValid) return;
    this._posedRot.set(this._spinRot);
    this._fieldActors?.setRotation(this._spinRot);
    field.getWorldPosition(_tmp);
    setFieldSpin(this._spinRot, _tmp);
  }

  private _fieldYaw(): number {
    Vec3.transformQuat(_tmp, Vec3.UNIT_X, this._spinRot);
    return Math.atan2(-_tmp.z, _tmp.x);
  }

  private _tickField(dt: number): void {
    if (this._playing && !this._won && !this._lost && !this._spinning) {
      this._orbitSpin(this._spinVel * dt, this._pitchVel * dt);
      this._spinVel *= Math.exp(-SPIN_FRICTION * dt);
      this._pitchVel *= Math.exp(-SPIN_FRICTION * dt);
      if (Math.abs(this._spinVel) < 0.04) this._spinVel = 0;
      if (Math.abs(this._pitchVel) < 0.04) this._pitchVel = 0;
      if (this._spinVel === 0 && this._pitchVel === 0 && GAME.wallSpinPeriod > 0) {
        const period = Math.max(4, GAME.wallSpinPeriod);
        Quat.fromAxisAngle(_spinDq, Vec3.UNIT_Y, (dt / period) * Math.PI * 2);
        Quat.multiply(this._spinRot, _spinDq, this._spinRot);
        Quat.normalize(this._spinRot, this._spinRot);
      }
    }
    if (Quat.equals(this._spinRot, this._posedRot)) return;
    this._poseFieldSpin();
  }

  private _resetDock(): void {
    const bench = this._bench ?? this.node.getChildByName('Bench');
    const slots = this.node.getChildByName('Slots');
    if (bench?.isValid) {
      bench.setPosition(0, 0, 0);
      bench.setRotationFromEuler(0, 0, 0);
    }
    if (slots?.isValid) {
      slots.setPosition(0, 0, 0);
      slots.setRotationFromEuler(0, 0, 0);
    }
  }

  private _mountRaftCarry(): void {
    const wall = this._wall;
    if (!wall || this._raftBricks.length === 0) {
      this._raftCarry = null;
      return;
    }
    let carry = wall.getChildByName('RaftCarry');
    if (!carry) {
      carry = new Node('RaftCarry');
      wall.addChild(carry);
    }
    this._raftCarry = carry;
    const startX = wallStartX(this._cols);
    const lift = PLAY.blockStep * 0.05;
    for (let i = 0; i < this._raftBricks.length; i++) {
      const b = this._raftBricks[i];
      if (!b.node?.isValid) continue;
      if (b.node.parent !== carry) b.node.setParent(carry, false);
      b.node.setPosition(
        startX + b.raftHomeCol * PLAY.blockStep,
        PLAY.wallBaseY + b.row * PLAY.blockStep + lift,
        b.node.position.z,
      );
    }
  }

  private _placeRaft(offset: number): void {
    const holder = this._raft;
    if (!holder || (PLAY.raftW | 0) <= 0) return;
    const startX = wallStartX(this._cols);
    const mid = PLAY.raftX + (PLAY.raftW - 1) * 0.5;
    const bob = Math.sin(this._raftT * 1.3) * 0.018;
    holder.setPosition(
      startX + mid * PLAY.blockStep + offset,
      PLAY.wallBaseY + PLAY.raftY * PLAY.blockStep - PLAY.blockStep * 0.52 + bob - this._fieldCy,
      GAME.wallFrontZ - 0.08 - this._fieldCz,
    );
    if (this._raftCarry?.isValid) this._raftCarry.setPosition(offset, bob, 0);
    this._syncRaftCols(offset);
  }

  private _syncRaftCols(offset: number): void {
    const shift = Math.round(offset / PLAY.blockStep);
    if (shift === this._raftShift) return;
    this._raftShift = shift;
    const dirty = new Set<number>();
    const last = this._cols - 1;
    for (let i = 0; i < this._raftBricks.length; i++) {
      const b = this._raftBricks[i];
      if (!b.raft || !b.alive || b.inFlight) continue;
      const col = Math.max(0, Math.min(last, b.raftHomeCol + shift));
      if (col === b.col) continue;
      dirty.add(b.col);
      dirty.add(col);
      this._relocate(b, col, b.row);
    }
    if (dirty.size) this._reindexCols(dirty);
  }

  private _tickRaft(dt: number): void {
    if ((PLAY.raftW | 0) <= 0) return;
    this._raftT += dt;
    this._placeRaft(this._raftOffset());
  }

  private _resetItems(): void {
    this._itemFxBusy = false;
    this._clearFxHold();
    this._clearPicks();
    this._canShovelHud = this._canShovel();
    this._emitItems();
  }

  private _afford(id: ItemId): boolean {
    if (!itemUnlocked(id, PLAY.levelId)) return false;
    return (this._wallet?.itemCount(id) ?? 0) > 0;
  }

  private _clearPicks(): void {
    this._hookPick = false;
    this._shovelPick = false;
    this._bombPick = false;
  }

  private _kickGuide(): void {
    this._guideKey = '*';
    this._hintT = 1;
    this._syncHint(0);
  }

  private _spend(id: ItemId, autoPlace = true): void {
    if (!this._wallet?.consumeItem(id)) {
      this._emitItems();
      return;
    }
    completeGuide(id);
    this._clearPicks();
    this._emitItems();
    if (autoPlace) this._maybeAutoPlace();
  }

  private _clearFxHold(): void {
    this._fxHoldUnit = null;
    this._fxHoldSlot = null;
  }

  private _slotOf(unit: UnitActor): SlotPad | null {
    for (let i = 0; i < this._slots.length; i++) {
      if (this._slots[i].occupant === unit) return this._slots[i];
    }
    return null;
  }

  private _commitItemFx(
    id: ItemId,
    world: Vec3 | null,
    apply: () => void,
    holdUnit: UnitActor | null = null,
    holdSlot: SlotPad | null = null,
  ): void {
    if (this._itemFxBusy || !this._afford(id)) return;
    this._itemFxBusy = true;
    this._fxHoldUnit = holdUnit;
    this._fxHoldSlot = holdSlot;
    this._spend(id, false);
    const land = world ? new Vec3(world.x, world.y, world.z) : null;
    const finish = (): void => {
      if (!this.isValid || !this._itemFxBusy) return;
      this.unschedule(finish);
      apply();
      this._clearFxHold();
      this._itemFxBusy = false;
      this._maybeAutoPlace();
    };
    this.scheduleOnce(finish, 1.8);
    if (!this._onItemUseFx) {
      finish();
      return;
    }
    this._onItemUseFx({ id, world: land, onArrive: finish });
  }

  private _emitItems(): void {
    this._onItems?.(this.itemState());
  }

  private _shuffleBench(): boolean {
    const seated: UnitActor[] = [];
    for (const u of this._units) {
      if (u.onBench) seated.push(u);
    }
    if (seated.length < 2) return false;
    this._markFrontDirty();
    const seats = seated.map((u) => ({ col: u.benchCol, rank: u.benchRank }));
    for (let i = seated.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const swap = seated[i];
      seated[i] = seated[j];
      seated[j] = swap;
    }
    for (let i = 0; i < seated.length; i++) {
      const u = seated[i];
      const seat = seats[i];
      u.benchCol = seat.col;
      u.benchRank = seat.rank;
      u.homePos.set(benchSeatX(seat.col), u.homePos.y, benchSeatZ(seat.rank));
      if (u.state === 'bench') u.slideToHome();
      u.refreshSeatLook();
    }
    const mid = seated[seated.length >> 1];
    mid.node.getWorldPosition(_world);
    _world.y += 0.2;
    playShuaxinBurst(this.node, _world);
    gameAudio()?.playUiClick();
    return true;
  }

  private _canBomb(): boolean {
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
      if (b.node?.isValid && b.node.active && b.hp > 0 && !b.inFlight) return true;
    }
    return false;
  }

  private _voxelOfColorId(id: number): number {
    if (id < 0 || id >= COLOR_COUNT) return nearestVoxelId(this._tintOf(id));
    const hit = this._idVoxel[id];
    if (hit !== -2) return hit;
    const v = nearestVoxelId(this._tintOf(id));
    this._idVoxel[id] = v;
    return v;
  }

  private _idsMatch(a: number, b: number): boolean {
    if (a === b) return true;
    const va = this._voxelOfColorId(a);
    const vb = this._voxelOfColorId(b);
    return va >= 0 && vb >= 0 && voxelsAlias(va, vb);
  }

  private _pickBrick(e: PointerEvt): BlockCell | null {
    if (!this._aimRay(e)) return null;
    let best: BlockCell | null = null;
    let bestT = 1e9;
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
      if (!b.node?.isValid || !b.node.active || b.hp <= 0 || b.inFlight) continue;
      worldToRest(_ray.o, _tmp);
      b.node.inverseTransformPoint(_tmp, _tmp);
      Vec3.scaleAndAdd(_world, _ray.o, _ray.d, 80);
      worldToRest(_world, _world);
      b.node.inverseTransformPoint(_world, _world);
      _world.subtract(_tmp);
      if (!rayHitAabbAt(_tmp, _world, _hitMin, _hitMax, _hitLocal)) continue;
      Vec3.transformMat4(_faceN, _hitLocal, b.node.worldMatrix);
      restToWorld(_faceN, _faceN);
      const dx = _faceN.x - _ray.o.x;
      const dy = _faceN.y - _ray.o.y;
      const dz = _faceN.z - _ray.o.z;
      const t = dx * _ray.d.x + dy * _ray.d.y + dz * _ray.d.z;
      if (t <= 0 || t >= bestT) continue;
      bestT = t;
      best = b;
    }
    return best;
  }

  private _colorAt(col: number, row: number, layer: number, colorId: number): BlockCell | null {
    const b = this._aliveAt(col, row, layer);
    if (!b?.node?.isValid || b.inFlight) return null;
    return this._idsMatch(b.colorId, colorId) ? b : null;
  }

  private _collectColorGroup(start: BlockCell, out: BlockCell[]): void {
    out.length = 0;
    const stack = this._bombStack;
    stack.length = 0;
    stack.push(start);
    const seen = this._bombSeen;
    seen.clear();
    while (stack.length) {
      const b = stack.pop()!;
      if (seen.has(b)) continue;
      seen.add(b);
      out.push(b);
      for (let i = 0; i < COLOR_WALK.length; i++) {
        const n = this._colorAt(b.col + COLOR_WALK[i][0], b.row + COLOR_WALK[i][1], b.layer + COLOR_WALK[i][2], start.colorId);
        if (n && !seen.has(n)) stack.push(n);
      }
    }
  }

  private _blastColorGroup(start: BlockCell): boolean {
    const group = this._bombGroup;
    this._collectColorGroup(start, group);
    if (group.length <= 0) return false;
    const colorId = start.colorId;
    const token = tokenOfColorId(colorId);
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let n = 0;
    const sandKeys: number[] = [];
    for (let i = 0; i < group.length; i++) {
      const b = group[i];
      if (this._sandCols.has(b.col)) {
        const key = b.col * 1000 + b.layer;
        if (sandKeys.indexOf(key) < 0) sandKeys.push(key);
      }
      if (b.locked) b.unlock();
      fieldWorldOf(b.node, _world);
      cx += _world.x;
      cy += _world.y;
      cz += _world.z;
      n += 1;
    }
    if (n > 0) {
      _world.set(cx / n, cy / n, cz / n);
      playBaozhaBurst(this.node, _world, 0, 1.7);
      gameAudio()?.playBoom();
      if (n >= 4) {
        fieldWorldOf(group[0].node, _world);
        playBaozhaBurst(this.node, _world, 40, 1.1);
        fieldWorldOf(group[n - 1].node, _world);
        playBaozhaBurst(this.node, _world, 70, 1.1);
      }
    }
    let popped = 0;
    for (let i = 0; i < group.length; i++) {
      const b = group[i];
      this._unindex(b);
      if (this._shatterBrick(b)) popped += 1;
    }
    for (let i = 0; i < sandKeys.length; i++) {
      this._settleSand((sandKeys[i] / 1000) | 0, sandKeys[i] % 1000);
    }
    this._syncColorPower(colorId);
    this._lookDirty = true;
    this._needHoldRefresh = true;
    return popped > 0;
  }

  private _countColorBricks(colorId: number): number {
    let n = 0;
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
      if (!b.node?.isValid || !b.node.active || b.hp <= 0) continue;
      if (this._idsMatch(b.colorId, colorId)) n += 1;
    }
    return n;
  }

  private _syncColorPower(colorId: number): void {
    const need = this._countColorBricks(colorId);
    const units: UnitActor[] = [];
    let have = 0;
    for (let i = 0; i < this._units.length; i++) {
      const u = this._units[i];
      if (!u.node?.isValid || !u.node.active || u.vanishing || u.power <= 0) continue;
      if (!this._idsMatch(u.colorId, colorId)) continue;
      have += u.power;
      units.push(u);
    }
    for (let i = 0; i < this._reserve.length; i++) {
      if (this._idsMatch(parseColorToken(this._reserve[i][0]), colorId)) have += this._reserve[i][1];
    }
    let extra = have - need;
    if (extra <= 0) return;
    for (let i = this._reserve.length - 1; i >= 0 && extra > 0; i--) {
      const spec = this._reserve[i];
      if (!this._idsMatch(parseColorToken(spec[0]), colorId)) continue;
      const take = Math.min(spec[1], extra);
      extra -= take;
      const next = spec[1] - take;
      if (next <= 0) this._reserve.splice(i, 1);
      else this._reserve[i] = spec[2] ? [spec[0], next, spec[2]] : [spec[0], next];
    }
    units.sort((a, b) => {
      const rank = (u: UnitActor): number => {
        if (u.lockedCol >= 0) return 0;
        if (u.onBench && this._isColFront(u)) return 1;
        if (u.trapped) return 3;
        return 2;
      };
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return (b.power - b.inflight) - (a.power - a.inflight);
    });
    for (let i = 0; i < units.length && extra > 0; i++) {
      const u = units[i];
      if (u.vanishing) continue;
      const free = Math.max(0, u.power - u.inflight);
      if (free <= 0) continue;
      const take = Math.min(free, extra);
      u.power -= take;
      extra -= take;
      u.syncPowerLabel();
      u.flashFree();
      if (u.power <= 0) this._retireColorUnit(u);
    }
  }

  /** Color is gone — retire leftover ammo of that color. */
  private _syncSpentColor(colorId: number): void {
    if (this._countColorBricks(colorId) > 0) return;
    this._syncColorPower(colorId);
  }

  /** Sculpture is empty: don't refill, just vanish leftover guns. */
  private _retireLeftoverUnits(): void {
    this._reserve.length = 0;
    const units = this._units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.node?.isValid || !u.node.active || u.vanishing) continue;
      if (u.inflight > 0) {
        if (u.power > u.inflight) {
          u.power = u.inflight;
          u.syncPowerLabel();
        }
        continue;
      }
      this._retireColorUnit(u, false);
    }
  }

  private _retireColorUnit(u: UnitActor, refill = true): void {
    if (u.vanishing) return;
    if (u.trapped) {
      u.trapped = false;
      u.node.active = false;
      return;
    }
    const benchCol = u.onBench ? u.benchCol : -1;
    this._retireUnit(u);
    if (refill && benchCol >= 0) this._refillBenchCol(benchCol);
  }

  private _deployHooked(unit: UnitActor): boolean {
    if (!unit?.node?.isValid || !unit.node.active) return false;
    if (unit.traveling || !unit.onBench || this._isColFront(unit)) return false;
    const slot = this._hintSlot(unit);
    if (slot) {
      this._placeUnit(unit, slot, 0, true);
      return true;
    }
    const merge = this._bestMerge(unit);
    if (merge) {
      this._mergeUnit(unit, merge);
      return true;
    }
    return this._promoteToFront(unit);
  }

  private _pickSlotUnit(e: PointerEvt): UnitActor | null {
    if (!this._aimRay(e)) return null;
    let best: UnitActor | null = null;
    let bestD = GAME.slotPickR * GAME.slotPickR;
    for (const s of this._slots) {
      const u = s.occupant;
      if (s.empty || !u?.node?.isValid || !u.node.active) continue;
      u.node.getWorldPosition(_world);
      _world.y += 0.16;
      const d = rayPointDistSq(_ray, _world);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  private _unitSpec(unit: UnitActor): UnitSpec {
    const token = tokenOfColorId(unit.colorId);
    if (unit.ghost) return [token, unit.power, 'ghost'];
    if (unit.asBlock) return [token, unit.power, 'block'];
    return [token, unit.power];
  }

  /** Hide the actor and push its spec onto the reserve tail. */
  private _enqueueUnit(unit: UnitActor): void {
    if (!unit.node?.isValid || !unit.node.active) return;
    this._reserve.push(this._unitSpec(unit));
    this._markFrontDirty();
    unit.lockedCol = -1;
    unit.inflight = 0;
    unit.state = 'bench';
    unit.node.active = false;
  }

  private _shovelToBench(unit: UnitActor): boolean {
    const bench = this._bench;
    if (!bench) return false;
    const seat = this._shortestBenchSeat();
    let owned = false;
    for (const s of this._slots) {
      if (s.occupant === unit) {
        s.occupant = null;
        owned = true;
      }
    }
    if (!owned && unit.lockedCol < 0 && unit.state !== 'walk' && unit.state !== 'attack') return false;
    unit.node.getWorldPosition(_world);
    _world.y += 0.18;
    playMergeBurst(this.node, _world);
    gameAudio()?.playRemove();
    const overflow = seat.rank >= BENCH.rows;
    const rank = overflow ? BENCH.rows : seat.rank;
    unit.lockedCol = -1;
    unit.state = 'bench';
    unit.asBlock = rank > 0;
    unit.clearAim();
    this._markFrontDirty();
    unit.benchCol = seat.col;
    unit.benchRank = rank;
    unit.homePos.set(benchSeatX(seat.col), benchSeatY(), benchSeatZ(rank));
    unit.node.setParent(bench, true);
    unit.refreshSeatLook();
    unit.flyToHome(() => {
      if (overflow) this._enqueueUnit(unit);
      else unit.refreshSeatLook();
    });
    unit.setPowerVisible(this._playing);
    return true;
  }

  private _promoteToFront(unit: UnitActor): boolean {
    if (!unit.onBench || this._isColFront(unit)) return false;
    const col = unit.benchCol;
    let front: UnitActor | null = null;
    let bestRank = 1e9;
    for (const o of this._units) {
      if (!o.onBench || o.benchCol !== col) continue;
      if (o.benchRank < bestRank) {
        bestRank = o.benchRank;
        front = o;
      }
    }
    if (!front || front === unit) return false;
    this._markFrontDirty();
    const r0 = front.benchRank;
    const r1 = unit.benchRank;
    front.benchRank = r1;
    unit.benchRank = r0;
    front.asBlock = r1 > 0;
    unit.asBlock = r0 > 0;
    front.homePos.set(benchSeatX(col), front.homePos.y, benchSeatZ(r1));
    unit.homePos.set(benchSeatX(col), unit.homePos.y, benchSeatZ(r0));
    if (front.state === 'bench') front.slideToHome();
    if (unit.state === 'bench') unit.slideToHome();
    front.refreshSeatLook();
    unit.refreshSeatLook();
    unit.node.getWorldPosition(_world);
    _world.y += 0.2;
    playShuaxinBurst(this.node, _world);
    gameAudio()?.playUiClick();
    return true;
  }

  unlockSlot(slot: SlotPad): boolean {
    if (!slot?.isValid || !slot.locked) return false;
    slot.node.getWorldPosition(_world);
    _world.y += 0.22;
    gameAudio()?.playBoom();
    playMergeBurst(this.node, _world);
    this._emitItems();
    const ok = slot.unlock();
    if (ok) this._maybeAutoPlace();
    return ok;
  }

  private _tryUnlockSlot(e: PointerEvt): boolean {
    const slot = this._pickLockedSlot(e);
    if (!slot) return false;
    gameAudio()?.playUiClick();
    this._onUnlockSlot?.(slot);
    return true;
  }

  private _pickLockedSlot(e: PointerEvt): SlotPad | null {
    if (!this._aimRay(e)) return null;
    let best: SlotPad | null = null;
    let bestD = GAME.slotPickR * GAME.slotPickR;
    for (const s of this._slots) {
      if (!s.locked || !s.node.active) continue;
      s.node.getWorldPosition(_world);
      _world.y += 0.16;
      const d = rayPointDistSq(_ray, _world);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

}
