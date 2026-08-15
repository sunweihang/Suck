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
  Label,
  Node,
  Prefab,
  UITransform,
  Vec3,
} from 'cc';
import { gameAudio } from '../audio/AudioService';
import { playMergeBurst, preloadMergeBurst } from './MergeBurst';
import { BENCH, ColorToken, benchSeatX, benchSeatZ, GAME, PLAY, randomBenchUnit, wallStartX } from '../game/GameConfig';
import { SLOT_PAD_TOP } from './ToySlotMesh';
import { BlockCell } from './BlockCell';
import { DebrisBit } from './DebrisBit';
import { HintHand } from './HintHand';
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
  private readonly _blocks: BlockCell[] = [];
  private readonly _units: UnitActor[] = [];
  private readonly _slots: SlotPad[] = [];
  private readonly _debris: DebrisBit[] = [];
  private _flyRoot: Node | null = null;
  private _winLab: Label | null = null;
  private _drag: UnitActor | null = null;
  private readonly _dragOff = new Vec3();
  private _fromTouch = false;
  private _mouseHeld = false;
  private readonly _byCol: BlockCell[][] = [];
  private readonly _colTop: number[] = [];
  private _remain = 0;
  private _unitPfs = new Map<ColorToken, Prefab>();
  private _bench: Node | null = null;
  private _nextUnitIndex = 0;
  private _cols = PLAY.wallCols;
  private _onWin: (() => void) | null = null;
  private _hint: HintHand | null = null;
  private _hintHud: Node | null = null;

  armSpawn(unitPfs: Map<ColorToken, Prefab>): void {
    this._unitPfs = unitPfs;
  }

  bind(opts: {
    camera: Camera;
    canvas: Node;
    winLabel: Label | null;
    onWin?: () => void;
  }): void {
    this._cam = opts.camera;
    this._canvas = opts.canvas;
    this._winLab = opts.winLabel;
    this._onWin = opts.onWin ?? null;
    this._collect();
    this._bindTouch();
    this.setPlaying(false);
    void preloadMergeBurst();
  }

  setPlaying(on: boolean): void {
    this._playing = on;
    if (this._winLab) this._winLab.node.active = this._won && on;
    for (const u of this._units) u.setPowerVisible(on);
  }

  onDestroy(): void {
    this._unbindTouch();
  }

  update(dt: number): void {
    this._tickCombat(dt);
    this._syncHint();
  }

  private _collect(): void {
    this._blocks.length = 0;
    this._units.length = 0;
    this._slots.length = 0;
    this._debris.length = 0;
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
    this._flyRoot = this.node.getChildByName('FlyRoot');
    this._hintHud = this._canvas?.getChildByName('PlayHud') ?? null;
    this._hint = this._hintHud?.getChildByName('HintHand')?.getComponent(HintHand) ?? null;
    if (this._hint && PLAY.levelId !== 1) this._hint.hide();
    this._slots.sort((a, b) => a.index - b.index);
    this._units.sort((a, b) => a.index - b.index);
    this._bench = bench;
    this._nextUnitIndex = 0;
    for (const u of this._units) {
      if (u.index >= this._nextUnitIndex) this._nextUnitIndex = u.index + 1;
    }
    this._indexBlocks();
  }

  private _syncHint(): void {
    if (!this._playing || this._won || PLAY.levelId !== 1) return;
    const hint = this._hint;
    const cam = this._cam;
    const hud = this._hintHud;
    if (!hint || !cam || !hud) return;
    let unit: UnitActor | null = null;
    for (const u of this._units) {
      if (u.usable && u.state === 'bench' && this._isColFront(u)) {
        unit = u;
        break;
      }
    }
    if (!unit) return;
    unit.node.getWorldPosition(_world);
    _world.y += 0.18;
    cam.convertToUINode(_world, hud, _tmp);
    hint.place(_tmp.x, _tmp.y + 28);
  }

  private _indexBlocks(): void {
    let cols = PLAY.wallCols;
    for (const b of this._blocks) cols = Math.max(cols, b.col + 1);
    this._cols = Math.max(1, cols);
    this._byCol.length = 0;
    this._colTop.length = 0;
    for (let i = 0; i < this._cols; i++) {
      this._byCol.push([]);
      this._colTop.push(-1);
    }
    this._remain = 0;
    for (const b of this._blocks) {
      if (!b.suckable || b.col < 0 || b.col >= this._cols) continue;
      this._byCol[b.col].push(b);
      if (b.row > this._colTop[b.col]) this._colTop[b.col] = b.row;
      this._remain += 1;
    }
  }

  private _unindex(block: BlockCell): void {
    const list = this._byCol[block.col];
    if (list) {
      const i = list.indexOf(block);
      if (i >= 0) {
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
    if (block.row === this._colTop[block.col]) {
      let top = -1;
      const remain = this._byCol[block.col];
      if (remain) {
        for (let i = 0; i < remain.length; i++) {
          if (remain[i].row > top) top = remain[i].row;
        }
      }
      this._colTop[block.col] = top;
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
    if (!this._playing || this._won || this._drag) return;
    if (this._overBackBtn(e)) return;
    const unit = this._pickBench(e);
    if (!unit) {
      this._tryUnlockSlot(e);
      return;
    }
    this._drag = unit;
    unit.state = 'drag';
    gameAudio()?.playUiClick();
    this._hint?.hide();
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
      return;
    }
    unit.resetHome();
  }

  private _tickCombat(dt: number): void {
    if (!this._playing || this._won) return;
    if (this._remain === 0) {
      this._won = true;
      if (this._winLab) {
        this._winLab.string = '墙体已拆完';
        this._winLab.node.active = true;
      }
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
        }
      }
    }
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
    u.state = 'bench';
    u.lockedCol = -1;
    u.inflight = 0;
    u.node.active = false;
  }

  private _bestBlock(u: UnitActor): BlockCell | null {
    const col = this._bestCol(u);
    if (col < 0) return null;
    const list = this._byCol[col];
    if (!list) return null;
    const row = this._colTop[col];
    let best: BlockCell | null = null;
    let bestScore = -1e9;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.row !== row || b.colorId !== u.colorId) continue;
      const score = -b.layer + Math.random() * 0.01;
      if (score > bestScore) {
        bestScore = score;
        best = b;
      }
    }
    return best;
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
    const row = this._colTop[col];
    if (row < 0) return false;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.row === row && b.colorId === colorId) return true;
    }
    return false;
  }

  private _overBackBtn(e: PointerEvt): boolean {
    const hud = this._canvas?.getChildByName('PlayHud');
    const back = hud?.getChildByName('BackBtn');
    const next = hud?.getChildByName('NextBtn');
    const loc = e.getLocation();
    if (back?.activeInHierarchy && back.getComponent(UITransform)?.hitTest(loc)) return true;
    if (next?.activeInHierarchy && next.getComponent(UITransform)?.hitTest(loc)) return true;
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
    const [token, power] = randomBenchUnit();
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
