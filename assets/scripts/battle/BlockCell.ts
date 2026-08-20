import { _decorator, Component, Node, Quat, Vec3 } from 'cc';
import { ColorId, GAME, PLAY, isColorToken, parseColorToken } from '../game/GameConfig';
import { coverBrickSkin, flyBrickSkin, markBrickSkin, popBrickSkin } from './BrickSkin';
import { bindFieldNode, fieldWorldOf } from './FieldSpin';
import { applyBrickGray, applyBrickPlastic, releaseFieldBrick, wakeBrickMesh } from './ToyBlockMesh';
import { hideBlowTrail } from './BlowTrail';
import { clearLockLook } from './LockNails';

const { ccclass } = _decorator;

const _to = new Vec3();
const _dq = new Quat();
const _qOut = new Quat();

const BODY_Y = 0.15;
const GRAVITY = 26;
const FREE_U = 0.16;
const PULL_EXP = 2.35;
const SHRINK_START = 0.9;
const FLOOR_Y = 0.14;
/** Original VoxelDestroy: cube keeps size, pops, then falls. */
const BLOW_G = 17;
const _motion: BlockCell[] = [];

@ccclass('BlockCell')
export class BlockCell extends Component {
  colorId: ColorId = ColorId.Orange;
  /** Official ColorLibrary id the brick was painted with. -1 if unknown. */
  voxelId = -1;
  hp = GAME.blockHp;
  maxHp = GAME.blockHp;
  col = 0;
  row = 0;
  layer = 0;
  locked = false;
  raft = false;
  raftHomeCol = 0;
  /** Boxed in on all six sides, so no camera can ever see or target it. */
  buried = false;
  /** Old cells-level sand column: tint is baked into the color batch key. */
  sand = false;
  /** Renderer is hung, but the shared cube is not assigned yet. */
  meshless = false;

  private readonly _baseScale = new Vec3();
  private readonly _from = new Vec3();
  private readonly _vel = new Vec3();
  private readonly _q = new Quat();
  private readonly _axis = new Vec3(1, 0.3, 0.2);
  private _spin = 0;
  private _grain = 1;
  private _target: Node | null = null;
  private _sucking = false;
  private _claimed = false;
  private _blown = false;
  private _suckT = 0;
  private _suckDur = GAME.suckFlightSec;
  private _onLand: (() => void) | null = null;
  private readonly _nudgeBase = new Vec3();
  private _nudgeT = 0;
  private _grayed = false;
  private readonly _moveFrom = new Vec3();
  private readonly _moveTo = new Vec3();
  private _moveT = 0;
  private _moveDur = 0;
  private _fieldSpun = true;
  private _motion = false;

  static tickMotion(dt: number): void {
    for (let i = _motion.length - 1; i >= 0; i--) _motion[i].advance(dt);
  }

  onLoad(): void {
    applyBrickPlastic(this.node);
    this.syncFromName();
  }

  syncFromName(): void {
    this._parseName();
    const s = PLAY.blockSize;
    this.node.setScale(s, s, s);
    this.node.setRotationFromEuler(0, 0, 0);
    this._baseScale.set(this.node.scale);
    this.hp = this.maxHp = GAME.blockHp;
    this._sucking = false;
    this._claimed = false;
    this._blown = false;
    this._target = null;
    this._onLand = null;
    this._nudgeT = 0;
    this._moveDur = 0;
    hideBlowTrail(this.node);
    this._fieldSpun = true;
    bindFieldNode(this.node);
    this._restMotion();
  }

  private _armMotion(): void {
    this.enabled = false;
    if (this._motion) return;
    this._motion = true;
    _motion.push(this);
  }

  private _restMotion(): void {
    this.enabled = false;
    if (!this._motion) return;
    this._motion = false;
    const i = _motion.indexOf(this);
    if (i >= 0) {
      _motion[i] = _motion[_motion.length - 1];
      _motion.pop();
    }
  }

  beginMove(x: number, y: number, duration = 0.22): void {
    if (this._sucking || this._claimed || this._blown) return;
    this.node.getPosition(this._moveFrom);
    this._moveTo.set(x, y, this._moveFrom.z);
    if (Vec3.squaredDistance(this._moveFrom, this._moveTo) < 1e-6) return;
    this._moveT = 0;
    this._moveDur = Math.max(0.08, duration);
    markBrickSkin(this);
    this._armMotion();
  }

  get alive(): boolean {
    return this.node.active && this.hp > 0 && !this._sucking && !this._claimed && !this._blown;
  }

  get suckable(): boolean {
    return this.alive && !this.locked;
  }

  get grayed(): boolean {
    return this._grayed;
  }

  setGrayed(on: boolean): void {
    if (this._grayed === on) return;
    this._grayed = on;
    applyBrickGray(this.node, on);
    coverBrickSkin(this);
  }

  unlock(): boolean {
    if (!this.locked) return false;
    this.locked = false;
    clearLockLook(this.node);
    return true;
  }

  nudge(): void {
    if (!this.locked || this._sucking || this._nudgeT > 0) return;
    this.node.getPosition(this._nudgeBase);
    this._nudgeT = 0.28;
    markBrickSkin(this);
    this._armMotion();
  }

  get inFlight(): boolean {
    return this._sucking || this._claimed || this._blown;
  }

  get onField(): boolean {
    return this._fieldSpun;
  }

  get claimed(): boolean {
    return this._claimed;
  }

  /** Shot vanished without landing — put the brick back in play. */
  releaseClaim(): void {
    if (!this._claimed || this._sucking || this._blown) return;
    this._claimed = false;
    this.node.active = true;
    wakeBrickMesh(this.node);
    coverBrickSkin(this);
  }

  worldPos(out: Vec3): Vec3 {
    return this._fieldSpun ? fieldWorldOf(this.node, out) : this.node.getWorldPosition(out);
  }

  private _leaveField(): void {
    if (!this._fieldSpun) return;
    popBrickSkin(this);
    this._fieldSpun = false;
    releaseFieldBrick(this.node);
    flyBrickSkin(this);
  }

  /** Claimed by a shot: stay put, no longer a target. */
  beginIncoming(): void {
    if (this.locked || this._sucking || this._claimed || !this.node.active) return;
    this._claimed = true;
  }

  shatter(onDone?: () => void): void {
    this.hp = 0;
    this._claimed = false;
    this._sucking = false;
    this._blown = false;
    this._target = null;
    this._onLand = null;
    this._restMotion();
    hideBlowTrail(this.node);
    this.node.active = false;
    onDone?.();
  }

  /** Original VoxelDestroy: the cube itself tumbles away, then despawns. */
  blowOff(kick?: Vec3): void {
    this.hp = 0;
    this._claimed = false;
    this._sucking = false;
    this._blown = true;
    this._target = null;
    this._onLand = null;
    this._moveDur = 0;
    this._nudgeT = 0;
    this._leaveField();
    this.node.getWorldPosition(this._from);
    this.node.getWorldRotation(this._q);
    const kx = kick?.x ?? 0;
    const ky = kick?.y ?? 0;
    const kz = kick?.z ?? 0;
    this._vel.set(
      kx * 4.6 + (Math.random() - 0.5) * 3.4,
      Math.max(2.4, ky * 1.4 + 2.8) + Math.random() * 2.6,
      kz * 4.6 + (Math.random() - 0.5) * 3.2,
    );
    this._axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    if (this._axis.lengthSqr() < 1e-6) this._axis.set(1, 0.35, 0.2);
    this._axis.normalize();
    this._spin = (260 + Math.random() * 240) * (Math.random() < 0.5 ? -1 : 1);
    this._grain = 1;
    this._suckT = 0;
    this._suckDur = 0.92 + Math.random() * 0.28;
    this.node.setScale(this._baseScale);
    this.node.active = true;
    this._armMotion();
    hideBlowTrail(this.node);
  }

  beginSuck(target: Node, duration: number, onLand?: () => void): void {
    if (this.locked || this._sucking || !this.node.active) return;
    this._sucking = true;
    this.hp = 0;
    this._target = target;
    this._suckT = 0;
    this._suckDur = Math.max(0.28, duration * (0.88 + Math.random() * 0.28));
    this._grain = 0.94 + Math.random() * 0.06;
    this._onLand = onLand ?? null;
    this._leaveField();
    this.node.getWorldPosition(this._from);
    this.node.getWorldRotation(this._q);
    const h = Math.max(0.25, this._from.y);
    this._vel.set(
      (Math.random() - 0.5) * (1.9 + h * 0.22),
      0.22 + Math.random() * 0.48,
      0.7 + Math.random() * 1.25,
    );
    this._axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    if (this._axis.lengthSqr() < 1e-6) this._axis.set(1, 0.3, 0.2);
    this._axis.normalize();
    this._spin = (480 + Math.random() * 420) * (Math.random() < 0.5 ? -1 : 1);
    this._armMotion();
  }

  update(dt: number): void {
    this.advance(dt);
  }

  advance(dt: number): void {
    if (this._moveDur > 0 && !this._sucking) {
      this._moveT += dt;
      const u = Math.min(1, this._moveT / this._moveDur);
      const k = u * u * (3 - 2 * u);
      this.node.setPosition(
        this._moveFrom.x + (this._moveTo.x - this._moveFrom.x) * k,
        this._moveFrom.y + (this._moveTo.y - this._moveFrom.y) * k,
        this._moveFrom.z,
      );
      markBrickSkin(this);
      if (u >= 1) {
        this._moveDur = 0;
        if (this._nudgeT <= 0) this._restMotion();
      }
      return;
    }
    if (this._blown) {
      this._tickBlow(dt);
      return;
    }
    if (this._nudgeT > 0 && !this._sucking) {
      this._nudgeT -= dt;
      if (this._nudgeT <= 0) {
        this.node.setPosition(this._nudgeBase);
        markBrickSkin(this);
        this._restMotion();
        return;
      }
      markBrickSkin(this);
      const amp = 0.03 * (this._nudgeT / 0.28);
      const n = (0.28 - this._nudgeT) * 52;
      this.node.setPosition(
        this._nudgeBase.x + Math.sin(n) * amp,
        this._nudgeBase.y + Math.cos(n * 1.37) * amp,
        this._nudgeBase.z,
      );
      return;
    }
    if (!this._sucking) return;
    this._suckT += dt;
    const u = Math.min(1, this._suckT / this._suckDur);
    const t = this._suckT;
    if (this._target?.isValid) {
      this._target.getWorldPosition(_to);
      _to.y += BODY_Y;
    } else {
      _to.set(this._from);
    }

    const bx = this._from.x + this._vel.x * t;
    const by = this._from.y + this._vel.y * t - 0.5 * GRAVITY * t * t;
    const bz = this._from.z + this._vel.z * t;
    const w = u <= FREE_U ? 0 : ((u - FREE_U) / (1 - FREE_U)) ** PULL_EXP;
    let x = bx + (_to.x - bx) * w;
    let y = by + (_to.y - by) * w;
    let z = bz + (_to.z - bz) * w;
    if (y < FLOOR_Y) {
      const k = Math.min(1, 0.4 + (FLOOR_Y - y) * 3.2);
      x += (_to.x - x) * k;
      y += (_to.y - y) * k;
      z += (_to.z - z) * k;
    }
    this.node.setWorldPosition(x, y, z);

    const spinKeep = u < SHRINK_START ? 1 : Math.max(0.15, 1 - (u - SHRINK_START) / (1 - SHRINK_START));
    Quat.fromAxisAngle(_dq, this._axis, this._spin * spinKeep * dt * (Math.PI / 180));
    Quat.multiply(_qOut, _dq, this._q);
    this._q.set(_qOut);
    this.node.setWorldRotation(this._q);

    const keep = u < SHRINK_START ? 1 : Math.max(0.08, 1 - (u - SHRINK_START) / (1 - SHRINK_START));
    const s = this._grain * keep;
    this.node.setScale(this._baseScale.x * s, this._baseScale.y * s, this._baseScale.z * s);

    if (u >= 1) {
      this.node.setWorldPosition(_to);
      this._sucking = false;
      this._target = null;
      const done = this._onLand;
      this._onLand = null;
      this._restMotion();
      this.node.active = false;
      done?.();
    }
  }

  private _tickBlow(dt: number): void {
    this._suckT += dt;
    const u = Math.min(1, this._suckT / this._suckDur);
    const t = this._suckT;
    this.node.setWorldPosition(
      this._from.x + this._vel.x * t,
      this._from.y + this._vel.y * t - 0.5 * BLOW_G * t * t,
      this._from.z + this._vel.z * t,
    );
    Quat.fromAxisAngle(_dq, this._axis, this._spin * dt * (Math.PI / 180));
    Quat.multiply(_qOut, _dq, this._q);
    this._q.set(_qOut);
    this.node.setWorldRotation(this._q);
    // Original VoxelDestroyScale: brief peak, then hold size, then shrink to 0.
    let keep = 1;
    if (u < 0.09) keep = 1 + 0.2 * (u / 0.09);
    else if (u < 0.72) keep = 1.2;
    else keep = Math.max(0.06, 1.2 * (1 - (u - 0.72) / 0.28));
    this.node.setScale(this._baseScale.x * keep, this._baseScale.y * keep, this._baseScale.z * keep);
    if (u < 1) return;
    this._blown = false;
    hideBlowTrail(this.node);
    this._restMotion();
    this.node.active = false;
  }


  private _parseName(): void {
    const p = this.node.name.split('_');
    let tokenAt = 1;
    if (p.length >= 5 && isColorToken(p[1])) tokenAt = 1;
    else if (p.length >= 6 && isColorToken(p[2])) tokenAt = 2;
    else {
      tokenAt = p.findIndex((part) => isColorToken(part));
      if (tokenAt < 0) return;
    }
    this.colorId = parseColorToken(p[tokenAt]);
    this.col = Number(p[tokenAt + 1]) || 0;
    this.row = Number(p[tokenAt + 2]) || 0;
    this.layer = Number(p[tokenAt + 3]) || 0;
    const tag = p[tokenAt + 4];
    this.locked = tag === 'L';
    this.raft = tag === 'F';
    this.raftHomeCol = this.col;
  }
}
