import { _decorator, Camera, Color, Component, Layers, Material, MeshRenderer, Node, Prefab, Quat, Vec3, assetManager, director, gfx, instantiate } from 'cc';
import { ColorToken, TOKEN_RGB } from '../game/GameConfig';
import { PREFAB_UUID } from './PrefabCatalog';
import { getToyBall } from './ToySlotMesh';

const { ccclass } = _decorator;

const _pos = new Vec3();
const _dir = new Vec3();
const _rot = new Quat();
const SIZE = 0.15;
const FRONT = 0.22;
const _camP = new Vec3();
let _cam: Node | null = null;

const _mats = new Map<string, Material>();
let _prefab: Prefab | null = null;
let _boot: Promise<void> | null = null;

function makeMat(token: ColorToken, extra: number, emit: number, alpha: number): Material {
  const rgb = TOKEN_RGB[token] ?? TOKEN_RGB.o;
  const color = new Color(
    Math.min(255, rgb[0] + extra),
    Math.min(255, rgb[1] + extra),
    Math.min(255, rgb[2] + extra * 0.75),
    alpha,
  );
  const mat = new Material();
  mat.initialize({ effectName: 'builtin-standard' });
  try {
    mat.overridePipelineStates({
      priority: 255,
      depthStencilState: {
        depthTest: false,
        depthWrite: false,
        depthFunc: gfx.ComparisonFunc.ALWAYS,
      },
    });
  } catch {
    /* keep default depth if override is unavailable */
  }
  mat.setProperty('mainColor', color);
  mat.setProperty('roughness', 0.12);
  mat.setProperty('metallic', 0);
  mat.setProperty('emissive', new Color(255, 255, 255, 255));
  mat.setProperty('emissiveScale', new Vec3(emit, emit, emit));
  return mat;
}

function playCam(): Node | null {
  if (_cam?.isValid) return _cam;
  const scene = director.getScene();
  if (!scene) return null;
  const named = scene.getChildByName('Main Camera');
  if (named) {
    _cam = named;
    return _cam;
  }
  _cam = scene.getComponentInChildren(Camera)?.node ?? null;
  return _cam;
}

function inkMat(token: ColorToken): Material {
  let mat = _mats.get(token);
  if (mat?.passes?.length) return mat;
  mat = makeMat(token, 48, 0.9, 255);
  _mats.set(token, mat);
  return mat;
}

function trailMat(token: ColorToken): Material {
  const key = `${token}-trail`;
  let mat = _mats.get(key);
  if (mat?.passes?.length) return mat;
  mat = makeMat(token, 90, 1.2, 180);
  _mats.set(key, mat);
  return mat;
}

function applyBall(node: Node, mat: Material): void {
  let mr = node.getComponent(MeshRenderer);
  if (!mr) mr = node.addComponent(MeshRenderer);
  const mesh = getToyBall();
  if (!mesh) return;
  mr.mesh = mesh;
  mr.setSharedMaterial(mat, 0);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  mr.enabled = true;
}

export function preloadInkShot(): Promise<void> {
  if (_boot) return _boot;
  getToyBall();
  _boot = new Promise((resolve) => {
    assetManager.loadAny({ uuid: PREFAB_UUID.InkShot }, (_err, asset) => {
      _prefab = (asset as Prefab) ?? null;
      resolve();
    });
  });
  return _boot;
}

export function createInkShot(host: Node): InkShot {
  const node = _prefab ? instantiate(_prefab) : new Node('InkShot');
  node.layer = Layers.Enum.UI_3D;
  node.active = false;
  host.addChild(node);
  return node.getComponent(InkShot) ?? node.addComponent(InkShot);
}

@ccclass('InkShot')
export class InkShot extends Component {
  private readonly _from = new Vec3();
  private readonly _to = new Vec3();
  private _trail: Node | null = null;
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

  private _ensureLook(token: ColorToken): void {
    this.node.layer = Layers.Enum.UI_3D;
    applyBall(this.node, inkMat(token));
    let trail = this.node.getChildByName('Trail');
    if (!trail) {
      trail = new Node('Trail');
      this.node.addChild(trail);
    }
    trail.layer = Layers.Enum.UI_3D;
    trail.active = true;
    trail.setPosition(0, 0, -1.35);
    trail.setScale(0.4, 0.4, 2.6);
    applyBall(trail, trailMat(token));
    this._trail = trail;
  }

  private _pose(u: number): void {
    const k = u * (2 - u);
    const lift = Math.sin(u * Math.PI) * this._arc;
    const dx = this._to.x - this._from.x;
    const dy = this._to.y - this._from.y;
    const dz = this._to.z - this._from.z;
    _pos.set(this._from.x + dx * k, this._from.y + dy * k + lift, this._from.z + dz * k);
    const cam = playCam();
    if (cam?.isValid) {
      cam.getWorldPosition(_camP);
      const cx = _camP.x - _pos.x;
      const cy = _camP.y - _pos.y;
      const cz = _camP.z - _pos.z;
      const clen = Math.hypot(cx, cy, cz) || 1;
      _pos.x += (cx / clen) * FRONT;
      _pos.y += (cy / clen) * FRONT;
      _pos.z += (cz / clen) * FRONT;
    }
    this.node.setWorldPosition(_pos);
    const dk = 2 - 2 * u;
    _dir.set(dx * dk, dy * dk + Math.PI * Math.cos(u * Math.PI) * this._arc, dz * dk);
    if (_dir.lengthSqr() > 1e-8) {
      Vec3.normalize(_dir, _dir);
      Quat.rotationTo(_rot, Vec3.UNIT_Z, _dir);
      this.node.setWorldRotation(_rot);
    }
    this.node.setScale(SIZE, SIZE, SIZE);
    if (this._trail?.isValid) {
      const fade = u < 0.08 ? u / 0.08 : 1;
      this._trail.setPosition(0, 0, -1.35);
      this._trail.setScale(0.4 * fade, 0.4 * fade, 2.6 * fade);
    }
  }
}
