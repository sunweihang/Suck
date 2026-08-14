import {
  _decorator,
  Camera,
  Canvas,
  Color,
  Component,
  EventMouse,
  EventTouch,
  geometry,
  input,
  Input,
  Label,
  Layers,
  Node,
  UITransform,
  Vec3,
} from 'cc';
import { GAME } from '../game/GameConfig';
import { SLOT_PAD_TOP } from './ToySlotMesh';
import { BlockCell } from './BlockCell';
import { DebrisBit } from './DebrisBit';
import { SlotPad } from './SlotPad';
import { OCTO_BACK_LOCAL } from './ToyOctopusMesh';
import { UnitActor } from './UnitActor';

const { ccclass } = _decorator;

const _ray = new geometry.Ray();
const _hit = new Vec3();
const _world = new Vec3();
const _ui = new Vec3();
const _scr = new Vec3();
const _tmp = new Vec3();
const _groundN = new Vec3(0, 1, 0);
const _groundP = new Vec3(0, 0.02, 0);

function passTouches(ut: UITransform): UITransform {
  ut.hitTest = () => false;
  return ut;
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
  private readonly _blocks: BlockCell[] = [];
  private readonly _units: UnitActor[] = [];
  private readonly _slots: SlotPad[] = [];
  private readonly _debris: DebrisBit[] = [];
  private readonly _powerLabs: Label[] = [];
  private _flyRoot: Node | null = null;
  private _winLab: Label | null = null;
  private _drag: UnitActor | null = null;
  private readonly _dragOff = new Vec3();
  private _fromTouch = false;
  private _mouseHeld = false;
  private readonly _byCol: BlockCell[][] = [];
  private _colColorN = new Uint16Array(0);
  private _remain = 0;
  private _hudDirty = true;

  bind(opts: {
    camera: Camera;
    canvas: Node;
    powerRoot: Node | null;
    winLabel: Label | null;
  }): void {
    this._cam = opts.camera;
    this._canvas = opts.canvas;
    this._winLab = opts.winLabel;
    this._collect();
    this._bindPowers(opts.powerRoot);
    this._bindTouch();
    this.setPlaying(false);
  }

  setPlaying(on: boolean): void {
    this._playing = on;
    this._hudDirty = true;
    if (this._winLab) this._winLab.node.active = this._won && on;
  }

  onDestroy(): void {
    input.off(Input.EventType.TOUCH_START, this._onTouchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
    input.off(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    input.off(Input.EventType.MOUSE_DOWN, this._onMouseDown, this);
    input.off(Input.EventType.MOUSE_MOVE, this._onMouseMove, this);
    input.off(Input.EventType.MOUSE_UP, this._onMouseUp, this);
  }

  update(dt: number): void {
    this._tickCombat(dt);
    this._syncPowerLabels();
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
    this.node.getChildByName('HintHand')?.destroy();
    this._slots.sort((a, b) => a.index - b.index);
    this._units.sort((a, b) => a.index - b.index);
    this._indexBlocks();
  }

  private _indexBlocks(): void {
    this._byCol.length = 0;
    for (let i = 0; i < GAME.wallCols; i++) this._byCol.push([]);
    this._colColorN = new Uint16Array(GAME.wallCols * 6);
    this._remain = 0;
    for (const b of this._blocks) {
      if (!b.alive || b.col < 0 || b.col >= GAME.wallCols) continue;
      this._byCol[b.col].push(b);
      this._colColorN[b.col * 6 + b.colorId] += 1;
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
    const slot = block.col * 6 + block.colorId;
    if (slot >= 0 && slot < this._colColorN.length && this._colColorN[slot] > 0) {
      this._colColorN[slot] -= 1;
    }
  }

  private _bindPowers(_ignored: Node | null): void {
    this._powerLabs.length = 0;
    const root = this._hudLayer('PowerTags');
    if (!root) return;
    root.removeAllChildren();
    this._units.forEach((unit, i) => {
      const tag = this._mkHudTag(root, `Power_${String(i).padStart(2, '0')}`);
      const lab = tag.getChildByName('Text')?.getComponent(Label);
      if (lab) {
        const num = String(Math.round(unit.power));
        lab.string = num;
        this._fitPowerChip(tag, num);
        this._powerLabs.push(lab);
      }
    });
  }

  private _hudLayer(name: string): Node | null {
    const canvas = this._canvas;
    if (!canvas) return null;
    let root = canvas.getChildByName(name);
    if (!root) {
      root = new Node(name);
      canvas.addChild(root);
      root.layer = Layers.Enum.UI_2D;
      const ut = root.addComponent(UITransform);
      ut.setContentSize(0, 0);
      passTouches(ut);
      const pad = canvas.getChildByName('TouchPad');
      if (pad) root.setSiblingIndex(pad.getSiblingIndex());
    }
    return root;
  }

  private _mkHudTag(parent: Node, name: string): Node {
    const w = 40;
    const h = 18;
    const n = new Node(name);
    parent.addChild(n);
    n.layer = Layers.Enum.UI_2D;
    passTouches(n.addComponent(UITransform)).setContentSize(w, h);
    const text = new Node('Text');
    n.addChild(text);
    text.layer = Layers.Enum.UI_2D;
    passTouches(text.addComponent(UITransform)).setContentSize(w, h);
    const lab = text.addComponent(Label);
    lab.string = '0';
    lab.fontSize = 16;
    lab.lineHeight = 18;
    lab.isBold = true;
    lab.color = new Color(255, 252, 246, 255);
    lab.enableOutline = true;
    lab.outlineWidth = 2;
    lab.outlineColor = new Color(20, 24, 32, 220);
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    lab.overflow = Label.Overflow.NONE;
    lab.useSystemFont = true;
    return n;
  }

  private _fitPowerChip(tag: Node, text: string): void {
    const w = Math.max(32, 14 + text.length * 11);
    const h = 18;
    tag.getComponent(UITransform)?.setContentSize(w, h);
    tag.getChildByName('Text')?.getComponent(UITransform)?.setContentSize(w, h);
  }

  private _worldToHud(world: Vec3, out: Vec3): boolean {
    const cam = this._cam;
    const canvas = this._canvas;
    if (!cam || !canvas) return false;
    cam.worldToScreen(world, _scr);
    const uiCam = canvas.getComponent(Canvas)?.cameraComponent;
    if (uiCam) {
      uiCam.screenToWorld(_scr, _tmp);
      canvas.inverseTransformPoint(out, _tmp);
      return true;
    }
    cam.convertToUINode(world, canvas, out);
    const ut = canvas.getComponent(UITransform);
    if (ut) {
      out.x -= ut.contentSize.width * 0.5;
      out.y -= ut.contentSize.height * 0.5;
    }
    return true;
  }

  private _bindTouch(): void {
    input.on(Input.EventType.TOUCH_START, this._onTouchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
    input.on(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    input.on(Input.EventType.MOUSE_DOWN, this._onMouseDown, this);
    input.on(Input.EventType.MOUSE_MOVE, this._onMouseMove, this);
    input.on(Input.EventType.MOUSE_UP, this._onMouseUp, this);
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
      merge.power += unit.power;
      merge.maxPower = Math.max(merge.maxPower, merge.power);
      unit.node.active = false;
      unit.state = 'bench';
      this._hudDirty = true;
      return;
    }
    const slot = this._pickSlot(_hit);
    if (slot && slot.empty) {
      slot.occupant = unit;
      unit.lockedCol = slot.homeCol;
      unit.state = 'attack';
      slot.node.getWorldPosition(_tmp);
      unit.node.setWorldPosition(_tmp.x, unit.homePos.y + SLOT_PAD_TOP, _tmp.z);
      this._hudDirty = true;
      return;
    }
    unit.resetHome();
    this._hudDirty = true;
  }

  private _tickCombat(dt: number): void {
    if (!this._playing || this._won) return;
    if (this._remain === 0) {
      this._won = true;
      if (this._winLab) {
        this._winLab.string = '墙体已拆完';
        this._winLab.node.active = true;
      }
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
    if (block.colorId !== u.colorId || u.power <= u.inflight) return;
    u.inflight += 1;
    this._unindex(block);
    if (this._flyRoot) block.node.setParent(this._flyRoot, true);
    block.beginSuck(u.node, GAME.suckFlightSec, () => {
      this._remain = Math.max(0, this._remain - 1);
      u.inflight = Math.max(0, u.inflight - 1);
      u.power = Math.max(0, u.power - 1);
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
    this._hudDirty = true;
  }

  private _bestBlock(u: UnitActor): BlockCell | null {
    const col = this._bestCol(u);
    if (col < 0) return null;
    const list = this._byCol[col];
    if (!list) return null;
    let bestLayer = 1e9;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.colorId === u.colorId && b.layer < bestLayer) bestLayer = b.layer;
    }
    if (bestLayer === 1e9) return null;
    let best: BlockCell | null = null;
    let bestScore = -1e9;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.colorId !== u.colorId || b.layer !== bestLayer) continue;
      const score = b.row * 0.4 + Math.random();
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
    const startX = -((GAME.wallCols - 1) * GAME.blockStep) / 2;
    for (let col = 0; col < this._byCol.length; col++) {
      if (!this._colHasMatch(col, u.colorId)) continue;
      const dx = startX + col * GAME.blockStep - _tmp.x;
      const score = dx * dx;
      if (score < bestScore) {
        bestScore = score;
        bestCol = col;
      }
    }
    return bestCol;
  }

  private _colHasMatch(col: number, colorId: number): boolean {
    return this._colColorN[col * 6 + colorId] > 0;
  }

  private _syncPowerLabels(): void {
    const dirty = this._hudDirty;
    this._hudDirty = false;
    for (let i = 0; i < this._powerLabs.length; i++) {
      const lab = this._powerLabs[i];
      const unit = this._units[i];
      const tag = lab?.node.parent;
      if (!lab || !tag) continue;
      if (!this._playing || !unit?.usable) {
        tag.active = false;
        continue;
      }
      const num = String(Math.round(unit.power));
      if (lab.string !== num) {
        lab.string = num;
        this._fitPowerChip(tag, num);
      }
      const moving = unit.state === 'drag';
      if (!moving && !dirty && tag.active) continue;
      unit.node.getWorldPosition(_world);
      _world.x += OCTO_BACK_LOCAL.x;
      _world.y += OCTO_BACK_LOCAL.y;
      _world.z += OCTO_BACK_LOCAL.z;
      if (!this._worldToHud(_world, _ui)) {
        tag.active = false;
        continue;
      }
      tag.setPosition(_ui.x, _ui.y, 0);
      tag.active = true;
    }
  }

  private _overBackBtn(e: PointerEvt): boolean {
    const back = this._canvas?.getChildByName('PlayHud')?.getChildByName('BackBtn');
    if (!back?.activeInHierarchy) return false;
    const ut = back.getComponent(UITransform);
    return !!ut?.hitTest(e.getLocation());
  }

  private _pickBench(e: PointerEvt): UnitActor | null {
    const cam = this._cam;
    if (!cam) return null;
    const loc = e.getLocation();
    cam.screenPointToRay(loc.x, loc.y, _ray);
    let best: UnitActor | null = null;
    let bestD = 0.38 * 0.38;
    for (const u of this._units) {
      if (!u.usable || u.state !== 'bench') continue;
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
      if (o.colorId !== unit.colorId) continue;
      o.node.getWorldPosition(_tmp);
      const d = Vec3.squaredDistance(world, _tmp);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  private _tryUnlockSlot(e: PointerEvt): boolean {
    const slot = this._pickLockedSlot(e);
    if (!slot) return false;
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
