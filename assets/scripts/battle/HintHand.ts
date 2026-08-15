import { _decorator, Color, Component, Graphics, UITransform, Vec3 } from 'cc';

const { ccclass } = _decorator;

const SKIN = new Color(255, 214, 176, 255);
const SKIN_HI = new Color(255, 236, 214, 255);
const NAIL = new Color(255, 132, 176, 255);
const LINE = new Color(255, 248, 230, 255);

@ccclass('HintHand')
export class HintHand extends Component {
  private readonly _base = new Vec3();
  private _t = 0;
  private _hidden = false;
  private _hasBase = false;

  onLoad(): void {
    this._paint();
  }

  hide(): void {
    this._hidden = true;
    this.node.active = false;
  }

  place(x: number, y: number): void {
    if (this._hidden) return;
    this._base.set(x, y, 0);
    this._hasBase = true;
    this.node.active = true;
  }

  update(dt: number): void {
    if (this._hidden || !this.node.active || !this._hasBase) return;
    this._t += dt;
    const tap = (Math.sin(this._t * 6.2) + 1) * 0.5;
    this.node.setPosition(this._base.x, this._base.y + 8 - tap * 22, 0);
  }

  private _paint(): void {
    let ut = this.node.getComponent(UITransform);
    if (!ut) ut = this.node.addComponent(UITransform);
    ut.setContentSize(160, 220);
    ut.setAnchorPoint(0.5, 0.08);
    let g = this.node.getComponent(Graphics);
    if (!g) g = this.node.addComponent(Graphics);
    g.clear();

    const blob = (x: number, y: number, rx: number, ry: number, fill: Color, pad = 8): void => {
      g.fillColor = LINE;
      g.ellipse(x, y, rx + pad, ry + pad);
      g.fill();
      g.fillColor = fill;
      g.ellipse(x, y, rx, ry);
      g.fill();
    };

    blob(18, 78, 22, 20, SKIN, 7);
    blob(-6, 92, 20, 18, SKIN, 7);
    blob(-28, 78, 18, 16, SKIN, 7);
    blob(42, 48, 20, 16, SKIN, 7);

    g.fillColor = LINE;
    g.roundRect(-22, -8, 44, 128, 22);
    g.fill();
    g.fillColor = SKIN;
    g.roundRect(-16, -2, 32, 116, 16);
    g.fill();
    g.fillColor = SKIN_HI;
    g.roundRect(-8, 36, 12, 52, 8);
    g.fill();

    blob(0, 58, 40, 36, SKIN, 9);
    g.fillColor = SKIN_HI;
    g.ellipse(-10, 70, 16, 10);
    g.fill();

    g.fillColor = LINE;
    g.ellipse(0, 6, 14, 16);
    g.fill();
    g.fillColor = NAIL;
    g.ellipse(0, 6, 9, 11);
    g.fill();
    g.fillColor = new Color(255, 236, 244, 255);
    g.ellipse(-3, 10, 3, 2);
    g.fill();
  }
}
