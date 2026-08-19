import { _decorator, Component, MeshRenderer, Vec3 } from 'cc';
import type { ColorToken } from '../game/GameConfig';
import { paintMeshRenderers } from './BrickSpecials';

const { ccclass } = _decorator;

const _pos = new Vec3();

@ccclass('DebrisBit')
export class DebrisBit extends Component {
  private readonly _vel = new Vec3();
  private _life = 0;
  private _lifeMax = 1;
  private _size = 0.28;
  private _mrs: MeshRenderer[] | null = null;

  paintToken(token: ColorToken): void {
    if (!this._mrs) this._mrs = this.node.getComponentsInChildren(MeshRenderer);
    paintMeshRenderers(this._mrs, token);
  }

  onLoad(): void {
    this.enabled = false;
  }

  get busy(): boolean {
    return this.node.active && this._life > 0;
  }

  burst(from: Vec3, colorScale = 1): void {
    this.node.setWorldPosition(
      from.x + (Math.random() - 0.5) * 0.28,
      from.y + (Math.random() - 0.5) * 0.28,
      from.z + (Math.random() - 0.5) * 0.28,
    );
    this._size = (0.22 + Math.random() * 0.16) * colorScale;
    this.node.setScale(this._size, this._size, this._size);
    this.node.setRotationFromEuler(Math.random() * 360, Math.random() * 360, Math.random() * 360);
    this._vel.set(
      (Math.random() - 0.5) * 7.4,
      3.4 + Math.random() * 4.6,
      (Math.random() - 0.5) * 7.4,
    );
    this._lifeMax = 0.52 + Math.random() * 0.28;
    this._life = this._lifeMax;
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
    const u = this._life / this._lifeMax;
    const fade = u > 0.35 ? 1 : Math.max(0.04, u / 0.35);
    const s = this._size * fade;
    this.node.setScale(s, s, s);
    if (this._life <= 0) {
      this.node.active = false;
      this.enabled = false;
    }
  }
}
