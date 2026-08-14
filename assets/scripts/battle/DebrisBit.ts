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
    this.node.setWorldPosition(from);
    this.node.setScale(0.12 * colorScale, 0.12 * colorScale, 0.12 * colorScale);
    this._vel.set(
      (Math.random() - 0.5) * 4.2,
      2.4 + Math.random() * 3.2,
      (Math.random() - 0.5) * 4.2,
    );
    this._life = 0.45 + Math.random() * 0.25;
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
