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
  Layers,
  Node,
  Prefab,
  screen,
  UITransform,
  Vec3,
} from 'cc';
import { gameAudio } from '../audio/AudioService';
import { playBaozhaBurst, preloadBaozhaBurst } from './BaozhaBurst';
import { playMergeBurst, preloadMergeBurst } from './MergeBurst';
import { playShuaxinBurst, preloadShuaxinBurst } from './ShuaxinBurst';
import { bindPowerLayer } from './PowerMark';
import {
  BENCH,
  ColorId,
  ColorToken,
  benchSeatX,
  benchSeatZ,
  GAME,
  PLAY,
  SPECIAL_SPAN,
  VIEW_Y_MAX,
  VIEW_Y_MIN,
  HOLD_U,
  forSpecialRing,
  holdGlowMask,
  tokenOfColorId,
  wallStartX,
} from '../game/GameConfig';
import { paintNodeColor } from './BrickSpecials';
import type { PlayerWallet } from '../game/PlayerWallet';
import { itemUnlocked, showsPlayHint, UnitSpec, type ItemId } from '../game/LevelCatalog';
import { SLOT_PAD_TOP } from './ToySlotMesh';
import { BlockCell } from './BlockCell';
import { DebrisBit } from './DebrisBit';
import { InkShot } from './InkShot';
import { HintHand } from './HintHand';
import { IronPlate } from './IronPlate';
import { ChestActor } from './ChestActor';
import { applyHoldGlow, applyLockNails, clearHoldGlow, clearLockLook } from './LockNails';
import { SlotPad } from './SlotPad';
import { OCTOPUS_STAND_Y } from './ToyLook';
import { UnitActor } from './UnitActor';

const { ccclass } = _decorator;

export type { ItemId };
export type ItemHudState = {
  coins: number;
  shuffle: number;
  merge: number;
  hook: number;
  shovel: number;
  hookPick: boolean;
  shovelPick: boolean;
};

const _ray = new geometry.Ray();
const _world = new Vec3();
const _tmp = new Vec3();
const _screen = new Vec3();
const PICK_R2 = 0.38 * 0.38;
const SPIN_THRESH_PX = 12;
const SPIN_FRICTION = 6.2;
const SPIN_BOX_PAD = 0.32;
const TURRET_PAD_PX = 56;
const _boxMin = new Vec3();
const _boxMax = new Vec3();

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

type PointerEvt = EventTouch | EventMouse;

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
  private _remain = 0;
  private _unitPfs = new Map<ColorToken, Prefab>();
  private _reserve: UnitSpec[] = [];
  private _bench: Node | null = null;
  private _nextUnitIndex = 0;
  private _cols = PLAY.wallCols;
  private _onWin: (() => void) | null = null;
  private _onLose: (() => void) | null = null;
  private _onItems: ((state: ItemHudState) => void) | null = null;
  private _onGoldDenied: (() => void) | null = null;
  private _wallet: PlayerWallet | null = null;
  private _hookPick = false;
  private _shovelPick = false;
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
  private _fieldCy = 0;
  private _fieldCz = 0;
  private _spinYaw = 0;
  private _spinPitch = 0;
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
  private _posedYaw = NaN;
  private _posedPitch = NaN;

  armSpawn(
    unitPfs: Map<ColorToken, Prefab>,
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
    this._onGoldDenied = opts.onGoldDenied ?? null;
    this._onChest = opts.onChest ?? null;
    this._onUnlockSlot = opts.onUnlockSlot ?? null;
    this._wallet = opts.wallet ?? null;
    this._collect();
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
    if (!on && (this._hookPick || this._shovelPick)) {
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
    this._unbindTouch();
  }

  update(dt: number): void {
    this._tickField(dt);
    this._tickRaft(dt);
    this._tickCombat(dt);
    this._refreshPlates(dt);
    this._syncHint();
  }

  private _collect(): void {
    this._blocks.length = 0;
    this._units.length = 0;
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
    this._spinYaw = 0;
    this._spinPitch = 0;
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
    if (this._hint && !showsPlayHint(PLAY.levelId)) this._hint.hide();
    this._slots.sort((a, b) => a.index - b.index);
    this._units.sort((a, b) => a.index - b.index);
    this._bench = bench;
    this._nextUnitIndex = 0;
    for (const u of this._units) {
      if (u.index >= this._nextUnitIndex) this._nextUnitIndex = u.index + 1;
    }
    this._indexBlocks();
    this._lookDirty = true;
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
      merge: this._wallet?.itemCount('merge') ?? 0,
      hook: this._wallet?.itemCount('hook') ?? 0,
      shovel: this._wallet?.itemCount('shovel') ?? 0,
      hookPick: this._hookPick,
      shovelPick: this._shovelPick,
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
    if (id === 'merge') {
      if (!this._afford('merge')) {
        this._emitItems();
        return false;
      }
      if (!this._mergeStuckSlots()) {
        this._emitItems();
        return false;
      }
      this._spend('merge');
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
    if (!this._shortestBenchSeat()) return false;
    for (const s of this._slots) {
      if (s.occupant?.usable) return true;
    }
    return false;
  }

  private _shortestBenchSeat(): { col: number; rank: number } | null {
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
    if (bestN >= BENCH.rows) return null;
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
    if (!this._playing || this._won || this._lost) return;
    if (!showsPlayHint(PLAY.levelId)) return;
    const hint = this._hint;
    if (!hint) return;
    hint.bindCamera(this._cam);
    let unit: UnitActor | null = null;
    for (const u of this._units) {
      if (u.usable && u.state === 'bench' && this._isColFront(u)) {
        unit = u;
        break;
      }
    }
    if (!unit) return;
    unit.node.getWorldPosition(_world);
    _world.y += 0.02;
    _world.z += 0.06;
    hint.placeWorld(_world, _world);
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
    for (const b of this._blocks) cols = Math.max(cols, b.col + 1);
    this._cols = Math.max(1, cols);
    this._byCol.length = 0;
    for (let i = 0; i < this._cols; i++) this._byCol.push([]);
    this._remain = 0;
    for (const b of this._blocks) {
      if (!b.alive || b.col < 0 || b.col >= this._cols) continue;
      this._byCol[b.col].push(b);
      this._remain += 1;
    }
  }

  private _unindex(block: BlockCell): void {
    const list = this._byCol[block.col];
    if (!list) return;
    const i = list.indexOf(block);
    if (i >= 0) {
      list[i] = list[list.length - 1];
      list.pop();
    }
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
    return this._hitsFieldModel(e);
  }

  private _inTurretBand(loc: { x: number; y: number }): boolean {
    const cam = this._cam;
    if (!cam) return loc.y < screen.windowSize.height * 0.42;
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
      _tmp.set(0, 0.85, GAME.slotStandZ);
      cam.worldToScreen(_tmp, _screen);
      top = _screen.y;
    }
    return loc.y <= top + TURRET_PAD_PX;
  }

  private _hitsFieldModel(e: PointerEvt): boolean {
    const field = this._field;
    if (!field || !this._aimRay(e)) return false;
    this._fieldLocalBox(_boxMin, _boxMax);
    field.inverseTransformPoint(_tmp, _ray.o);
    Vec3.scaleAndAdd(_world, _ray.o, _ray.d, 8);
    field.inverseTransformPoint(_world, _world);
    _world.subtract(_tmp);
    return rayHitsAabb(_tmp, _world, _boxMin, _boxMax);
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
    const dYaw = -dx * k;
    const dPitch = dy * k;
    this._spinYaw += dYaw;
    this._spinPitch = this._clampPitch(this._spinPitch + dPitch);
    this._spinVel = dYaw / dt;
    this._pitchVel = dPitch / dt;
  }

  private _clampPitch(pitch: number): number {
    const max = (GAME.wallSpinPitchMax * Math.PI) / 180;
    return Math.max(-max, Math.min(max, pitch));
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
    const unit = this._pickBench(e);
    if (unit) {
      this._placeOrMerge(unit);
      return;
    }
    this._tryUnlockSlot(e);
  }

  private _placeOrMerge(unit: UnitActor): void {
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

  private _placeUnit(unit: UnitActor, slot: SlotPad): void {
    gameAudio()?.playUiClick();
    slot.occupant = unit;
    unit.lockedCol = slot.homeCol;
    unit.state = 'attack';
    slot.node.getWorldPosition(_tmp);
    unit.node.setWorldPosition(_tmp.x, unit.homePos.y + SLOT_PAD_TOP, _tmp.z);
    unit.refreshPowerVisible();
    this._refillBenchCol(unit.benchCol);
    this._hint?.hide();
  }

  private _tickCombat(dt: number): void {
    if (!this._playing || this._won || this._lost) return;
    if (this._platesBreaking) return;
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
    const units = this._units;
    if (!units) return;
    for (const u of units) {
      if (!u.usable || u.state === 'bench' || u.state === 'drag' || u.power <= 0) continue;
      u.suckWait -= dt;
      u.state = 'attack';
      if (
        u.suckWait <= 0 &&
        u.inflight < GAME.suckMaxFlight &&
        u.power > u.inflight
      ) {
        const block = this._bestBlock(u);
        if (block) {
          this._shootBrick(u, block);
          u.suckWait += this._suckInterval(u);
        } else {
          this._nudgeLocked(u.colorId);
        }
      }
    }
    this._refreshRescues();
    this._refreshChests();
    this._checkStuckLose();
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

  /** 8 slots occupied and nobody can (or is) absorbing → fail. */
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
    if (this._afford('merge') && this._canMergeStuck()) return;
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
    if (!block.suckable || block.colorId !== u.colorId || u.power <= u.inflight) return;
    gameAudio()?.playAbsorb();
    const boom = block.bombed;
    const paint = block.paint;
    const magnet = block.magnet;
    const sandCol = block.col;
    const sandLayer = block.layer;
    const token = tokenOfColorId(block.colorId);
    this._unindex(block);
    if (magnet) u.magnet = true;
    if (this._sandCols.has(sandCol)) this._settleSand(sandCol, sandLayer);
    block.beginIncoming();
    u.inflight += 1;
    this._refreshLocks();
    this._refreshRescues();
    this._refreshChests();
    u.node.getWorldPosition(_tmp);
    block.node.getWorldPosition(_world);
    const dx = _world.x - _tmp.x;
    const dy = _world.y - _tmp.y;
    const dz = _world.z - _tmp.z;
    const dist = Math.hypot(dx, dy, dz) || 1;
    _tmp.x += (dx / dist) * 0.16;
    _tmp.y += (dy / dist) * 0.16 + 0.12;
    _tmp.z += (dz / dist) * 0.16;
    const dur = Math.min(GAME.shotMaxSec, Math.max(GAME.shotMinSec, dist / GAME.shotSpeed));
    this._nextShot().fire(_tmp, _world, tokenOfColorId(u.colorId), dur, GAME.shotArc, () => {
      if (!u.isValid) return;
      if (boom || paint) {
        block.beginPrimeBoom(u.node, 0.28, () => {
          if (boom) this._detonate(u, block);
          else this._paintSplash(block, u.colorId);
          this._spendShot(u);
        });
        return;
      }
      this._shatterBrick(block, token);
      this._spendShot(u);
    });
  }

  private _spendShot(u: UnitActor): void {
    u.inflight = Math.max(0, u.inflight - 1);
    u.power = Math.max(0, u.power - 1);
    u.syncPowerLabel();
    if (u.power <= 0) this._retireUnit(u);
  }

  private _shatterBrick(block: BlockCell, token: ColorToken): void {
    if (block.node.active) {
      block.node.getWorldPosition(_world);
      this._burstDebris(_world, token);
    }
    const counted = block.node.active;
    block.shatter();
    if (counted) this._remain = Math.max(0, this._remain - 1);
    this._lookDirty = true;
  }

  private _burstDebris(from: Vec3, token: ColorToken, count = 6): void {
    for (let i = 0; i < count; i++) {
      const bit = this._nextDebris();
      if (!bit) break;
      paintNodeColor(bit.node, token);
      bit.burst(from);
    }
  }

  private _nextShot(): InkShot {
    for (let i = 0; i < this._shots.length; i++) {
      if (!this._shots[i].busy) return this._shots[i];
    }
    const n = new Node(`Shot_${this._shots.length}`);
    n.layer = Layers.Enum.UI_3D;
    n.setScale(0, 0, 0);
    (this._flyRoot ?? this.node).addChild(n);
    const shot = n.addComponent(InkShot);
    n.active = false;
    this._shots.push(shot);
    return shot;
  }

  private _nextDebris(): DebrisBit | null {
    for (let i = 0; i < this._debris.length; i++) {
      if (!this._debris[i].busy) return this._debris[i];
    }
    const proto = this._debris[0];
    if (!proto?.node?.isValid) return null;
    const n = instantiate(proto.node);
    proto.node.parent?.addChild(n);
    const bit = n.getComponent(DebrisBit) ?? n.addComponent(DebrisBit);
    n.active = false;
    this._debris.push(bit);
    return bit;
  }

  private _retireUnit(u: UnitActor): void {
    for (const s of this._slots) {
      if (s.occupant === u) s.occupant = null;
    }
    u.node.getWorldPosition(_world);
    _world.y += 0.18;
    playShuaxinBurst(this.node, _world);
    gameAudio()?.playRemove();
    u.state = 'bench';
    u.lockedCol = -1;
    u.inflight = 0;
    u.node.active = false;
  }

  private _bestBlock(u: UnitActor): BlockCell | null {
    let best: BlockCell | null = null;
    let bestScore = -1e9;
    u.node.getWorldPosition(_tmp);
    const ux = _tmp.x;
    const uy = _tmp.y;
    for (let col = 0; col < this._byCol.length; col++) {
      const list = this._byCol[col];
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.colorId !== u.colorId || !b.suckable || !this._isVisible(b, u.ghost)) continue;
        b.node.getWorldPosition(_world);
        const dx = _world.x - ux;
        const dy = _world.y - uy;
        const sand = this._sandCols.has(b.col);
        const score =
          -b.layer * 20 -
          dx * dx -
          dy * dy * 0.35 +
          (sand ? -b.row : 0) +
          Math.random() * 0.01;
        if (score > bestScore) {
          bestScore = score;
          best = b;
        }
      }
    }
    return best;
  }

  private _colHasMatch(col: number, colorId: number, ghost = false): boolean {
    const list = this._byCol[col];
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.colorId === colorId && b.suckable && this._isVisible(b, ghost)) return true;
    }
    return false;
  }

  private _raftHintBias(col: number): number {
    if ((PLAY.raftW | 0) <= 0) return 0;
    const lo = PLAY.raftX + PLAY.raftTravel;
    const hi = lo + PLAY.raftW - 1;
    const a = Math.min(lo, hi);
    const b = Math.max(lo, hi);
    return col >= a && col <= b ? -4 : 1.5;
  }

  /** Exposed to camera: on screen, not behind another brick, not under a closed plate. */
  private _isVisible(block: BlockCell, ghost = false): boolean {
    if (this._plateBlocks(block.row, block.col)) return false;
    if (!this._inView(block)) return false;
    return ghost || this._frontClear(block);
  }

  /** Same-color brick that is only turned away will face the camera again. */
  private _canEventuallyAbsorb(u: UnitActor): boolean {
    for (let col = 0; col < this._byCol.length; col++) {
      const list = this._byCol[col];
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.colorId !== u.colorId || !b.suckable) continue;
        if (this._plateBlocks(b.row, b.col)) continue;
        return true;
      }
    }
    return false;
  }

  private _frontClear(block: BlockCell): boolean {
    const yaw = this._fieldYaw();
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    for (let i = 0; i < this._blocks.length; i++) {
      const o = this._blocks[i];
      if (o === block || !o.alive || o.row !== block.row) continue;
      const dCol = o.col - block.col;
      const dLayer = block.layer - o.layer;
      const closer = -dCol * s + dLayer * c;
      if (closer <= 0.2) continue;
      const side = dCol * c + dLayer * s;
      if (Math.abs(side) < 0.7) return false;
    }
    return true;
  }

  private _inView(block: BlockCell): boolean {
    block.node.getWorldPosition(_tmp);
    const half = PLAY.blockSize * 0.5;
    if (_tmp.y + half <= VIEW_Y_MIN || _tmp.y - half >= VIEW_Y_MAX) return false;
    const cam = this._cam;
    if (!cam) return true;
    cam.worldToScreen(_tmp, _screen);
    const r = cam.rect;
    const w = screen.windowSize.width;
    const h = screen.windowSize.height;
    const x0 = r.x * w;
    const y0 = r.y * h;
    const x1 = x0 + r.width * w;
    const y1 = y0 + r.height * h;
    const pad = 16;
    return (
      _screen.x >= x0 - pad &&
      _screen.x <= x1 + pad &&
      _screen.y >= y0 - pad &&
      _screen.y <= y1 + pad
    );
  }

  private _nudgeLocked(colorId: number): void {
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
      if (b.locked && b.alive && b.colorId === colorId) b.nudge();
    }
  }

  /** 3x3 blast; extra bricks fly in free and can chain into other bombs. */
  private _detonate(u: UnitActor, bomb: BlockCell): void {
    bomb.node.getWorldPosition(_world);
    playBaozhaBurst(this.node, _world, 0, 1.15);
    gameAudio()?.playBoom();
    this._popBomb(bomb);
    forSpecialRing(bomb.col, bomb.row, (x, y) => {
      const n = this._aliveAt(x, y, bomb.layer);
      if (n) this._blastAway(u, n);
    });
  }

  private _popBomb(block: BlockCell): void {
    if (block.node.active && block.hp > 0) {
      this._remain = Math.max(0, this._remain - 1);
    }
    block.hp = 0;
    block.node.active = false;
  }

  private _blastAway(u: UnitActor, block: BlockCell): void {
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
    this._shatterBrick(block, tokenOfColorId(block.colorId));
  }

  /** Whole nailed blob stays shut until no member has a free neighbor on the left, right, or top. */
  private _groupHeld(group: BlockCell[]): boolean {
    const hold: Array<readonly [number, number]> = [[-1, 0], [1, 0], [0, 1]];
    for (let i = 0; i < group.length; i++) {
      const b = group[i];
      for (let k = 0; k < hold.length; k++) {
        const n = this._aliveAt(b.col + hold[k][0], b.row + hold[k][1], b.layer);
        if (n && !n.locked) return true;
      }
    }
    return false;
  }

  private _collectLockGroup(start: BlockCell, out: BlockCell[], seen: Set<BlockCell>): void {
    const walk: Array<readonly [number, number]> = [[-1, 0], [1, 0], [0, 1], [0, -1]];
    const stack = [start];
    while (stack.length) {
      const b = stack.pop()!;
      if (seen.has(b)) continue;
      seen.add(b);
      out.push(b);
      for (let i = 0; i < walk.length; i++) {
        const n = this._aliveAt(b.col + walk[i][0], b.row + walk[i][1], b.layer);
        if (n && n.locked && !seen.has(n)) stack.push(n);
      }
    }
  }

  private _aliveAt(col: number, row: number, layer: number): BlockCell | null {
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
      if (b.col === col && b.row === row && b.layer === layer && b.alive) return b;
    }
    return null;
  }

  private _refreshLocks(): void {
    const seen = new Set<BlockCell>();
    let popped = 0;
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
      if (!b.locked || !b.alive || seen.has(b)) continue;
      const group: BlockCell[] = [];
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

  private _overUi(e: PointerEvt): boolean {
    const loc = e.getLocation();
    const hud = this._canvas?.getChildByName('PlayHud');
    const back = hud?.getChildByName('BackBtn');
    const next = hud?.getChildByName('NextBtn');
    const settings = hud?.getChildByName('SettingsBtn');
    if (back?.activeInHierarchy && back.getComponent(UITransform)?.hitTest(loc)) return true;
    if (next?.activeInHierarchy && next.getComponent(UITransform)?.hitTest(loc)) return true;
    if (settings?.activeInHierarchy && settings.getComponent(UITransform)?.hitTest(loc)) return true;
    if (this._hitsUi(hud?.getChildByName('Powers'), loc)) return true;
    if (this._hitsUi(this._canvas?.getChildByName('GoldHud'), loc)) return true;
    const gm = this._canvas?.getChildByName('GmPanel');
    if (this._hitsUi(gm?.getChildByName('Toggle'), loc)) return true;
    if (this._hitsUi(gm?.getChildByName('Dim'), loc)) return true;
    if (this._hitsUi(gm?.getChildByName('Card'), loc)) return true;
    for (const name of ['FailPanel', 'VictoryPanel', 'SettingsPanel', 'ChestPanel', 'ItemShopPanel', 'HomePanel']) {
      const n = this._canvas?.getChildByName(name);
      if (n?.activeInHierarchy) return true;
    }
    return false;
  }

  private _hitsUi(node: Node | null | undefined, loc: ReturnType<PointerEvt['getLocation']>): boolean {
    if (!node?.activeInHierarchy) return false;
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
      if (o.colorId !== unit.colorId || !this._isColFront(o)) continue;
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
      u.homePos.set(benchSeatX(col), u.homePos.y, benchSeatZ(i));
      if (u.state === 'bench') u.slideToHome();
      u.refreshPowerVisible();
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
    const pf = this._unitPfs.get(token) ?? this._unitPfs.get('o');
    if (!pf) return false;
    const index = this._nextUnitIndex++;
    const x = benchSeatX(col);
    const homeZ = benchSeatZ(rank);
    const tag = extra ? `_${extra}` : '';
    const n = instantiate(pf);
    n.name = `Unit_${String(index).padStart(2, '0')}_${token}_${power}${tag}`;
    n.setPosition(x, OCTOPUS_STAND_Y, homeZ + BENCH.stepZ);
    bench.addChild(n);
    const unit = n.getComponent(UnitActor) ?? n.addComponent(UnitActor);
    unit.syncFromName();
    unit.applySpecialLook();
    unit.benchCol = col;
    unit.benchRank = rank;
    unit.homePos.set(x, OCTOPUS_STAND_Y, homeZ);
    unit.slideToHome();
    this._units.push(unit);
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
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
      if (!b.alive || b.col < 0 || b.col >= this._cols) continue;
      this._byCol[b.col].push(b);
    }
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

  private _collectHolders(
    out: Map<BlockCell, number>,
    col: number,
    row: number,
    span = SPECIAL_SPAN,
  ): void {
    forSpecialRing(col, row, (x, y) => {
      const mask = holdGlowMask(x, y, col, row, span);
      if (!mask || mask === HOLD_U) return;
      const n = this._aliveAt(x, y, 0);
      if (n) out.set(n, (out.get(n) ?? 0) | mask);
    }, span);
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
    u.homePos.set(benchSeatX(seat.col), OCTOPUS_STAND_Y, benchSeatZ(seat.rank));
    u.flashFree();
    this.scheduleOnce(() => {
      if (!u.isValid || !u.node.isValid) return;
      u.node.getWorldPosition(_world);
      playBaozhaBurst(this.node, _world, 0, 0.82);
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
    const holders = new Map<BlockCell, number>();
    for (let i = 0; i < this._rescues.length; i++) {
      const u = this._rescues[i];
      if (u.freeing) continue;
      if (!u.trapped || !u.node.active) {
        clearLockLook(u.node);
        continue;
      }
      applyLockNails(u.node, 'octopus');
      this._collectHolders(holders, u.trapCol, u.trapRow, u.trapSpan || SPECIAL_SPAN);
    }
    for (let i = 0; i < this._chests.length; i++) {
      const c = this._chests[i];
      if (!c.trapped || c.claimed || !c.node.active) {
        if (!c.trapped) clearLockLook(c.node);
        continue;
      }
      applyLockNails(c.node, 'chest');
      this._collectHolders(holders, c.trapCol, c.trapRow, c.trapSpan || SPECIAL_SPAN);
    }
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
      const sides = holders.get(b) ?? 0;
      if (sides) applyHoldGlow(b.node, sides);
      else clearHoldGlow(b.node);
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
    this._fieldCz = GAME.wallFrontZ - Math.max(0, PLAY.wallDepth - 1) * PLAY.blockStep * 0.5;
    field.setPosition(0, this._fieldCy, this._fieldCz);
    field.setRotationFromEuler(0, 0, 0);
    for (const name of ['Wall', 'Plates', 'Raft'] as const) {
      const n = this.node.getChildByName(name) ?? field.getChildByName(name);
      if (n && n.parent !== field) n.setParent(field, true);
    }
    this._wall = field.getChildByName('Wall');
    this._platesRoot = field.getChildByName('Plates');
    this._raft = field.getChildByName('Raft');
  }

  private _fieldYaw(): number {
    return this._spinYaw;
  }

  private _tickField(dt: number): void {
    if (this._playing && !this._won && !this._lost && !this._spinning) {
      this._spinYaw += this._spinVel * dt;
      this._spinPitch = this._clampPitch(this._spinPitch + this._pitchVel * dt);
      this._spinVel *= Math.exp(-SPIN_FRICTION * dt);
      this._pitchVel *= Math.exp(-SPIN_FRICTION * dt);
      if (Math.abs(this._spinVel) < 0.04) this._spinVel = 0;
      if (Math.abs(this._pitchVel) < 0.04) this._pitchVel = 0;
      if (this._spinVel === 0) {
        const period = Math.max(4, GAME.wallSpinPeriod);
        this._spinYaw += (dt / period) * Math.PI * 2;
      }
    }
    const yaw = this._fieldYaw();
    const pitch = this._spinPitch;
    if (yaw === this._posedYaw && pitch === this._posedPitch) return;
    this._posedYaw = yaw;
    this._posedPitch = pitch;
    this._field?.setRotationFromEuler((pitch * 180) / Math.PI, (yaw * 180) / Math.PI, 0);
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
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
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
  }

  private _spend(id: ItemId): void {
    if (!this._wallet?.consumeItem(id)) {
      this._emitItems();
      return;
    }
    this._clearPicks();
    this._emitItems();
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
      u.refreshPowerVisible();
    }
    const mid = seated[seated.length >> 1];
    mid.node.getWorldPosition(_world);
    _world.y += 0.2;
    playShuaxinBurst(this.node, _world);
    gameAudio()?.playUiClick();
    return true;
  }

  private _stuckSlotUnits(): UnitActor[] {
    const out: UnitActor[] = [];
    for (const s of this._slots) {
      const u = s.occupant;
      if (!u?.usable || u.power <= 0 || u.inflight > 0) continue;
      if (this._canEventuallyAbsorb(u)) continue;
      out.push(u);
    }
    return out;
  }

  private _canMergeStuck(): boolean {
    const stuck = this._stuckSlotUnits();
    for (const u of stuck) {
      for (const s of this._slots) {
        const o = s.occupant;
        if (o && o !== u && o.usable && o.power > 0 && o.colorId === u.colorId) return true;
      }
    }
    return false;
  }

  private _mergeStuckSlots(): boolean {
    const stuck = this._stuckSlotUnits();
    if (stuck.length <= 0) return false;
    const colors = new Set<number>();
    for (const u of stuck) colors.add(u.colorId);
    let merged = false;
    for (const color of colors) {
      const mates: UnitActor[] = [];
      for (const s of this._slots) {
        const u = s.occupant;
        if (!u?.usable || u.power <= 0 || u.colorId !== color) continue;
        mates.push(u);
      }
      if (mates.length < 2) continue;
      mates.sort((a, b) => {
        const aEat = this._bestBlock(a) ? 1 : 0;
        const bEat = this._bestBlock(b) ? 1 : 0;
        if (aEat !== bEat) return bEat - aEat;
        return b.power - a.power;
      });
      const keep = mates[0];
      for (let i = 1; i < mates.length; i++) this._absorbSlotUnit(keep, mates[i]);
      merged = true;
    }
    return merged;
  }

  private _absorbSlotUnit(keep: UnitActor, add: UnitActor): void {
    keep.power += add.power;
    keep.maxPower = Math.max(keep.maxPower, keep.power);
    keep.syncPowerLabel();
    for (const s of this._slots) {
      if (s.occupant === add) s.occupant = null;
    }
    add.node.getWorldPosition(_world);
    _world.y += 0.18;
    playMergeBurst(this.node, _world);
    gameAudio()?.playUiClick();
    add.state = 'bench';
    add.lockedCol = -1;
    add.inflight = 0;
    add.node.active = false;
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

  private _shovelToBench(unit: UnitActor): boolean {
    const bench = this._bench;
    const seat = this._shortestBenchSeat();
    if (!bench || !seat) return false;
    let owned = false;
    for (const s of this._slots) {
      if (s.occupant === unit) {
        s.occupant = null;
        owned = true;
      }
    }
    if (!owned) return false;
    unit.lockedCol = -1;
    unit.state = 'bench';
    unit.benchCol = seat.col;
    unit.benchRank = seat.rank;
    unit.homePos.set(benchSeatX(seat.col), OCTOPUS_STAND_Y, benchSeatZ(seat.rank));
    unit.node.setParent(bench, true);
    unit.flyToHome();
    unit.setPowerVisible(this._playing);
    unit.node.getWorldPosition(_world);
    _world.y += 0.18;
    playMergeBurst(this.node, _world);
    gameAudio()?.playRemove();
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
    front.refreshPowerVisible();
    unit.refreshPowerVisible();
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
    return slot.unlock();
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
