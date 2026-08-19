import { _decorator, Component, Vec3 } from 'cc';
import { applyToyCaster } from './ToyBlockMesh';

const { ccclass } = _decorator;

@ccclass('IronPlate')
export class IronPlate extends Component {
  col = 0;
  row = 0;

  private readonly _basePos = new Vec3();
  private _shake = false;
  private _t = 0;

  onLoad(): void {
    applyToyCaster(this.node, false, false);
    this.syncFromName();
  }

  syncFromName(): void {
    const p = this.node.name.split('_');
    if (p.length < 3) return;
    this.col = Number(p[1]) || 0;
    this.row = Number(p[2]) || 0;
    this._shake = false;
    this._t = 0;
    this.enabled = false;
  }

  beginBreak(): void {
    if (!this.node.active) return;
    this.node.getPosition(this._basePos);
    this._shake = true;
    this._t = 0;
    this.enabled = true;
  }

  shatter(): void {
    this._shake = false;
    this.node.active = false;
    this.enabled = false;
  }

  update(dt: number): void {
    if (!this._shake) return;
    this._t += dt;
    const amp = 0.02 + Math.min(0.04, this._t * 0.05);
    const n = this._t * 37.7;
    this.node.setPosition(
      this._basePos.x + Math.sin(n) * amp,
      this._basePos.y + Math.cos(n * 1.31) * amp,
      this._basePos.z,
    );
  }
}
