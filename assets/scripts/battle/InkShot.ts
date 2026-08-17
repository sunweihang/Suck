import { _decorator, Color, Component, Layers, Material, MeshRenderer, Node, Vec3 } from 'cc';
import { ALL_COLOR_TOKENS, ColorToken, TOKEN_RGB } from '../game/GameConfig';
import { getToyBall } from './ToySlotMesh';

const { ccclass } = _decorator;

const _pos = new Vec3();
const _dir = new Vec3();
const SIZE = 0.078;
const TRAIL = 3;

const _mats = new Map<string, Material>();

function inkMat(token: ColorToken): Material {
  let mat = _mats.get(token);
  if (mat) return mat;
  const rgb = TOKEN_RGB[token] ?? TOKEN_RGB.o;
  const color = new Color(
    Math.min(255, rgb[0] + 48),
    Math.min(255, rgb[1] + 48),
    Math.min(255, rgb[2] + 36),
    255,
  );
  mat = new Material();
  mat.initialize({ effectName: 'builtin-standard' });
  mat.setProperty('mainColor', color);
  mat.setProperty('roughness', 0.12);
  mat.setProperty('metallic', 0);
  mat.setProperty('emissive', new Color(255, 255, 255, 255));
  mat.setProperty('emissiveScale', new Vec3(0.85, 0.85, 0.9));
  _mats.set(token, mat);
  return mat;
}

function trailMat(token: ColorToken): Material {
  const key = `${token}-trail`;
  let mat = _mats.get(key);
  if (mat) return mat;
  const rgb = TOKEN_RGB[token] ?? TOKEN_RGB.o;
  const color = new Color(
    Math.min(255, rgb[0] + 90),
    Math.min(255, rgb[1] + 90),
    Math.min(255, rgb[2] + 80),
    255,
  );
  mat = new Material();
  mat.initialize({ effectName: 'builtin-standard' });
  mat.setProperty('mainColor', color);
  mat.setProperty('roughness', 0.08);
  mat.setProperty('metallic', 0);
  mat.setProperty('emissive', new Color(255, 255, 255, 255));
  mat.setProperty('emissiveScale', new Vec3(1.15, 1.15, 1.2));
  _mats.set(key, mat);
  return mat;
}

export function preloadInkShot(): void {
  getToyBall();
  for (const token of ALL_COLOR_TOKENS) {
    inkMat(token);
    trailMat(token);
  }
}

@ccclass('InkShot')
export class InkShot extends Component {
  private readonly _from = new Vec3();
  private readonly _to = new Vec3();
  private readonly _trail: Node[] = [];
  private _t = 0;
  private _dur = 0.16;
  private _arc = 0.12;
  private _onHit: (() => void) | null = null;
  private _armed = false;

  get busy(): boolean {
    return this.node.active && this._armed;
  }

  fire(from: Vec3, to: Vec3, token: ColorToken, duration: number, arc: number, onHit?: () => void): void {
    this._from.set(from);
    this._to.set(to);
    this._t = 0;
    this._dur = Math.max(0.06, duration);
    this._arc = arc;
    this._onHit = onHit ?? null;
    this._armed = false;
    this.node.active = true;
    this.enabled = true;
    this._ensureLook(token);
    this._pose(0);
    this._armed = true;
  }

  update(dt: number): void {
    if (!this._armed) return;
    this._t += dt;
    const u = Math.min(1, this._t / this._dur);
    this._pose(u);
    if (u < 1) return;
    this._armed = false;
    this.node.active = false;
    this.enabled = false;
    const done = this._onHit;
    this._onHit = null;
    done?.();
  }

  private _pose(u: number): void {
    const k = u * (2 - u);
    const lift = Math.sin(u * Math.PI) * this._arc;
    _pos.set(
      this._from.x + (this._to.x - this._from.x) * k,
      this._from.y + (this._to.y - this._from.y) * k + lift,
      this._from.z + (this._to.z - this._from.z) * k,
    );
    this.node.setWorldPosition(_pos);
    _dir.set(this._to.x - this._from.x, this._to.y - this._from.y + lift, this._to.z - this._from.z);
    const len = Math.sqrt(_dir.lengthSqr());
    if (len > 1e-6) {
      _pos.add(_dir);
      this.node.lookAt(_pos, Math.abs(_dir.y) > len * 0.92 ? Vec3.UNIT_Z : Vec3.UP);
    }
    const streak = 2.4 + (1 - Math.abs(u - 0.4) * 1.7) * 2.1;
    this.node.setScale(SIZE * 0.58, SIZE * 0.58, SIZE * streak);
    this._placeTrail(u);
  }

  private _placeTrail(u: number): void {
    const fadeIn = u < 0.08 ? u / 0.08 : 1;
    for (let i = 0; i < this._trail.length; i++) {
      const ghost = this._trail[i];
      if (!ghost?.isValid) continue;
      ghost.setPosition(0, 0, 1.15 + i * 0.95);
      const fade = Math.max(0.22, 1 - (i + 1) * 0.24) * fadeIn;
      const s = 0.82 - i * 0.14;
      ghost.setScale(s * fade, s * fade, (1.8 + i * 0.4) * fade);
    }
  }

  private _ensureLook(token: ColorToken): void {
    this.node.layer = Layers.Enum.UI_3D;
    this._applyBall(this.node, inkMat(token));
    for (let i = 0; i < TRAIL; i++) {
      let ghost = this._trail[i];
      if (!ghost?.isValid) {
        ghost = new Node(`Trail_${i}`);
        ghost.setScale(0, 0, 0);
        this.node.addChild(ghost);
        this._trail[i] = ghost;
      }
      ghost.layer = Layers.Enum.UI_3D;
      ghost.active = true;
      this._applyBall(ghost, trailMat(token));
    }
  }

  private _applyBall(node: Node, mat: Material): void {
    let mr = node.getComponent(MeshRenderer);
    if (!mr) mr = node.addComponent(MeshRenderer);
    const mesh = getToyBall();
    if (!mesh || !mat.passes?.length) {
      mr.enabled = false;
      return;
    }
    mr.mesh = mesh;
    mr.setSharedMaterial(mat, 0);
    mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
    mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
    mr.enabled = true;
  }
}
