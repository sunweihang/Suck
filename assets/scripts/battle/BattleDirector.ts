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
import { BENCH, ColorToken, benchSeatX, benchSeatZ, GAME, PLAY, wallStartX } from '../game/GameConfig';
import { isTutorialLevel } from '../game/LevelCatalog';
import { SLOT_PAD_TOP } from './ToySlotMesh';
import { BlockCell } from './BlockCell';
import { DebrisBit } from './DebrisBit';
import { HintHand } from './HintHand';
import { IronPlate } from './IronPlate';
import { SlotPad } from './SlotPad';
import { OCTOPUS_STAND_Y } from './ToyLook';
import { UnitActor } from './UnitActor';

const { ccclass } = _decorator;

const _ray = new geometry.Ray();
const _hit = new Vec3();
const _world = new Vec3();
const _tmp = new Vec3();
const _groundN = new Vec3(0, 1, 0);
const _groundP = new Vec3(0, 0.02, 0);

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
  private _drag: UnitActor | null = null;
  private readonly _dragOff = new Vec3();
  private _fromTouch = false;
  private _mouseHeld = false;
  private readonly _byCol: BlockCell[][] = [];
  private _remain = 0;
  private _unitPfs = new Map<ColorToken, Prefab>();
  private _reserve: Array<readonly [ColorToken, number]> = [];
  private _bench: Node | null = null;
  private _nextUnitIndex = 0;
  private _cols = PLAY.wallCols;
  private _onWin: (() => void) | null = null;
  private _onLose: (() => void) | null = null;
  private _hint: HintHand | null = null;
  private readonly _plates: IronPlate[] = [];
  private _ironRows: number[] = [];
  private readonly _ironGaps = new Set<number>();
  private readonly _openRows = new Set<number>();
  private _platesOpen = false;
  private _platesBreaking = false;
  private _breakingRow = -1;
  private _plateBreakT = 0;

  armSpawn(
    unitPfs: Map<ColorToken, Prefab>,
    reserve: ReadonlyArray<readonly [ColorToken, number]> = [],
  ): void {
    this._unitPfs = unitPfs;
    this._reserve = reserve.slice();
  }

  bind(opts: {
    camera: Camera;
    canvas: Node;
    onWin?: () => void;
    onLose?: () => void;
  }): void {
    this._cam = opts.camera;
    this._canvas = opts.canvas;
    bindPowerLayer(opts.canvas);
    this._onWin = opts.onWin ?? null;
    this._onLose = opts.onLose ?? null;
    this._collect();
    this._bindTouch();
    this.setPlaying(false);
    void preloadMergeBurst();
    void preloadShuaxinBurst();
    void preloadBaozhaBurst();
  }

  setPlaying(on: boolean): void {
    this._playing = on;
    for (const u of this._units) u.setPowerVisible(on);
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
    const wall = this.node.getChildByName('Wall');
    const bench = this.node.getChildByName('Bench');
    const slots = this.node.getChildByName('Slots');
    const pool = this.node.getChildByName('DebrisPool');
    wall?.children.forEach((n) => {
      const c = n.getComponent(BlockCell) ?? n.addComponent(BlockCell);
      c.syncFromName();
      this._blocks.push(c);
    });
    bench?.children.forEach((n) => {
      const c = n.getComponent(UnitActor) ?? n.addComponent(UnitActor);
      c.syncFromName();
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
    if (this._hint && !isTutorialLevel(PLAY.levelId)) this._hint.hide();
    this._slots.sort((a, b) => a.index - b.index);
    this._units.sort((a, b) => a.index - b.index);
    this._bench = bench;
    this._nextUnitIndex = 0;
    for (const u of this._units) {
      if (u.index >= this._nextUnitIndex) this._nextUnitIndex = u.index + 1;
    }
    this._indexBlocks();
    this._refreshLocks();
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
    if (!this._playing || this._won || this._lost || this._drag) return;
    if (!isTutorialLevel(PLAY.levelId)) return;
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
    const slot = this._hintSlot(unit);
    unit.node.getWorldPosition(_world);
    _world.y += 0.28;
    _world.z += 0.06;
    if (!slot) {
      hint.placeWorld(_world, _world);
      return;
    }
    slot.node.getWorldPosition(_tmp);
    _tmp.y += 0.22;
    _tmp.z += 0.04;
    hint.placeWorld(_world, _tmp);
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
      const score = dx * dx + dz * dz + (this._colHasMatch(s.homeCol, unit.colorId) ? -2 : 0);
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
    this._beginDrag(e);
  }

  private _onTouchMove(e: EventTouch): void {
    this._moveDrag(e);
  }

  private _onTouchEnd(e: EventTouch): void {
    this._endDrag(e);
    this._fromTouch = false;
  }

  private _onMouseDown(e: EventMouse): void {
    if (this._fromTouch || e.getButton() !== EventMouse.BUTTON_LEFT) return;
    this._mouseHeld = true;
    this._beginDrag(e);
  }

  private _onMouseMove(e: EventMouse): void {
    if (this._fromTouch || !this._mouseHeld) return;
    this._moveDrag(e);
  }

  private _onMouseUp(e: EventMouse): void {
    if (this._fromTouch) return;
    this._mouseHeld = false;
    this._endDrag(e);
  }

  private _beginDrag(e: PointerEvt): void {
    if (!this._playing || this._won || this._lost || this._drag) return;
    if (this._overUi(e)) return;
    const unit = this._pickBench(e);
    if (!unit) {
      this._tryUnlockSlot(e);
      return;
    }
    this._drag = unit;
    unit.state = 'drag';
    gameAudio()?.playUiClick();
    this._groundAt(e, _hit);
    Vec3.subtract(this._dragOff, unit.node.worldPosition, _hit);
  }

  private _moveDrag(e: PointerEvt): void {
    if (!this._drag) return;
    if (!this._groundAt(e, _hit)) return;
    _hit.add(this._dragOff);
    _hit.y = this._drag.homePos.y + 0.28;
    this._drag.node.setWorldPosition(_hit);
  }

  private _endDrag(e: PointerEvt): void {
    const unit = this._drag;
    this._drag = null;
    if (!unit) return;
    this._groundAt(e, _hit);
    const merge = this._pickMerge(unit, _hit);
    if (merge) {
      gameAudio()?.playUiClick();
      merge.power += unit.power;
      merge.maxPower = Math.max(merge.maxPower, merge.power);
      merge.syncPowerLabel();
      unit.node.active = false;
      unit.state = 'bench';
      this._refillBenchCol(unit.benchCol);
      return;
    }
    const slot = this._pickSlot(_hit);
    if (slot && slot.empty) {
      gameAudio()?.playUiClick();
      slot.occupant = unit;
      unit.lockedCol = slot.homeCol;
      unit.state = 'attack';
      slot.node.getWorldPosition(_tmp);
      unit.node.setWorldPosition(_tmp.x, unit.homePos.y + SLOT_PAD_TOP, _tmp.z);
      this._refillBenchCol(unit.benchCol);
      this._hint?.hide();
      return;
    }
    unit.resetHome();
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
    for (const u of this._units) {
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
    this._checkStuckLose();
  }

  /** 8 slots occupied and nobody can (or is) absorbing → fail. */
  private _checkStuckLose(): void {
    if (this._won || this._lost || this._drag || this._platesBreaking) return;
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
    u.inflight += 1;
    gameAudio()?.playAbsorb();
    this._unindex(block);
    this._refreshLocks();
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
    if (this._drag === u) this._drag = null;
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
    const lo = this._spanEdge(home, u.colorId, -1);
    const hi = this._spanEdge(home, u.colorId, 1);
    let best: BlockCell | null = null;
    let bestScore = -1e9;
    for (let col = lo; col <= hi; col++) {
      const list = this._byCol[col];
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.colorId !== u.colorId || !b.suckable || !this._clearAbove(b)) continue;
        // Same-color span: peel the top row first so one strip is not tunneled.
        const score = b.row * 1000 - b.layer * 10 - Math.abs(b.col - home) + Math.random() * 0.01;
        if (score > bestScore) {
          bestScore = score;
          best = b;
        }
      }
    }
    return best;
  }

  /** Inclusive edge of the contiguous same-color columns around `home`. */
  private _spanEdge(home: number, colorId: number, dir: -1 | 1): number {
    let col = home;
    const last = dir < 0 ? 0 : this._byCol.length - 1;
    while (col !== last && this._colHasMatch(col + dir, colorId)) col += dir;
    return col;
  }

  private _bestCol(u: UnitActor): number {
    if (u.lockedCol >= 0 && this._colHasMatch(u.lockedCol, u.colorId)) return u.lockedCol;
    u.node.getWorldPosition(_tmp);
    let bestCol = -1;
    let bestScore = 1e9;
    const startX = wallStartX(this._cols);
    for (let col = 0; col < this._byCol.length; col++) {
      if (!this._colHasMatch(col, u.colorId)) continue;
      const dx = startX + col * PLAY.blockStep - _tmp.x;
      const score = dx * dx;
      if (score < bestScore) {
        bestScore = score;
        bestCol = col;
      }
    }
    return bestCol;
  }

  private _colHasMatch(col: number, colorId: number): boolean {
    const list = this._byCol[col];
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.colorId === colorId && b.suckable && this._clearAbove(b)) return true;
    }
    return false;
  }

  /** Same column + layer: no other color sits higher than this block. */
  private _clearAbove(block: BlockCell): boolean {
    if (this._plateBlocks(block.row, block.col)) return false;
    const list = this._byCol[block.col];
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.layer !== block.layer || o.row <= block.row) continue;
      if (o.colorId !== block.colorId) return false;
    }
    return true;
  }

  private _nudgeLocked(colorId: number): void {
    for (let i = 0; i < this._blocks.length; i++) {
      const b = this._blocks[i];
      if (b.locked && b.alive && b.colorId === colorId) b.nudge();
    }
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
    if (this._platesOpen || this._ironRows.length === 0) return;
    if (this._platesBreaking) {
      this._plateBreakT += dt;
      if (this._plateBreakT >= 0.72) {
        for (let i = 0; i < this._plates.length; i++) {
          if (this._plates[i].row === this._breakingRow) this._plates[i].shatter();
        }
      }
      if (this._plateBreakT >= 1.2) {
        this._openRows.add(this._breakingRow);
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
    if (back?.activeInHierarchy && back.getComponent(UITransform)?.hitTest(loc)) return true;
    if (next?.activeInHierarchy && next.getComponent(UITransform)?.hitTest(loc)) return true;
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

  private _pickBench(e: PointerEvt): UnitActor | null {
    const cam = this._cam;
    if (!cam) return null;
    const loc = e.getLocation();
    cam.screenPointToRay(loc.x, loc.y, _ray);
    let best: UnitActor | null = null;
    let bestD = 0.38 * 0.38;
    for (const u of this._units) {
      if (!u.usable || u.state !== 'bench' || !this._isColFront(u)) continue;
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

  private _pickMerge(unit: UnitActor, world: Vec3): UnitActor | null {
    let best: UnitActor | null = null;
    let bestD = 0.42 * 0.42;
    for (const o of this._units) {
      if (o === unit || !o.usable || o.state !== 'bench') continue;
      if (o.colorId !== unit.colorId || !this._isColFront(o)) continue;
      o.node.getWorldPosition(_tmp);
      const d = Vec3.squaredDistance(world, _tmp);
      if (d < bestD) {
        bestD = d;
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
    const [token, power] = next;
    const pf = this._unitPfs.get(token) ?? this._unitPfs.get('o');
    if (!pf) return false;
    const index = this._nextUnitIndex++;
    const x = benchSeatX(col);
    const homeZ = benchSeatZ(rank);
    const n = instantiate(pf);
    n.name = `Unit_${String(index).padStart(2, '0')}_${token}_${power}`;
    n.setPosition(x, OCTOPUS_STAND_Y, homeZ + BENCH.stepZ);
    bench.addChild(n);
    const unit = n.getComponent(UnitActor) ?? n.addComponent(UnitActor);
    unit.syncFromName();
    unit.benchCol = col;
    unit.benchRank = rank;
    unit.homePos.set(x, OCTOPUS_STAND_Y, homeZ);
    unit.slideToHome();
    this._units.push(unit);
    unit.setPowerVisible(this._playing);
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
    const cam = this._cam;
    if (!cam) return null;
    const loc = e.getLocation();
    cam.screenPointToRay(loc.x, loc.y, _ray);
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

  private _pickSlot(world: Vec3): SlotPad | null {
    let best: SlotPad | null = null;
    let bestD = GAME.slotPickR * GAME.slotPickR;
    for (const s of this._slots) {
      if (!s.open) continue;
      s.node.getWorldPosition(_tmp);
      const dx = _tmp.x - world.x;
      const dz = _tmp.z - world.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  private _groundAt(e: PointerEvt, out: Vec3): boolean {
    const cam = this._cam;
    if (!cam) return false;
    const loc = e.getLocation();
    cam.screenPointToRay(loc.x, loc.y, _ray);
    const den = Vec3.dot(_ray.d, _groundN);
    if (Math.abs(den) < 1e-5) return false;
    const t = Vec3.dot(Vec3.subtract(_tmp, _groundP, _ray.o), _groundN) / den;
    if (t < 0) return false;
    Vec3.scaleAndAdd(out, _ray.o, _ray.d, t);
    return true;
  }
}
