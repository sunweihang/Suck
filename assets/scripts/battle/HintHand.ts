import { _decorator, Component, Vec3 } from 'cc';
import { applyToyHand } from './ToySlotMesh';

const { ccclass } = _decorator;

@ccclass('HintHand')
export class HintHand extends Component {
  private readonly _base = new Vec3();
  private _t = 0;
  private _hidden = false;

  onLoad(): void {
    applyToyHand(this.node);
    this.node.getPosition(this._base);
  }

  hide(): void {
    this._hidden = true;
    this.node.active = false;
  }

  update(dt: number): void {
    if (this._hidden || !this.node.active) return;
    this._t += dt;
    this.node.setPosition(
      this._base.x,
      this._base.y + Math.sin(this._t * 4.2) * 0.12,
      this._base.z,
    );
  }
}
