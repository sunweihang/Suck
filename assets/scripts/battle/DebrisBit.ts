import { _decorator, Component, Vec3 } from 'cc';

const { ccclass } = _decorator;

const _pos = new Vec3();

@ccclass('DebrisBit')
export class DebrisBit extends Component {
  private readonly _vel = new Vec3();
  private _life = 0;
  private _maxLife = 0;
  private _startS = 0.24;

  onLoad(): void {
    this.enabled = false;
  }

  get busy(): boolean {
    return this.node.active && this._life > 0;
  }

  burst(from: Vec3, colorScale = 1): void {
    this.node.setWorldPosition(
      from.x + (Math.random() - 0.5) * 0.16,
      from.y + (Math.random() - 0.5) * 0.16,
      from.z + (Math.random() - 0.5) * 0.16,
    );
    this._startS = (0.22 + Math.random() * 0.2) * colorScale;
    this.node.setScale(this._startS, this._startS, this._startS);
    this.node.setRotationFromEuler(Math.random() * 360, Math.random() * 360, Math.random() * 360);
    this._vel.set(
      (Math.random() - 0.5) * 9.4,
      3.8 + Math.random() * 5.4,
      (Math.random() - 0.5) * 9.4,
    );
    this._maxLife = 0.62 + Math.random() * 0.34;
    this._life = this._maxLife;
    this.node.active = true;
    this.enabled = true;
  }

  update(dt: number): void {
    if (!this.node.active || this._life <= 0) return;
    this._life -= dt;
    this._vel.y -= 16 * dt;
    this.node.getPosition(_pos);
    _pos.x += this._vel.x * dt;
    _pos.y += this._vel.y * dt;
    _pos.z += this._vel.z * dt;
    this.node.setPosition(_pos);
    const u = this._maxLife > 0 ? Math.max(0, this._life / this._maxLife) : 0;
    const s = this._startS * (0.28 + 0.72 * u);
    this.node.setScale(s, s, s);
    if (this._life <= 0) {
      this.node.active = false;
      this.enabled = false;
    }
  }
}
