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
import { nearestVoxelId, rgbLooksSame, rgbOfVoxel, voxelsAlias } from '../game/VoxelPalette';
import { paintNodeColor, paintUnitColor, readPaintRgb } from './BrickSpecials';
import type { PlayerWallet } from '../game/PlayerWallet';
import { itemUnlocked, UnitSpec, type ItemId } from '../game/LevelCatalog';
import { activeGuide, completeGuide, type GuideView } from '../game/TutorialGuide';
import { SLOT_PAD_TOP, SLOT_UNIT_FWD, SLOT_UNIT_LIFT } from './ToySlotMesh';
import { BlockCell } from './BlockCell';
import { DebrisBit, DEBRIS_POOL_MAX, makeDebrisBit } from './DebrisBit';
import { createInkShot, InkShot, playHitFlash, playMuzzleFlash } from './InkShot';
import { HintHand } from './HintHand';
import { IronPlate } from './IronPlate';
import { ChestActor } from './ChestActor';
import { applyLockNails, clearLockLook } from './LockNails';
import { SlotPad } from './SlotPad';
import { bindBrickSkin, clearBrickSkin, dirtyBrickSkin, flushBrickSkin, popBrickSkin } from './BrickSkin';
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

function cellKey(col: number, row: number, layer: number): number {
  return (col + 512) * 1000000 + (row + 512) * 1000 + (layer + 256);
}

function setBrickDrawn(cell: BlockCell, on: boolean): void {
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
  private readonly _debris: DebrisBit[] = [];
  private readonly _shots: InkShot[] = [];
  private _flyRoot: Node | null = null;
  private _fromTouch = false;
  private readonly _byCol: BlockCell[][] = [];
  private readonly _byRow: BlockCell[][] = [];
  private readonly _at = new Map<number, BlockCell>();
  private readonly _vis = new Set<BlockCell>();
  private readonly _visList: BlockCell[] = [];
  private _visKey = 0x7fffffff;
  private _visGen = 0;
  private _needHoldRefresh = false;
  private _visDirty = true;
  private _visSkip = 0;
  private _unstickT = 0;
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
  private readonly _onShotLand = (shot: InkShot): void => {
    this._landShot(shot);
  };
  private readonly _depthList: BlockCell[] = [];
  private readonly _visPx: number[] = [];
  private readonly _visPy: number[] = [];
  private readonly _visPz: number[] = [];
  private readonly _visSz: number[] = [];
  private readonly _visOrd: number[] = [];
  private readonly _visSurf: boolean[] = [];
  private readonly _visOcc = new Map<number, number>();
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
  private _onGoldDenied: (() => void) | null = null;
  private _wallet: PlayerWallet | null = null;
  private _hookPick = false;
  private _shovelPick = false;
  private _bombPick = false;
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
  private _raft: Node | null = null;
  private _raftT = 0;
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
    this._onGoldDenied = opts.onGoldDenied ?? null;
    this._onChest = opts.onChest ?? null;
    this._onUnlockSlot = opts.onUnlockSlot ?? null;
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
    this._fireUnits(dt);
    this._tickField(dt);
    this._tickRaft(dt);
    if (this._nudgeCool > 0) this._nudgeCool -= dt;
    this._tickCombat(dt);
    this._refreshPlates(dt);
    this._syncHint();
    this._flushSkin();
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
    const incoming = new Set<BlockCell>();
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
    this._slots.length = 0;
    this._debris.length = 0;
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
    const pool = this.node.getChildByName('DebrisPool');
    wall?.children.forEach((n) => {
      if (n.name === 'BrickSkins') return;
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
    pool?.children.forEach((n) => {
      const c = n.getComponent(DebrisBit) ?? n.addComponent(DebrisBit);
      n.active = false;
      this._debris.push(c);
    });
    if (this._debris.length < 8) {
      let host = pool;
      if (!host) {
        host = new Node('DebrisPool');
        this.node.addChild(host);
      }
      while (this._debris.length < 8) {
        this._debris.push(makeDebrisBit(host, `Debris_${this._debris.length}`));
      }
    }
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
    this._poseFieldSpin();
    this._lookDirty = true;
    this._needHoldRefresh = false;
    this._stuckT = 0;
    this._unstickT = 0;
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
    };
  }

  useItem(id: ItemId): boolean {
    if (!this._playing || this._won || this._lost) return false;
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
      if (!this._shuffleBench()) {
        this._emitItems();
        return false;
      }
      this._spend('shuffle');
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
        return true;
      }
      if (!this._hasRearBench()) {
        this._emitItems();
        return false;
      }
      this._hookPick = true;
      this._emitItems();
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
        return true;
      }
      if (!this._canShovel()) {
        this._emitItems();
        return false;
      }
      this._shovelPick = true;
      this._emitItems();
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
        return true;
      }
      if (!this._canBomb()) {
        this._emitItems();
        return false;
      }
      this._bombPick = true;
      this._emitItems();
      return true;
    }
    this._emitItems();
    return false;
  }

  private _hasRearBench(): boolean {
    for (const u of this._units) {
      if (u.onBench && !this._isColFront(u)) return true;
    }
    return false;
  }

  private _canShovel(): boolean {
    if (!this._bench) return false;
    for (const s of this._slots) {
      if (s.occupant?.usable) return true;
    }
    return false;
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
      this.node.addChild(n);
    }
    const hint = n.getComponent(HintHand) ?? n.addComponent(HintHand);
    hint.bindCamera(this._cam);
    return hint;
  }

  private _syncHint(): void {
    if (!this._playing || this._won || this._lost) {
      this._emitGuide(null);
      this._hint?.hide();
      return;
    }
    const guide = activeGuide(PLAY.levelId, {
      hookPick: this._hookPick,
      shovelPick: this._shovelPick,
      bombPick: this._bombPick,
      canShuffle: this._canShuffle(),
      hasRear: this._hasRearBench(),
      canShovel: this._canShovel(),
      canBomb: this._canBomb(),
    });
    this._emitGuide(guide);
    const hint = this._hint;
    if (!hint || !guide || guide.phase === 'icon') {
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
    const key = guide ? `${guide.id}:${guide.phase}:${guide.tip}` : '';
    if (key === this._guideKey) return;
    this._guideKey = key;
    this._onGuide?.(guide);
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

  private _guideFrontUnit(): UnitActor | null {
    this._ensureVis();
    for (const u of this._units) {
      if (!u.usable || u.state !== 'bench' || !this._isColFront(u)) continue;
      if (this._canNowAbsorb(u)) return u;
    }
    return null;
  }

  private _guideRearUnit(): UnitActor | null {
    for (const u of this._units) {
      if (u.usable && u.state === 'bench' && !this._isColFront(u)) return u;
    }
    return null;
  }

  private _guideSlotUnit(): UnitActor | null {
    for (const s of this._slots) {
      if (s.occupant?.usable) return s.occupant;
    }
    return null;
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
      if (!s.open || !s.empty) continue;
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
    for (const b of this._blocks) {
      cols = Math.max(cols, b.col + 1);
      rows = Math.max(rows, b.row + 1);
    }
    this._cols = Math.max(1, cols);
    this._byCol.length = 0;
    this._byRow.length = 0;
    this._at.clear();
    this._raftBricks.length = 0;
    for (let i = 0; i < this._cols; i++) this._byCol.push([]);
    for (let i = 0; i < Math.max(1, rows); i++) this._byRow.push([]);
    this._remain = 0;
    for (const b of this._blocks) {
      if (b.raft) this._raftBricks.push(b);
      if (!b.alive || b.col < 0 || b.col >= this._cols) continue;
      this._byCol[b.col].push(b);
      this._rowList(b.row).push(b);
      this._at.set(cellKey(b.col, b.row, b.layer), b);
      this._remain += 1;
    }
    this._hideBuried();
    this._bumpVis();
    this._flushSkin();
  }

  private _rowList(row: number): BlockCell[] {
    while (this._byRow.length <= row) this._byRow.push([]);
    return this._byRow[row];
  }

  private _unindex(block: BlockCell): void {
    pullFrom(this._byCol[block.col], block);
    pullFrom(this._byRow[block.row], block);
    this._at.delete(cellKey(block.col, block.row, block.layer));
    this._vis.delete(block);
    pullFrom(this._visList, block);
    if (block.raft) pullFrom(this._raftBricks, block);
    this._needHoldRefresh = true;
    this._visDirty = true;
    popBrickSkin(block);
    this._revealAround(block);
    dirtyBrickSkin();
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
    const loc = e.getLocation();
    this._ptrDown = true;
    this._dragSpin = this._canSpinAt(e);
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
    if (!spun) this._onTap(e);
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
    if (!this._playing || this._won || this._lost) return;
    if (this._overUi(e)) return;
    if (this._hookPick) {
      const rear = this._pickAnyBench(e);
      if (rear && !this._isColFront(rear) && this._deployHooked(rear)) this._spend('hook');
      else {
        this._hookPick = false;
        this._emitItems();
      }
      return;
    }
    if (this._shovelPick) {
      const unit = this._pickSlotUnit(e);
      if (unit && this._shovelToBench(unit)) this._spend('shovel');
      else {
        this._shovelPick = false;
        this._emitItems();
      }
      return;
    }
    if (this._bombPick) {
      const block = this._pickBrick(e);
      if (block && this._blastColorGroup(block)) this._spend('bomb');
      else {
        this._bombPick = false;
        this._emitItems();
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

  private _countOpenEmptySlots(): number {
    let n = 0;
    for (const s of this._slots) {
      if (s.open && s.empty) n += 1;
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
    if (this._autoPlacing || !this._playing || this._won || this._lost) return;
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

  private _placeUnit(unit: UnitActor, slot: SlotPad, delay = 0): void {
    gameAudio()?.playUiClick();
    slot.occupant = unit;
    unit.lockedCol = slot.homeCol;
    unit.asBlock = false;
    unit.state = 'walk';
    slot.node.getWorldPosition(_tmp);
    _tmp.y += SLOT_PAD_TOP + SLOT_UNIT_LIFT;
    _tmp.z += SLOT_UNIT_FWD;
    unit.flyToWorld(_tmp, delay);
    unit.suckWait = Math.max(unit.suckWait, GAME.suckLandDelay);
    unit.refreshSeatLook();
    this._refillBenchCol(unit.benchCol);
    this._hint?.hide();
    this._maybeAutoPlace();
  }

  private _tickCombat(dt: number): void {
    if (!this._playing || this._won || this._lost || this._platesBreaking) return;
    this._maybeAutoPlace();
    if (this._remain <= 0) this._remain = this._countAlive();
    if (this._remain === 0) {
      if (!this._platesOpen && this._ironRows.length) return;
      this._refreshChests();
      if (this._chestBusy || this._chestQueue.length) return;
      this._winSettle += dt;
      if (this._stillClearing() || this._winSettle < 0.42) return;
      this._won = true;
      this._onWin?.();
      return;
    }
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
    const units = this._units;
    if (!units) return;
    let flying = this._flightBusy();
    let seated = false;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.node.activeInHierarchy || u.trapped || u.asBlock || u.power <= 0) continue;
      if (u.lockedCol < 0) this._recoverSeat(u);
      if (!this._canFire(u)) continue;
      if (!seated) {
        this._ensureVis();
        seated = true;
      }
      u.suckWait -= dt;
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
      u.suckWait += this._suckInterval(u);
    }
  }

  /** Shots, incoming bricks, or debris still on the field. */
  private _stillClearing(): boolean {
    for (let i = 0; i < this._shots.length; i++) {
      if (this._shots[i].busy) return true;
    }
    for (let i = 0; i < this._blocks.length; i++) {
      if (this._blocks[i].node.active) return true;
    }
    for (let i = 0; i < this._debris.length; i++) {
      if (this._debris[i].busy) return true;
    }
    const units = this._units;
    if (units) {
      for (let i = 0; i < units.length; i++) {
        if (units[i].inflight > 0) return true;
      }
    }
    return false;
  }

  /** All pits occupied and nobody can (or is) absorbing → fail. */
  private _checkStuckLose(): void {
    if (this._won || this._lost || this._platesBreaking) return;
    let filled = 0;
    let absorbing = false;
    let canAbsorb = false;
    for (const s of this._slots) {
      if (s.empty) continue;
      filled += 1;
      const u = s.occupant;
      if (!u?.usable) continue;
      if (u.inflight > 0) absorbing = true;
      else if (u.power > 0 && this._canEventuallyAbsorb(u)) canAbsorb = true;
    }
    if (filled < GAME.slotMax || absorbing || canAbsorb) return;
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
    if (!block.node.active || block.hp <= 0 || u.power <= u.inflight) return;
    try {
    gameAudio()?.playAbsorb();
    const magnet = block.magnet;
    const sandCol = block.col;
    const sandLayer = block.layer;
    this._unindex(block);
    if (magnet) u.magnet = true;
    if (this._sandCols.has(sandCol)) this._settleSand(sandCol, sandLayer);
    block.beginIncoming();
    u.inflight += 1;
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
    shot.landBoom = block.bombed;
    shot.landPaint = block.paint;
    shot.landToken = tokenOfColorId(block.colorId);
    const fireToken = tokenOfColorId(u.colorId);
    const fireRgb = readPaintRgb(u.node) ?? this._tintOf(u.colorId);
    shot.fire(_tmp, _world, fireToken, dur, 0, this._onShotLand, fireRgb);
    playMuzzleFlash(this._flyRoot ?? this.node, _tmp, _hitDir, fireToken, fireRgb);
    } catch {
      u.inflight = Math.max(0, u.inflight - 1);
    }
  }

  private _landShot(shot: InkShot): void {
    const u = shot.landUnit as UnitActor | null;
    const block = shot.landBlock as BlockCell | null;
    const boom = shot.landBoom;
    const paint = shot.landPaint;
    const token = (shot.landToken || 'y') as ColorToken;
    shot.landUnit = null;
    shot.landBlock = null;
    if (!block?.node?.isValid) {
      if (u?.isValid) this._spendShot(u, false);
      return;
    }
    if (boom || paint) {
      if (!u?.isValid) return;
      block.beginPrimeBoom(u.node, 0.28, () => {
        const existed = block.node.active && block.hp > 0;
        if (boom) this._detonate(u, block);
        else this._paintSplash(block, u.colorId);
        if (u.isValid) this._spendShot(u, existed);
      });
      return;
    }
    fieldWorldOf(block.node, _world);
    playHitFlash(
      this._flyRoot ?? this.node,
      _world,
      u ? tokenOfColorId(u.colorId) : token,
      u ? (readPaintRgb(u.node) ?? this._tintOf(u.colorId)) : undefined,
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
    if (u?.isValid) this._spendShot(u, broke);
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
    if (!destroyed) return;
    u.power = Math.max(0, u.power - 1);
    u.syncPowerLabel();
    if (u.power <= 0) this._retireUnit(u);
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
    this._burstDebris(_world, rgb);
    if (counted) this._remain = Math.max(0, this._remain - 1);
    this._lookDirty = true;
    return counted;
  }

  private _brickRgb(block: BlockCell): readonly [number, number, number] {
    return readPaintRgb(block.node)
      ?? (block.voxelId >= 0 ? rgbOfVoxel(block.voxelId) : this._tintOf(block.colorId));
  }

  private _burstDebris(from: Vec3, rgb: readonly [number, number, number], count = 6): void {
    let busy = 0;
    for (let i = 0; i < this._debris.length; i++) {
      if (this._debris[i].busy) busy += 1;
    }
    const n = busy > 18 ? 1 : busy > 12 ? 3 : count;
    for (let i = 0; i < n; i++) {
      const bit = this._nextDebris();
      if (!bit) break;
      bit.burst(from, rgb);
    }
  }

  private _nextDebris(): DebrisBit | null {
    for (let i = 0; i < this._debris.length; i++) {
      if (!this._debris[i].busy) return this._debris[i];
    }
    if (this._debris.length >= DEBRIS_POOL_MAX) {
      return this._debris[this._debris.length - 1];
    }
    let pool = this.node.getChildByName('DebrisPool');
    if (!pool) {
      pool = new Node('DebrisPool');
      this.node.addChild(pool);
    }
    const bit = makeDebrisBit(pool, `Debris_${this._debris.length}`);
    this._debris.push(bit);
    return bit;
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

  /** Only guns seated in a pit. */
  private _canFire(u: UnitActor): boolean {
    return !u.asBlock && u.lockedCol >= 0 && u.state !== 'drag' && !u.trapped && !u.traveling;
  }

  private _recoverSeat(u: UnitActor): void {
    if (u.asBlock) return;
    for (let i = 0; i < this._slots.length; i++) {
      const s = this._slots[i];
      if (s.occupant !== u) continue;
      u.lockedCol = s.homeCol;
      if (u.state === 'bench') u.state = 'attack';
      return;
    }
    u.node.getWorldPosition(_tmp);
    let best: SlotPad | null = null;
    let bestD = 0.28 * 0.28;
    for (let i = 0; i < this._slots.length; i++) {
      const s = this._slots[i];
      if (!s.open || (!s.empty && s.occupant !== u)) continue;
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
    if (u.state === 'bench') u.state = 'attack';
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
    const rgb = readPaintRgb(u.node) ?? this._tintOf(u.colorId);
    const fromPaint = nearestVoxelId(rgb);
    if (fromPaint >= 0) return fromPaint;
    return u.voxelId;
  }

  private _sameColor(block: BlockCell, u: UnitActor): boolean {
    const brickRgb = block.voxelId >= 0 ? rgbOfVoxel(block.voxelId) : this._tintOf(block.colorId);
    const unitRgb = readPaintRgb(u.node) ?? this._tintOf(u.colorId);
    if (rgbLooksSame(brickRgb, unitRgb)) return true;
    const unitVoxel = this._unitVoxel(u);
    if (block.voxelId >= 0 && unitVoxel >= 0 && voxelsAlias(block.voxelId, unitVoxel)) return true;
    return this._idsMatch(block.colorId, u.colorId);
  }

  private _bestBlock(u: UnitActor): BlockCell | null {
    if (u.ghost || this._visDirty) this._visibleSet(u.ghost);
    if (this._aimVisKey !== this._visKey) {
      this._aimBest.clear();
      this._aimVisKey = this._visKey;
    } else {
      const cached = this._aimBest.get(u);
      if (
        cached?.suckable
        && this._vis.has(cached)
        && this._sameColor(cached, u)
        && !this._plateBlocks(cached.row, cached.col)
      ) {
        return cached;
      }
    }
    const best = this._pickTarget(u, this._visList);
    if (best) this._aimBest.set(u, best);
    else this._aimBest.delete(u);
    return best;
  }

  private _pickTarget(u: UnitActor, list: readonly BlockCell[]): BlockCell | null {
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
      if (!b.node?.isValid || !b.suckable || !this._sameColor(b, u)) continue;
      if (this._plateBlocks(b.row, b.col)) continue;
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
        if (!this._sameColor(b, u) || !b.suckable) continue;
        if (this._plateBlocks(b.row, b.col)) continue;
        return true;
      }
    }
    return false;
  }

  /** Visible same-color brick the turret can shoot without spinning first. */
  private _canNowAbsorb(u: UnitActor): boolean {
    const list = this._visList;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.suckable || !this._sameColor(b, u) || this._plateBlocks(b.row, b.col)) continue;
      return true;
    }
    return false;
  }

  private _bumpVis(): void {
    this._visGen = (this._visGen + 1) & 0xffff;
    this._visKey = 0x7fffffff;
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
    if (key === this._visKey && !this._visDirty && this._visList.length > 0) return this._vis;
    if (!this._visDirty && !this._spinning && this._visList.length > 0) {
      this._visSkip += 1;
      if (this._visSkip < 8) return this._vis;
      this._visSkip = 0;
    } else {
      this._visSkip = 0;
    }
    this._visDirty = false;
    this._visKey = key;
    this._rebuildCamVis(ghost);
    return this._vis;
  }

  /**
   * Camera-facing outer shell. A brick is visible if any camera-facing
   * face is open, and nothing sits in front along the view axis.
   */
  private _rebuildCamVis(ghost: boolean): void {
    this._vis.clear();
    this._visList.length = 0;
    const cam = this._cam;
    if (cam?.node?.isValid) cam.node.getWorldPosition(_camP);
    else _camP.set(0, 8, 20);
    worldToRest(_camP, _camP);
    const wall = this._wall;
    if (wall?.isValid) wall.inverseTransformPoint(_camLocal, _camP);
    else _camLocal.set(_camP);
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
      if (!b.suckable || this._plateBlocks(b.row, b.col)) continue;
      if (this._camExposed(b, ghost)) {
        this._vis.add(b);
        this._visList.push(b);
      }
    }
  }

  private _camExposed(block: BlockCell, ghost: boolean): boolean {
    const p = block.node.position;
    const dx = _camLocal.x - p.x;
    const dy = _camLocal.y - p.y;
    const dz = _camLocal.z - p.z;
    let open = false;
    for (let i = 0; i < FACE.length; i++) {
      const f = FACE[i];
      const d = dx * f[3] + dy * f[4] + dz * f[5];
      if (d <= 0.08) continue;
      if (this._aliveAt(block.col + f[0], block.row + f[1], block.layer + f[2])) continue;
      open = true;
      break;
    }
    if (!open) return false;
    return !this._hiddenBehind(block, dx, dy, dz);
  }

  private _hiddenBehind(block: BlockCell, dx: number, dy: number, dz: number): boolean {
    const gx = dx;
    const gy = dy;
    const gz = -dz;
    const ax = Math.abs(gx);
    const ay = Math.abs(gy);
    const az = Math.abs(gz);
    let dc = 0;
    let dr = 0;
    let dl = 0;
    if (ax >= ay && ax >= az) dc = gx > 0 ? 1 : -1;
    else if (ay >= az) dr = gy > 0 ? 1 : -1;
    else dl = gz > 0 ? 1 : -1;
    let c = block.col + dc;
    let r = block.row + dr;
    let l = block.layer + dl;
    const maxC = this._cols;
    const maxR = this._byRow.length;
    const maxL = PLAY.wallDepth + 2;
    for (let s = 0; s < 32; s++) {
      if (c < 0 || r < 0 || l < 0 || c >= maxC || r >= maxR || l >= maxL) return false;
      if (this._aliveAt(c, r, l)) return true;
      c += dc;
      r += dr;
      l += dl;
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

  /** 3x3 blast; extra bricks fly in free and can chain into other bombs. */
  private _detonate(u: UnitActor, bomb: BlockCell): void {
    fieldWorldOf(bomb.node, _world);
    playBaozhaBurst(this.node, _world, 0, 1.95);
    gameAudio()?.playBoom();
    const ox = _world.x;
    const oy = _world.y;
    const oz = _world.z;
    this._popBomb(bomb);
    forSpecialRing(bomb.col, bomb.row, (x, y) => {
      const n = this._aliveAt(x, y, bomb.layer);
      if (n) this._blastAway(u, n, ox, oy, oz);
    });
  }

  private _popBomb(block: BlockCell): void {
    if (block.node.active && block.hp > 0) {
      this._remain = Math.max(0, this._remain - 1);
    }
    block.hp = 0;
    block.node.active = false;
  }

  private _blastAway(u: UnitActor, block: BlockCell, ox?: number, oy?: number, oz?: number): void {
    if (!block.alive) return;
    if (block.locked) block.unlock();
    const chain = block.bombed;
    const sandCol = block.col;
    const sandLayer = block.layer;
    this._unindex(block);
    if (this._sandCols.has(sandCol)) this._settleSand(sandCol, sandLayer);
    if (chain) {
      this._detonate(u, block);
      return;
    }
    if (ox != null && oy != null && oz != null) {
      fieldWorldOf(block.node, _tmp);
      _hitDir.set(_tmp.x - ox, _tmp.y - oy, _tmp.z - oz);
      const len = Math.sqrt(_hitDir.lengthSqr()) || 1;
      _hitDir.multiplyScalar(1 / len);
    } else {
      _hitDir.set(0, 0, 0);
    }
    this._shatterBrick(block, _hitDir);
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

  private _aliveAt(col: number, row: number, layer: number): BlockCell | null {
    const b = this._at.get(cellKey(col, row, layer));
    return b?.alive ? b : null;
  }

  /** Fully boxed-in cubes never show; hiding them does not punch hollow models. */
  private _isBuried(block: BlockCell): boolean {
    if (block.bombed || block.paint || block.locked || block.magnet || block.raft) return false;
    for (let i = 0; i < COLOR_WALK.length; i++) {
      const d = COLOR_WALK[i];
      if (!this._aliveAt(block.col + d[0], block.row + d[1], block.layer + d[2])) return false;
    }
    return true;
  }

  private _hideBuried(): void {
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
      if (!b.alive) continue;
      setBrickDrawn(b, !this._isBuried(b));
    }
    dirtyBrickSkin();
  }

  private _flushSkin(): void {
    flushBrickSkin(this._blocks, (b) => this._isBuried(b));
  }

  private _revealAround(block: BlockCell): void {
    for (let i = 0; i < COLOR_WALK.length; i++) {
      const d = COLOR_WALK[i];
      const n = this._at.get(cellKey(block.col + d[0], block.row + d[1], block.layer + d[2]));
      if (!n?.alive) continue;
      setBrickDrawn(n, !this._isBuried(n));
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
    dirtyBrickSkin();
    this._flushSkin();
  }

  private _rowHasBricksAtOrAbove(ironRow: number): boolean {
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
      if (b.row >= ironRow && b.node.active) return true;
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
    push(hud?.getChildByName('UgcBtn'));
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
      if (!u.usable || u.state !== 'bench') continue;
      if (frontOnly && !this._isColFront(u)) continue;
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

  private _isColFront(u: UnitActor): boolean {
    if (!u.onBench) return false;
    let best: UnitActor | null = null;
    let bestRank = 1e9;
    for (const o of this._units) {
      if (!o.onBench || o.benchCol !== u.benchCol) continue;
      if (o.benchRank < bestRank) {
        bestRank = o.benchRank;
        best = o;
      }
    }
    return best === u;
  }

  private _advanceBenchCol(col: number): void {
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
    unit.homePos.set(x, benchSeatY(), homeZ);
    unit.refreshSeatLook();
    unit.slideToHome();
    unit.setPowerVisible(this._playing);
    return true;
  }

  private _paintSplash(origin: BlockCell, colorId: ColorId): void {
    const token = tokenOfColorId(colorId);
    const col = origin.col;
    const row = origin.row;
    const layer = origin.layer;
    origin.node.getWorldPosition(_world);
    playMergeBurst(this.node, _world);
    this._dyeAround(col, row, layer, colorId, token);
    this._popBomb(origin);
  }

  private _dyeAround(col: number, row: number, layer: number, colorId: ColorId, token: ColorToken): void {
    forSpecialRing(col, row, (x, y) => {
      const b = this._aliveAt(x, y, layer);
      if (!b) return;
      b.colorId = colorId;
      b.voxelId = nearestVoxelId(PLAY.tints[token] ?? TOKEN_RGB[token] ?? TOKEN_RGB.o);
      paintNodeColor(b.node, token);
    });
  }

  private _settleSand(col: number, layer: number): void {
    const list: BlockCell[] = [];
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
      if (b.alive && b.col === col && b.layer === layer) list.push(b);
    }
    list.sort((a, b) => a.row - b.row);
    for (let i = 0; i < list.length; i++) {
      if (list[i].row === i) continue;
      list[i].row = i;
      list[i].beginMove(list[i].node.position.x, PLAY.wallBaseY + i * PLAY.blockStep, 0.38);
    }
    this._reindexCols();
  }

  private _reindexCols(): void {
    for (let i = 0; i < this._byCol.length; i++) this._byCol[i].length = 0;
    for (let i = 0; i < this._byRow.length; i++) this._byRow[i].length = 0;
    this._at.clear();
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
      if (!b.alive || b.col < 0 || b.col >= this._cols) continue;
      this._byCol[b.col].push(b);
      this._rowList(b.row).push(b);
      this._at.set(cellKey(b.col, b.row, b.layer), b);
    }
    this._hideBuried();
    this._bumpVis();
    this._flushSkin();
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
    this._syncRaftBricks(offset, bob);
  }

  private _syncRaftBricks(offset: number, bob: number): void {
    const startX = wallStartX(this._cols);
    const lift = PLAY.blockStep * 0.05;
    let moved = false;
    for (let i = 0; i < this._raftBricks.length; i++) {
      const b = this._raftBricks[i];
      if (!b.raft || !b.alive || b.inFlight) continue;
      const x = startX + b.raftHomeCol * PLAY.blockStep + offset;
      const y = PLAY.wallBaseY + b.row * PLAY.blockStep + lift + bob;
      b.node.setPosition(x, y, b.node.position.z);
      const col = Math.max(0, Math.min(this._cols - 1, Math.round((x - startX) / PLAY.blockStep)));
      if (col !== b.col) {
        b.col = col;
        moved = true;
      }
    }
    if (moved) this._reindexCols();
  }

  private _tickRaft(dt: number): void {
    if ((PLAY.raftW | 0) <= 0) return;
    this._raftT += dt;
    this._placeRaft(this._raftOffset());
  }

  private _resetItems(): void {
    this._clearPicks();
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

  private _spend(id: ItemId): void {
    if (!this._wallet?.consumeItem(id)) {
      this._emitItems();
      return;
    }
    completeGuide(id);
    this._clearPicks();
    this._emitItems();
    this._maybeAutoPlace();
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

  private _idsMatch(a: number, b: number): boolean {
    if (a === b) return true;
    const va = nearestVoxelId(this._tintOf(a));
    const vb = nearestVoxelId(this._tintOf(b));
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
    const b = this._at.get(cellKey(col, row, layer));
    if (!b?.node?.isValid || !b.node.active || b.hp <= 0 || b.inFlight) return null;
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
      if (!u.node?.isValid || !u.node.active || u.power <= 0) continue;
      if (!this._idsMatch(u.colorId, colorId)) continue;
      have += u.power;
      units.push(u);
    }
    for (let i = 0; i < this._reserve.length; i++) {
      if (this._idsMatch(parseColorToken(this._reserve[i][0]), colorId)) have += this._reserve[i][1];
    }
    let extra = have - need;
    if (extra <= 0) return;
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
      const free = Math.max(0, u.power - u.inflight);
      if (free <= 0) continue;
      const take = Math.min(free, extra);
      u.power -= take;
      extra -= take;
      u.syncPowerLabel();
      u.flashFree();
      if (u.power <= 0) this._retireColorUnit(u);
    }
    for (let i = this._reserve.length - 1; i >= 0 && extra > 0; i--) {
      const spec = this._reserve[i];
      if (!this._idsMatch(parseColorToken(spec[0]), colorId)) continue;
      const take = Math.min(spec[1], extra);
      extra -= take;
      const next = spec[1] - take;
      if (next <= 0) this._reserve.splice(i, 1);
      else this._reserve[i] = spec[2] ? [spec[0], next, spec[2]] : [spec[0], next];
    }
  }

  private _retireColorUnit(u: UnitActor): void {
    if (u.trapped) {
      u.trapped = false;
      u.node.active = false;
      return;
    }
    const benchCol = u.onBench ? u.benchCol : -1;
    this._retireUnit(u);
    if (benchCol >= 0) this._refillBenchCol(benchCol);
  }

  private _deployHooked(unit: UnitActor): boolean {
    const slot = this._hintSlot(unit);
    if (slot) {
      this._placeUnit(unit, slot);
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
      if (!u?.usable) continue;
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
    if (!owned) return false;
    unit.node.getWorldPosition(_world);
    _world.y += 0.18;
    playMergeBurst(this.node, _world);
    gameAudio()?.playRemove();
    const overflow = seat.rank >= BENCH.rows;
    const rank = overflow ? BENCH.rows - 1 : seat.rank;
    unit.lockedCol = -1;
    unit.state = 'bench';
    unit.asBlock = rank > 0;
    unit.clearAim();
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
    const r0 = front.benchRank;
    const r1 = unit.benchRank;
    front.benchRank = r1;
    unit.benchRank = r0;
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
