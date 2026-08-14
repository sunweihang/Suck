import { _decorator, Component, Vec3 } from 'cc';
import { ColorId, parseColorToken } from '../game/GameConfig';
import { OctopusQAnim } from './OctopusQAnim';
import { applyToyOctopus } from './ToyOctopusMesh';

const { ccclass } = _decorator;

export type UnitState = 'bench' | 'drag' | 'walk' | 'attack';

@ccclass('UnitActor')
export class UnitActor extends Component {
  colorId: ColorId = ColorId.Orange;
  power = 40;
  maxPower = 40;
  index = 0;
  state: UnitState = 'bench';

  readonly homePos = new Vec3();
  readonly targetPos = new Vec3();
  lockedCol = -1;
  suckWait = 0;
  inflight = 0;

  private readonly _q = new OctopusQAnim();
  private _prevState: UnitState = 'bench';
  private _prevPower = 40;
  private _prevInflight = 0;
  private _armed = false;

  onLoad(): void {
    this.syncFromName();
  }

  syncFromName(): void {
    this._parseName();
    this.node.getPosition(this.homePos);
    applyToyOctopus(this.node, this.colorId);
    this._q.bind(this.node, this.index);
    this._prevState = this.state;
    this._prevPower = this.power;
    this._prevInflight = this.inflight;
    this._armed = false;
  }

  get usable(): boolean {
    return this.node.activeInHierarchy;
  }

  resetHome(): void {
    this.state = 'bench';
    this.lockedCol = -1;
    this.node.setPosition(this.homePos);
  }

  update(dt: number): void {
    if (!this.node.activeInHierarchy) return;
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
      }
      if (this.inflight > this._prevInflight) this._q.punchInhale();
      if (this.power < this._prevPower) this._q.punchEat();
      else if (this.power > this._prevPower && this.state === 'bench') this._q.punchMerge();
      this._prevPower = this.power;
      this._prevInflight = this.inflight;
    }
    this._q.tick(dt, this.state, this.inflight);
  }

  private _parseName(): void {
    const p = this.node.name.split('_');
    if (p.length < 3) return;
    this.index = Number(p[1]) || 0;
    this.colorId = parseColorToken(p[2]);
    const pow = Number(p[3]);
    if (Number.isFinite(pow) && pow > 0) this.power = pow;
    this.maxPower = this.power;
  }
}
