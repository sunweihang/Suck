import { _decorator, Component, Node, Tween, Vec3, tween } from 'cc';
import { benchColOf, benchRankOf, ColorId, SPECIAL_SPAN, parseColorToken } from '../game/GameConfig';
import { applyGhostLook } from './BrickSpecials';
import { OctopusQAnim } from './OctopusQAnim';
import { bindPowerMark, paintPowerMark, preloadPowerDigits } from './PowerMark';
import { applyToyCaster } from './ToyBlockMesh';

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

  private readonly _q = new OctopusQAnim();
  private readonly _slideFrom = new Vec3();
  private readonly _flyFromScale = new Vec3(1, 1, 1);
  private _slideLeft = 0;
  private _slideDur = 0.22;
  private _flying = false;
  private _prevState: UnitState = 'bench';
  private _prevPower = 40;
  private _prevInflight = 0;
  private _armed = false;
  private _powerTag: Node | null = null;
  private _shownPower = -1;
  private _powerOn = false;

  onLoad(): void {
    applyToyCaster(this.node, false);
    this.syncFromName();
  }

  syncFromName(): void {
    this._parseName();
    this.node.getPosition(this.homePos);
    this._q.bind(this.node, this.index);
    this._ensurePowerLabel();
    this.refreshPowerVisible();
    this._prevState = this.state;
    this._prevPower = this.power;
    this._prevInflight = this.inflight;
    this._armed = false;
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
    return this.node.activeInHierarchy && !this.trapped && !this._flying;
  }

  get onBench(): boolean {
    return this.usable && (this.state === 'bench' || this.state === 'drag');
  }

  resetHome(): void {
    this.state = 'bench';
    this.lockedCol = -1;
    this._slideLeft = 0;
    this._flying = false;
    this.node.setPosition(this.homePos);
  }

  slideToHome(): void {
    this.node.getPosition(this._slideFrom);
    this._flying = false;
    this._slideDur = 0.22;
    this._slideLeft = 0.22;
  }

  flyToHome(): void {
    this.node.getPosition(this._slideFrom);
    this.node.getScale(this._flyFromScale);
    this._flying = true;
    this._slideDur = 0.72;
    this._slideLeft = 0.72;
  }

  flashFree(): void {
    this._q.punchMerge();
    Tween.stopAllByTarget(this.node);
    const x = this.node.scale.x;
    const y = this.node.scale.y;
    const z = this.node.scale.z;
    tween(this.node)
      .to(0.07, { scale: new Vec3(x * 1.14, y * 1.14, z * 1.14) }, { easing: 'quadOut' })
      .to(0.07, { scale: new Vec3(x * 0.9, y * 0.9, z * 0.9) }, { easing: 'quadIn' })
      .to(0.07, { scale: new Vec3(x * 1.1, y * 1.1, z * 1.1) }, { easing: 'quadOut' })
      .to(0.09, { scale: new Vec3(x, y, z) }, { easing: 'quadIn' })
      .start();
  }

  update(dt: number): void {
    if (!this.node.activeInHierarchy) return;
    if (this._slideLeft > 0 && (this.state === 'bench' || this._flying)) {
      this._slideLeft = Math.max(0, this._slideLeft - dt);
      const t = this._slideDur <= 0 ? 1 : 1 - this._slideLeft / this._slideDur;
      const k = t * t * (3 - 2 * t);
      const y = this._flying
        ? this._slideFrom.y + (this.homePos.y - this._slideFrom.y) * k + Math.sin(t * Math.PI) * 0.95
        : this.homePos.y;
      this.node.setPosition(
        this._slideFrom.x + (this.homePos.x - this._slideFrom.x) * k,
        y,
        this._slideFrom.z + (this.homePos.z - this._slideFrom.z) * k,
      );
      if (this._flying) {
        const s = this._flyFromScale.x + (1 - this._flyFromScale.x) * k;
        this.node.setScale(s, s, s);
        if (this._slideLeft <= 0) {
          this._flying = false;
          this.node.setScale(1, 1, 1);
          this.node.setRotationFromEuler(0, 0, 0);
          this.node.setPosition(this.homePos);
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
        this.refreshPowerVisible();
      }
      if (this.inflight > this._prevInflight) this._q.punchSpit();
      if (this.power < this._prevPower) this._q.punchEat();
      else if (this.power > this._prevPower && this.state === 'bench') this._q.punchMerge();
      this._prevPower = this.power;
      this._prevInflight = this.inflight;
    }
    if (UnitActor.animLive || this._slideLeft > 0 || this.state === 'drag') {
      this._q.tick(dt, this.state, this.inflight);
    }
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
