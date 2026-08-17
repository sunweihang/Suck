import { _decorator, Component, Vec3 } from 'cc';

const { ccclass } = _decorator;

const _pos = new Vec3();

@ccclass('DebrisBit')
export class DebrisBit extends Component {
  private readonly _vel = new Vec3();
  private _life = 0;

  get busy(): boolean {
    return this.node.active && this._life > 0;
  }

  burst(from: Vec3, colorScale = 1): void {
    this.node.setWorldPosition(
      from.x + (Math.random() - 0.5) * 0.08,
      from.y + (Math.random() - 0.5) * 0.08,
      from.z + (Math.random() - 0.5) * 0.08,
    );
    const s = (0.07 + Math.random() * 0.08) * colorScale;
    this.node.setScale(s, s, s);
    this.node.setRotationFromEuler(Math.random() * 360, Math.random() * 360, Math.random() * 360);
    this._vel.set(
      (Math.random() - 0.5) * 5.8,
      2.6 + Math.random() * 3.8,
      (Math.random() - 0.5) * 5.8,
    );
    this._life = 0.42 + Math.random() * 0.28;
    this.node.active = true;
  }

  update(dt: number): void {
    if (!this.node.active || this._life <= 0) return;
    this._life -= dt;
    this._vel.y -= 14 * dt;
    this.node.getPosition(_pos);
    _pos.x += this._vel.x * dt;
    _pos.y += this._vel.y * dt;
    _pos.z += this._vel.z * dt;
    this.node.setPosition(_pos);
    const s = Math.max(0.02, this._life * 0.35);
    this.node.setScale(s, s, s);
    if (this._life <= 0) this.node.active = false;
  }
}
