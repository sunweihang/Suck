import { _decorator, Component, Node, Vec3 } from 'cc';
import { benchColOf, benchRankOf, ColorId, SPECIAL_SPAN, parseColorToken, tokenOfColorId } from '../game/GameConfig';
import { applyGhostLook, paintUnitColor } from './BrickSpecials';
import { TurretAnim } from './TurretAnim';
import { bindPowerMark, paintPowerMark, preloadPowerDigits } from './PowerMark';
import { applyToyCaster } from './ToyBlockMesh';
import { TURRET_SCALE } from './ToyLook';
import { applyQueueBlockLook, applyTurretLook, lockQueueBlockPose } from './TurretLook';

const { ccclass } = _decorator;

export type UnitState = 'bench' | 'drag' | 'walk' | 'attack';

@ccclass('UnitActor')
export class UnitActor extends Component {
  static animLive = true;
  colorId: ColorId = ColorId.Orange;
  ghost = false;
  magnet = false;
  trapped = false;
  freeing = false;
  trapCol = -1;
  trapRow = -1;
  trapSpan = SPECIAL_SPAN;
  power = 60;
  maxPower = 60;
  index = 0;
  benchCol = 0;
  benchRank = 0;
  state: UnitState = 'bench';

  readonly homePos = new Vec3();
  readonly targetPos = new Vec3();
  lockedCol = -1;
  suckWait = 0;
  inflight = 0;

  private readonly _q = new TurretAnim();
  private readonly _slideFrom = new Vec3();
  private readonly _slideTo = new Vec3();
  private readonly _flyFromScale = new Vec3(1, 1, 1);
  private _slideLeft = 0;
  private _slideDur = 0.22;
  private _flyWait = 0;
  private _flyArc = 0;
  private _flying = false;
  private _prevState: UnitState = 'bench';
  private _prevPower = 40;
  private _prevInflight = 0;
  private _armed = false;
  private _vanish = false;
  private _powerTag: Node | null = null;
  private _shownPower = -1;
  private _powerOn = false;
  private _muzzle: Node | null = null;

  onLoad(): void {
    applyToyCaster(this.node, false, true);
    this.syncFromName();
  }

  syncFromName(): void {
    this._parseName();
    this.node.getPosition(this.homePos);
    this._q.bind(this.node, this.index);
    this.refreshSeatLook();
    this._bindMuzzle();
    this._ensurePowerLabel();
    this.refreshPowerVisible();
    this._prevState = this.state;
    this._prevPower = this.power;
    this._prevInflight = this.inflight;
    this._armed = false;
    this._vanish = false;
  }

  mouthWorld(out: Vec3): Vec3 {
    if (!this._muzzle?.isValid) this._bindMuzzle();
    if (this._muzzle?.isValid) return this._muzzle.getWorldPosition(out);
    this.node.getWorldPosition(out);
    out.y += 0.22;
    return out;
  }

  aimAt(world: Vec3): void {
    this._q.aimAt(world);
  }

  clearAim(): void {
    this._q.clearAim();
  }

  setPowerVisible(on: boolean): void {
    this._powerOn = on;
    this.refreshPowerVisible();
  }

  refreshPowerVisible(): void {
    if (!this._powerTag) return;
    this._powerTag.active = this._powerOn && (this.usable || this.trapped) && this._shouldShowPower();
  }

  syncPowerLabel(): void {
    this._syncPowerText();
  }

  rebindPower(): void {
    if (this._powerTag?.isValid) {
      this._powerTag.removeFromParent();
      this._powerTag.destroy();
    }
    this._powerTag = null;
    this._shownPower = -1;
    this._ensurePowerLabel();
    this.refreshPowerVisible();
  }

  get usable(): boolean {
    return this.node.activeInHierarchy && !this.trapped && !this._flying && !this._vanish;
  }

  get onBench(): boolean {
    return this.usable && (this.state === 'bench' || this.state === 'drag');
  }

  get traveling(): boolean {
    return this._slideLeft > 0 || this._flyWait > 0 || this._vanish;
  }

  playVanish(done?: () => void): void {
    this._vanish = true;
    this.setPowerVisible(false);
    this._q.playDie(() => {
      done?.();
    });
  }

  resetHome(): void {
    this.state = 'bench';
    this.lockedCol = -1;
    this._slideLeft = 0;
    this._flyWait = 0;
    this._flyArc = 0;
    this._flying = false;
    this._vanish = false;
    this.node.setPosition(this.homePos);
  }

  slideToHome(): void {
    this.node.getPosition(this._slideFrom);
    this._slideTo.set(this.homePos);
    this._flying = false;
    this._flyArc = 0;
    this._slideDur = 0.22;
    this._slideLeft = 0.22;
  }

  flyToHome(): void {
    this._beginFly(this.homePos, 0.72, 0.95, true);
  }

  /** Arc from the current pose to a world seat (bench → pit). */
  flyToWorld(world: Vec3, delay = 0): void {
    if (this.node.parent) this.node.parent.inverseTransformPoint(this.targetPos, world);
    else this.targetPos.set(world);
    const dx = this.targetPos.x - this.node.position.x;
    const dz = this.targetPos.z - this.node.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    this._beginFly(this.targetPos, 0.28 + Math.min(0.34, dist * 0.14), 0.32 + Math.min(0.55, dist * 0.24), false);
    this._flyWait = Math.max(0, delay);
    if (this._flyWait <= 0) this._q.punchPick();
  }

  private _beginFly(local: Vec3, dur: number, arc: number, occupy: boolean): void {
    this.node.getPosition(this._slideFrom);
    this.node.getScale(this._flyFromScale);
    this._slideTo.set(local);
    this._flying = occupy;
    this._flyArc = arc;
    this._slideDur = dur;
    this._slideLeft = dur;
  }

  flashFree(): void {
    this._q.punchMerge();
  }

  update(dt: number): void {
    if (!this.node.activeInHierarchy) return;
    if (this._flyWait > 0) {
      this._flyWait = Math.max(0, this._flyWait - dt);
      if (this._flyWait <= 0) this._q.punchPick();
    } else if (this._slideLeft > 0) {
      this._slideLeft = Math.max(0, this._slideLeft - dt);
      const t = this._slideDur <= 0 ? 1 : 1 - this._slideLeft / this._slideDur;
      const k = t * t * (3 - 2 * t);
      const lift = this._flyArc > 0 ? Math.sin(t * Math.PI) : 0;
      this.node.setPosition(
        this._slideFrom.x + (this._slideTo.x - this._slideFrom.x) * k,
        this._slideFrom.y + (this._slideTo.y - this._slideFrom.y) * k + lift * this._flyArc,
        this._slideFrom.z + (this._slideTo.z - this._slideFrom.z) * k,
      );
      if (this._flyArc > 0) {
        const s = this._flyFromScale.x + (TURRET_SCALE - this._flyFromScale.x) * k;
        this.node.setScale(s, s, s);
        if (this._slideLeft <= 0) {
          this._flying = false;
          this._flyArc = 0;
          this.node.setScale(TURRET_SCALE, TURRET_SCALE, TURRET_SCALE);
          this.node.setRotationFromEuler(0, 0, 0);
          this.node.setPosition(this._slideTo);
          this._q.punchLand();
          this.refreshPowerVisible();
        }
      }
    }
    if (!this._armed) {
      this._armed = true;
      this._prevState = this.state;
      this._prevPower = this.power;
      this._prevInflight = this.inflight;
    } else {
      if (this.state !== this._prevState) {
        if (this.state === 'drag') this._q.punchPick();
        else if (this._prevState === 'drag') this._q.punchLand();
        this._prevState = this.state;
        this.refreshSeatLook();
      }
      if (this.inflight > this._prevInflight) this._q.punchSpit();
      if (this.power < this._prevPower) this._q.punchEat();
      else if (this.power > this._prevPower && this.state === 'bench' && !this._queued()) this._q.punchMerge();
      this._prevPower = this.power;
      this._prevInflight = this.inflight;
    }
    if (this._queued()) {
      this._q.rest();
      lockQueueBlockPose(this.node);
    } else if (this._wantsAnim()) {
      this._q.tick(dt, this.state, this.inflight);
    }
  }

  private _queued(): boolean {
    return !this.trapped && this.state === 'bench' && this.benchRank > 0;
  }

  private _wantsAnim(): boolean {
    if (this.state === 'bench' && this.benchRank > 0 && !this.trapped) return false;
    if (this._vanish || this._slideLeft > 0 || this.state === 'drag' || this.state === 'walk' || this.state === 'attack') {
      return true;
    }
    if (!UnitActor.animLive || this.trapped) return false;
    return this.state === 'bench';
  }

  private _shouldShowPower(): boolean {
    if (this.trapped) return false;
    if (this.state === 'drag' || this.state === 'walk' || this.state === 'attack') return true;
    return this.state === 'bench' && this.benchRank === 0;
  }

  private _parseName(): void {
    const p = this.node.name.split('_');
    if (p.length < 3) return;
    if (p[0] === 'Rescue' && p.length >= 5) {
      this.colorId = parseColorToken(p[1]);
      this.trapCol = Number(p[2]) || 0;
      this.trapRow = Number(p[3]) || 0;
      const pow = Number(p[4]);
      if (Number.isFinite(pow) && pow > 0) this.power = pow;
      this.maxPower = this.power;
      this.trapped = true;
      return;
    }
    this.index = Number(p[1]) || 0;
    this.benchCol = benchColOf(this.index);
    this.benchRank = benchRankOf(this.index);
    this.colorId = parseColorToken(p[2]);
    const pow = Number(p[3]);
    if (Number.isFinite(pow) && pow > 0) this.power = pow;
    this.maxPower = this.power;
    this.ghost = p[4] === 'ghost';
  }

  applySpecialLook(): void {
    if (this.ghost) applyGhostLook(this.node);
  }

  refreshSeatLook(): void {
    if (this._queued()) {
      this._q.rest();
      applyQueueBlockLook(this.node, this.colorId);
    } else {
      applyTurretLook(this.node, this.colorId);
    }
    paintUnitColor(this.node, tokenOfColorId(this.colorId));
    this.refreshPowerVisible();
  }

  private _bindMuzzle(): void {
    this._muzzle = this.node.getChildByName('Rig')?.getChildByName('Body')?.getChildByName('Mouth')
      ?? this.node.getChildByName('Body')?.getChildByName('Mouth')
      ?? this.node.getChildByName('Mouth')
      ?? this.node.getChildByName('Rig')?.getChildByName('Mouth')
      ?? null;
  }

  private _ensurePowerLabel(): void {
    this._powerTag = bindPowerMark(this.node);
    this._powerTag.active = true;
    this._shownPower = -1;
    this._syncPowerText();
    preloadPowerDigits().then(() => {
      if (!this.isValid || !this._powerTag?.isValid) return;
      this._shownPower = -1;
      this._syncPowerText();
    });
  }

  private _syncPowerText(): void {
    if (!this._powerTag || this._shownPower === this.power) return;
    this._shownPower = this.power;
    paintPowerMark(this._powerTag, this.power);
  }
}
