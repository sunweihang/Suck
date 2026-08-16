import {
  _decorator,
  Camera,
  Component,
  EventMouse,
  EventTouch,
  geometry,
  input,
  Input,
  instantiate,
  Node,
  Prefab,
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
  tokenOfColorId,
  wallStartX,
} from '../game/GameConfig';
import { paintNodeColor } from './BrickSpecials';
import { itemUnlocked, showsPlayHint, UnitSpec, type ItemId } from '../game/LevelCatalog';
import { SLOT_PAD_TOP } from './ToySlotMesh';
import { BlockCell } from './BlockCell';
import { DebrisBit } from './DebrisBit';
import { HintHand } from './HintHand';
import { IronPlate } from './IronPlate';
import { SlotPad } from './SlotPad';
import { OCTOPUS_STAND_Y } from './ToyLook';
import { UnitActor } from './UnitActor';

const { ccclass } = _decorator;

export type { ItemId };
export type ItemHudState = {
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
const PICK_R2 = 0.38 * 0.38;

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
  private readonly _items: Record<ItemId, number> = { shuffle: 1, merge: 1, hook: 1, shovel: 1 };
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
  private _raft: Node | null = null;
  private _raftT = 0;

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
  }): void {
    this._cam = opts.camera;
    this._canvas = opts.canvas;
    bindPowerLayer(opts.canvas);
    this._onWin = opts.onWin ?? null;
    this._onLose = opts.onLose ?? null;
    this._onItems = opts.onItems ?? null;
    this._collect();
    this._bindTouch();
    this.setPlaying(false);
    void preloadMergeBurst();
    void preloadShuaxinBurst();
    void preloadBaozhaBurst();
  }

  setPlaying(on: boolean): void {
    this._playing = on;
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
    this._raftT = 0;
    this._raft = this.node.getChildByName('Raft');
    const wall = this.node.getChildByName('Wall');
    const bench = this.node.getChildByName('Bench');
    const slots = this.node.getChildByName('Slots');
    const pool = this.node.getChildByName('DebrisPool');
    wall?.children.forEach((n) => {
      if (n.name.startsWith('Rescue_')) {
        const u = n.getComponent(UnitActor);
        if (!u) return;
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
    this.node.getChildByName('Plates')?.children.forEach((n) => {
      const p = n.getComponent(IronPlate) ?? n.addComponent(IronPlate);
      p.syncFromName();
      this._plates.push(p);
    });
    this._flyRoot = this.node.getChildByName('FlyRoot');
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
    this._refreshLocks();
    this._placeRaft(0);
    this._refreshPlateGray();
    this._refreshRescues();
    this._resetItems();
  }

  itemState(): ItemHudState {
    return {
      shuffle: this._items.shuffle,
      merge: this._items.merge,
      hook: this._items.hook,
      shovel: this._items.shovel,
      hookPick: this._hookPick,
      shovelPick: this._shovelPick,
    };
  }

  useItem(id: ItemId): boolean {
    if (!this._playing || this._won || this._lost) return false;
    if (id !== 'hook' && this._hookPick) this._hookPick = false;
    if (id !== 'shovel' && this._shovelPick) this._shovelPick = false;
    if (id === 'shuffle') {
      if (this._items.shuffle <= 0 || !this._shuffleBench()) {
        this._emitItems();
        return false;
      }
      this._spend('shuffle');
      return true;
    }
    if (id === 'merge') {
      if (this._items.merge <= 0 || !this._mergeStuckSlots()) {
        this._emitItems();
        return false;
      }
      this._spend('merge');
      return true;
    }
    if (id === 'hook') {
      if (this._items.hook <= 0) {
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
      if (this._items.shovel <= 0) {
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
    _world.y += 0.28;
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
    input.on(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    input.on(Input.EventType.MOUSE_DOWN, this._onMouseDown, this);
  }

  private _unbindTouch(): void {
    input.off(Input.EventType.TOUCH_START, this._onTouchStart, this);
    input.off(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    input.off(Input.EventType.MOUSE_DOWN, this._onMouseDown, this);
  }

  private _onTouchStart(e: EventTouch): void {
    this._fromTouch = true;
    this._onTap(e);
  }

  private _onTouchEnd(): void {
    this._fromTouch = false;
  }

  private _onMouseDown(e: EventMouse): void {
    if (this._fromTouch || e.getButton() !== EventMouse.BUTTON_LEFT) return;
    this._onTap(e);
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
    if (slot) {
      this._placeUnit(unit, slot);
      return;
    }
    const merge = this._bestMerge(unit);
    if (merge) this._mergeUnit(unit, merge);
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
    this._refillBenchCol(unit.benchCol);
    this._hint?.hide();
  }

  private _tickCombat(dt: number): void {
    if (!this._playing || this._won || this._lost) return;
    if (this._platesBreaking) return;
    if (this._remain === 0) {
      if (!this._platesOpen && this._ironRows.length) return;
      this._won = true;
      this._onWin?.();
      return;
    }
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
          this._suckBrick(u, block);
          u.suckWait += this._suckInterval(u);
        } else {
          this._nudgeLocked(u.colorId);
        }
      }
    }
    this._refreshRescues();
    this._checkStuckLose();
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
      else if (u.power > 0 && this._bestBlock(u)) canAbsorb = true;
    }
    if (filled < GAME.slotMax || absorbing || canAbsorb) return;
    if (this._items.merge > 0 && this._canMergeStuck()) return;
    if (this._items.shovel > 0 && this._canShovel()) return;
    this._lost = true;
    this._onLose?.();
  }

  private _suckInterval(u: UnitActor): number {
    return Math.min(
      0.034,
      Math.max(
        GAME.suckMinInterval,
        (GAME.suckRefInterval * GAME.suckRefPower) / Math.max(8, u.maxPower * GAME.matchMul),
      ),
    );
  }

  private _suckBrick(u: UnitActor, block: BlockCell): void {
    if (!block.suckable || block.colorId !== u.colorId || u.power <= u.inflight) return;
    gameAudio()?.playAbsorb();
    const boom = block.bombed;
    const paint = block.paint;
    const magnet = block.magnet;
    const sandCol = block.col;
    const sandLayer = block.layer;
    this._unindex(block);
    if (magnet) u.magnet = true;
    if (this._sandCols.has(sandCol)) this._settleSand(sandCol, sandLayer);
    u.inflight += 1;
    this._refreshLocks();
    this._refreshRescues();
    if (boom || paint) {
      block.beginPrimeBoom(u.node, 0.28, () => {
        if (boom) this._detonate(u, block);
        else this._paintSplash(block, u.colorId);
        u.inflight = Math.max(0, u.inflight - 1);
        u.power = Math.max(0, u.power - 1);
        u.syncPowerLabel();
        if (u.power <= 0) this._retireUnit(u);
      });
      return;
    }
    if (this._flyRoot) block.node.setParent(this._flyRoot, true);
    block.beginSuck(u.node, GAME.suckFlightSec, () => {
      this._remain = Math.max(0, this._remain - 1);
      u.inflight = Math.max(0, u.inflight - 1);
      u.power = Math.max(0, u.power - 1);
      u.syncPowerLabel();
      if (u.power <= 0) this._retireUnit(u);
    });
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
    const home = this._bestCol(u);
    if (home < 0) return null;
    const lo = u.magnet ? 0 : this._spanEdge(home, u.colorId, -1, u.ghost);
    const hi = u.magnet ? this._byCol.length - 1 : this._spanEdge(home, u.colorId, 1, u.ghost);
    let best: BlockCell | null = null;
    let bestScore = -1e9;
    for (let col = lo; col <= hi; col++) {
      const list = this._byCol[col];
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.colorId !== u.colorId || !b.suckable || !this._clearAbove(b, u.ghost)) continue;
        const sand = this._sandCols.has(b.col);
        const score = (sand ? -b.row : b.row) * 1000 - b.layer * 10 - Math.abs(b.col - home) + Math.random() * 0.01;
        if (score > bestScore) {
          bestScore = score;
          best = b;
        }
      }
    }
    return best;
  }

  /** Inclusive edge of the contiguous same-color columns around `home`. */
  private _spanEdge(home: number, colorId: number, dir: -1 | 1, ghost = false): number {
    let col = home;
    const last = dir < 0 ? 0 : this._byCol.length - 1;
    while (col !== last && this._colHasMatch(col + dir, colorId, ghost)) col += dir;
    return col;
  }

  private _bestCol(u: UnitActor): number {
    if (u.lockedCol >= 0 && this._colHasMatch(u.lockedCol, u.colorId, u.ghost)) return u.lockedCol;
    u.node.getWorldPosition(_tmp);
    let bestCol = -1;
    let bestScore = 1e9;
    const startX = wallStartX(this._cols);
    for (let col = 0; col < this._byCol.length; col++) {
      if (!this._colHasMatch(col, u.colorId, u.ghost)) continue;
      if (u.lockedCol >= 0 && this._colOnlyRaft(col, u.colorId, u.ghost)) continue;
      const dx = startX + col * PLAY.blockStep - _tmp.x;
      const score = dx * dx;
      if (score < bestScore) {
        bestScore = score;
        bestCol = col;
      }
    }
    return bestCol;
  }

  private _colOnlyRaft(col: number, colorId: number, ghost = false): boolean {
    const list = this._byCol[col];
    if (!list) return false;
    let any = false;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.colorId !== colorId || !b.suckable || !this._clearAbove(b, ghost)) continue;
      if (!b.raft) return false;
      any = true;
    }
    return any;
  }

  private _colHasMatch(col: number, colorId: number, ghost = false): boolean {
    const list = this._byCol[col];
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.colorId === colorId && b.suckable && this._clearAbove(b, ghost)) return true;
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

  private _raftContact(col: number, colorId: number): boolean {
    if ((PLAY.raftW | 0) <= 0) return true;
    const list = this._byCol[col];
    if (!list) return false;
    let raft = false;
    let ground = false;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.alive || b.colorId !== colorId) continue;
      if (b.raft) raft = true;
      else ground = true;
    }
    return raft && ground;
  }

  /** Same column: no other color sits higher on this layer, or in front on this row. */
  private _clearAbove(block: BlockCell, ghost = false): boolean {
    if (this._plateBlocks(block.row, block.col)) return false;
    if ((PLAY.raftW | 0) > 0 && !this._raftContact(block.col, block.colorId)) return false;
    if (ghost) return true;
    const list = this._byCol[block.col];
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.row === block.row && o.layer < block.layer && o.colorId !== block.colorId) return false;
    }
    if (this._sandCols.has(block.col) && this._isSandBottom(block)) return true;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.layer !== block.layer || o.row <= block.row) continue;
      if (o.colorId !== block.colorId) return false;
    }
    return true;
  }

  private _isSandBottom(block: BlockCell): boolean {
    const list = this._byCol[block.col];
    if (!list) return true;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.layer === block.layer && o.row < block.row) return false;
    }
    return true;
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
    const dirs: Array<readonly [number, number]> = [
      [-1, 0], [1, 0], [0, 1], [0, -1],
      [-1, 1], [1, 1], [-1, -1], [1, -1],
    ];
    for (let i = 0; i < dirs.length; i++) {
      const n = this._aliveAt(bomb.col + dirs[i][0], bomb.row + dirs[i][1], bomb.layer);
      if (n) this._blastAway(u, n);
    }
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
    if (this._flyRoot) block.node.setParent(this._flyRoot, true);
    block.beginSuck(u.node, GAME.suckFlightSec, () => {
      this._remain = Math.max(0, this._remain - 1);
    });
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
    const gm = this._canvas?.getChildByName('GmPanel');
    if (this._hitsUi(gm?.getChildByName('Toggle'), loc)) return true;
    if (this._hitsUi(gm?.getChildByName('Dim'), loc)) return true;
    if (this._hitsUi(gm?.getChildByName('Card'), loc)) return true;
    for (const name of ['FailPanel', 'VictoryPanel', 'SettingsPanel']) {
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
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const b = this._aliveAt(col + dx, row + dy, layer);
        if (!b) continue;
        b.colorId = colorId;
        paintNodeColor(b.node, token);
      }
    }
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

  private _rescueHeld(u: UnitActor): boolean {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (this._aliveAt(u.trapCol + dx, u.trapRow + dy, 0)) return true;
      }
    }
    return false;
  }

  private _refreshRescues(): void {
    const bench = this._bench;
    if (!bench) return;
    for (let i = 0; i < this._rescues.length; i++) {
      const u = this._rescues[i];
      if (!u.trapped || this._rescueHeld(u)) continue;
      let bestCol = 0;
      let bestN = 1e9;
      for (let c = 0; c < BENCH.cols; c++) {
        let n = 0;
        for (const o of this._units) {
          if (o.onBench && o.benchCol === c) n += 1;
        }
        if (n < bestN) {
          bestN = n;
          bestCol = c;
        }
      }
      if (bestN >= BENCH.rows) continue;
      u.trapped = false;
      u.state = 'bench';
      u.benchCol = bestCol;
      u.benchRank = bestN;
      const x = benchSeatX(bestCol);
      const z = benchSeatZ(bestN);
      u.homePos.set(x, OCTOPUS_STAND_Y, z);
      u.node.setParent(bench, true);
      u.flyToHome();
      u.setPowerVisible(this._playing);
      u.node.getWorldPosition(_world);
      _world.y += 0.18;
      playMergeBurst(this.node, _world);
      gameAudio()?.playRemove();
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

  private _placeRaft(offset: number): void {
    const holder = this._raft;
    if (!holder || (PLAY.raftW | 0) <= 0) return;
    const startX = wallStartX(this._cols);
    const mid = PLAY.raftX + (PLAY.raftW - 1) * 0.5;
    const bob = Math.sin(this._raftT * 1.3) * 0.018;
    holder.setPosition(
      startX + mid * PLAY.blockStep + offset,
      PLAY.wallBaseY + PLAY.raftY * PLAY.blockStep - PLAY.blockStep * 0.52 + bob,
      GAME.wallFrontZ - 0.08,
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
    const lv = PLAY.levelId;
    this._items.shuffle = itemUnlocked('shuffle', lv) ? 1 : 0;
    this._items.merge = itemUnlocked('merge', lv) ? 1 : 0;
    this._items.hook = itemUnlocked('hook', lv) ? 1 : 0;
    this._items.shovel = itemUnlocked('shovel', lv) ? 1 : 0;
    this._clearPicks();
    this._emitItems();
  }

  private _clearPicks(): void {
    this._hookPick = false;
    this._shovelPick = false;
  }

  private _spend(id: ItemId): void {
    this._items[id] = Math.max(0, this._items[id] - 1);
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
      if (this._bestBlock(u)) continue;
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

  private _tryUnlockSlot(e: PointerEvt): boolean {
    const slot = this._pickLockedSlot(e);
    if (!slot) return false;
    slot.node.getWorldPosition(_world);
    _world.y += 0.22;
    gameAudio()?.playBoom();
    playMergeBurst(this.node, _world);
    return slot.unlock();
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
