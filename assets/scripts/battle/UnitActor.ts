import { _decorator, Color, Component, Label, Layers, Node, RenderRoot2D, UITransform, Vec3 } from 'cc';
import { benchColOf, benchRankOf, ColorId, parseColorToken } from '../game/GameConfig';
import { OctopusQAnim } from './OctopusQAnim';
import { applyToyOctopus, OCTO_POWER_LOCAL } from './ToyOctopusMesh';

const { ccclass } = _decorator;

const POWER_SCALE = 0.0085;

export type UnitState = 'bench' | 'drag' | 'walk' | 'attack';

@ccclass('UnitActor')
export class UnitActor extends Component {
  colorId: ColorId = ColorId.Orange;
  power = 40;
  maxPower = 40;
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
  private _slideLeft = 0;
  private _slideDur = 0.22;
  private _prevState: UnitState = 'bench';
  private _prevPower = 40;
  private _prevInflight = 0;
  private _armed = false;
  private _powerLab: Label | null = null;
  private _shownPower = -1;

  onLoad(): void {
    this.syncFromName();
  }

  syncFromName(): void {
    this._parseName();
    this.node.getPosition(this.homePos);
    applyToyOctopus(this.node, this.colorId);
    this._q.bind(this.node, this.index);
    this._ensurePowerLabel();
    this._prevState = this.state;
    this._prevPower = this.power;
    this._prevInflight = this.inflight;
    this._armed = false;
  }

  setPowerVisible(on: boolean): void {
    const tag = this._powerLab?.node.parent;
    if (tag) tag.active = on && this.usable;
  }

  syncPowerLabel(): void {
    this._syncPowerText();
  }

  get usable(): boolean {
    return this.node.activeInHierarchy;
  }

  get onBench(): boolean {
    return this.usable && (this.state === 'bench' || this.state === 'drag');
  }

  resetHome(): void {
    this.state = 'bench';
    this.lockedCol = -1;
    this._slideLeft = 0;
    this.node.setPosition(this.homePos);
  }

  slideToHome(): void {
    this.node.getPosition(this._slideFrom);
    this._slideDur = 0.22;
    this._slideLeft = 0.22;
  }

  update(dt: number): void {
    if (!this.node.activeInHierarchy) return;
    if (this._slideLeft > 0 && this.state === 'bench') {
      this._slideLeft = Math.max(0, this._slideLeft - dt);
      const t = this._slideDur <= 0 ? 1 : 1 - this._slideLeft / this._slideDur;
      const k = t * t * (3 - 2 * t);
      this.node.setPosition(
        this._slideFrom.x + (this.homePos.x - this._slideFrom.x) * k,
        this.homePos.y,
        this._slideFrom.z + (this.homePos.z - this._slideFrom.z) * k,
      );
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
    this.benchCol = benchColOf(this.index);
    this.benchRank = benchRankOf(this.index);
    this.colorId = parseColorToken(p[2]);
    const pow = Number(p[3]);
    if (Number.isFinite(pow) && pow > 0) this.power = pow;
    this.maxPower = this.power;
  }

  private _ensurePowerLabel(): void {
    const parent = this.node.parent;
    if (parent && !parent.getComponent(RenderRoot2D)) parent.addComponent(RenderRoot2D);

    let tag = this.node.getChildByName('Power');
    if (!tag) {
      tag = new Node('Power');
      this.node.addChild(tag);
      tag.layer = Layers.Enum.UI_3D;
      const tagUt = tag.addComponent(UITransform);
      tagUt.setContentSize(48, 24);
      tagUt.hitTest = () => false;
      const text = new Node('Text');
      tag.addChild(text);
      text.layer = Layers.Enum.UI_3D;
      const textUt = text.addComponent(UITransform);
      textUt.setContentSize(48, 24);
      textUt.hitTest = () => false;
      const lab = text.addComponent(Label);
      lab.string = '0';
      lab.fontSize = 18;
      lab.lineHeight = 20;
      lab.isBold = true;
      lab.color = new Color(255, 252, 246, 255);
      lab.enableOutline = true;
      lab.outlineWidth = 2;
      lab.outlineColor = new Color(20, 24, 32, 220);
      lab.horizontalAlign = Label.HorizontalAlign.CENTER;
      lab.verticalAlign = Label.VerticalAlign.CENTER;
      lab.overflow = Label.Overflow.NONE;
      lab.useSystemFont = true;
      this._powerLab = lab;
    } else {
      this._powerLab = tag.getChildByName('Text')?.getComponent(Label) ?? null;
    }
    tag.active = true;
    tag.layer = Layers.Enum.UI_3D;
    tag.setPosition(OCTO_POWER_LOCAL);
    tag.setScale(POWER_SCALE, POWER_SCALE, POWER_SCALE);
    this._shownPower = -1;
    this._syncPowerText();
  }

  private _syncPowerText(): void {
    const lab = this._powerLab;
    if (!lab || this._shownPower === this.power) return;
    this._shownPower = this.power;
    const num = String(Math.round(this.power));
    lab.string = num;
    const w = Math.max(32, 14 + num.length * 11);
    lab.node.getComponent(UITransform)?.setContentSize(w, 18);
    lab.node.parent?.getComponent(UITransform)?.setContentSize(w, 18);
  }
}
