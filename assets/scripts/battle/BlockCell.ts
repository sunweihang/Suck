import { _decorator, Component, Node, Quat, Vec3 } from 'cc';
import { ColorId, GAME, PLAY, parseColorToken } from '../game/GameConfig';
import { applyToyCaster } from './ToyBlockMesh';
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

@ccclass('BlockCell')
export class BlockCell extends Component {
  colorId: ColorId = ColorId.Orange;
  hp = GAME.blockHp;
  maxHp = GAME.blockHp;
  col = 0;
  row = 0;
  layer = 0;
  locked = false;

  private readonly _baseScale = new Vec3();
  private readonly _from = new Vec3();
  private readonly _vel = new Vec3();
  private readonly _q = new Quat();
  private readonly _axis = new Vec3(1, 0.3, 0.2);
  private _spin = 0;
  private _grain = 1;
  private _target: Node | null = null;
  private _sucking = false;
  private _suckT = 0;
  private _suckDur = GAME.suckFlightSec;
  private _onLand: (() => void) | null = null;
  private readonly _nudgeBase = new Vec3();
  private _nudgeT = 0;

  onLoad(): void {
    applyToyCaster(this.node);
    this.syncFromName();
  }

  syncFromName(): void {
    this._parseName();
    this.node.setScale(PLAY.blockSize, PLAY.blockSize, PLAY.blockSize);
    this.node.setRotationFromEuler(0, 0, 0);
    this._baseScale.set(this.node.scale);
    this.hp = this.maxHp = GAME.blockHp;
    this._sucking = false;
    this._target = null;
    this._onLand = null;
    this._nudgeT = 0;
    this.enabled = false;
  }

  get alive(): boolean {
    return this.node.active && this.hp > 0 && !this._sucking;
  }

  get suckable(): boolean {
    return this.alive && !this.locked;
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
    this.enabled = true;
  }

  get inFlight(): boolean {
    return this._sucking;
  }

  worldPos(out: Vec3): Vec3 {
    return this.node.getWorldPosition(out);
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
    this.enabled = true;
  }

  update(dt: number): void {
    if (this._nudgeT > 0 && !this._sucking) {
      this._nudgeT -= dt;
      if (this._nudgeT <= 0) {
        this.node.setPosition(this._nudgeBase);
        this.enabled = false;
        return;
      }
      const amp = 0.03 * (this._nudgeT / 0.28);
      this.node.setPosition(
        this._nudgeBase.x + (Math.random() - 0.5) * amp,
        this._nudgeBase.y + (Math.random() - 0.5) * amp,
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
      this.enabled = false;
      this.node.active = false;
      done?.();
    }
  }

  private _parseName(): void {
    const p = this.node.name.split('_');
    if (p.length < 5) return;
    this.colorId = parseColorToken(p[1]);
    this.col = Number(p[2]) || 0;
    this.row = Number(p[3]) || 0;
    this.layer = Number(p[4]) || 0;
    this.locked = p[5] === 'L';
  }
}
