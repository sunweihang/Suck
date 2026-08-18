import {
  _decorator,
  Camera,
  Color,
  Component,
  ImageAsset,
  Layers,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Prefab,
  Quat,
  Texture2D,
  Vec3,
  Director,
  assetManager,
  director,
  game,
  gfx,
  instantiate,
  resources,
  utils,
} from 'cc';
import { PREFAB_UUID } from './PrefabCatalog';

const { ccclass } = _decorator;

const _pos = new Vec3();
const _dir = new Vec3();
const _camP = new Vec3();
const _toCam = new Vec3();
const _axisX = new Vec3();
const _axisY = new Vec3();
const _axisZ = new Vec3();
const _rot = new Quat();
const _fallback = new Vec3(0, 0, -1);

/** Soft comet: small orb + short faded tail. Original video streak ~88px. */
const BALL = 0.11;
const GLOW = 0.22;
const TRAIL_W = 0.048;
const HAZE_W = 0.13;
const TRAIL_LEN = 0.68;
const HAZE_LEN = 0.5;
const MUZZLE = 0.13;
const HIT_LIFE = 0.14;
const HIT_S0 = 0.16;
const HIT_S1 = 0.4;
const MUZZLE_COLS = 3;
const MUZZLE_ROWS = 4;
const MUZZLE_FRAMES = 12;
const MUZZLE_FPS = 48;

let _glowQuad: Mesh | null = null;
let _trailQuad: Mesh | null = null;
let _muzzleFrames: Mesh[] | null = null;
let _ballMat: Material | null = null;
let _trailMat: Material | null = null;
let _hazeMat: Material | null = null;
let _glowMat: Material | null = null;
let _muzzleTex: Texture2D | null = null;
let _prefab: Prefab | null = null;
let _boot: Promise<void> | null = null;
let _cam: Camera | null = null;
let _inkLogN = 0;
type MuzzleFx = {
  node: Node;
  mr: MeshRenderer;
  t: number;
  live: boolean;
};
const _muzzles: MuzzleFx[] = [];
type HitFx = {
  node: Node;
  t: number;
  live: boolean;
};
const _hits: HitFx[] = [];

function texFrom(img: ImageAsset): Texture2D {
  const tex = new Texture2D();
  tex.image = img;
  tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
  tex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  return tex;
}

function loadImage(path: string): Promise<ImageAsset | null> {
  return new Promise((resolve) => {
    resources.load(path, ImageAsset, (err, img) => resolve(!err && img ? img : null));
  });
}

function glowQuad(): Mesh {
  if (_glowQuad) return _glowQuad;
  _glowQuad = utils.MeshUtils.createMesh({
    positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
    minPos: new Vec3(-0.5, -0.5, 0),
    maxPos: new Vec3(0.5, 0.5, 0),
    boundingRadius: 0.75,
  });
  return _glowQuad;
}

/** Soft comet ribbon. U runs head→tail so the texture fade can die out. */
function trailQuad(): Mesh {
  if (_trailQuad) return _trailQuad;
  _trailQuad = utils.MeshUtils.createMesh({
    positions: [-0.5, 0, 0, 0.5, 0, 0, 0.5, -1, 0, -0.5, -1, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 1, 0, 0, 1, 0, 1, 1],
    indices: [0, 1, 2, 0, 2, 3],
    minPos: new Vec3(-0.5, -1, 0),
    maxPos: new Vec3(0.5, 0, 0),
    boundingRadius: 1.12,
  });
  return _trailQuad;
}

function sheetQuad(col: number, row: number, cols: number, rows: number): Mesh {
  const u0 = col / cols;
  const u1 = (col + 1) / cols;
  const v0 = 1 - (row + 1) / rows;
  const v1 = 1 - row / rows;
  return utils.MeshUtils.createMesh({
    positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [u0, v0, u1, v0, u1, v1, u0, v1],
    indices: [0, 1, 2, 0, 2, 3],
    minPos: new Vec3(-0.5, -0.5, 0),
    maxPos: new Vec3(0.5, 0.5, 0),
    boundingRadius: 0.75,
  });
}

function muzzleFrame(i: number): Mesh {
  if (!_muzzleFrames) {
    _muzzleFrames = [];
    for (let f = 0; f < MUZZLE_FRAMES; f++) {
      _muzzleFrames.push(sheetQuad(f % MUZZLE_COLS, (f / MUZZLE_COLS) | 0, MUZZLE_COLS, MUZZLE_ROWS));
    }
  }
  return _muzzleFrames[Math.max(0, Math.min(MUZZLE_FRAMES - 1, i))];
}

function addMat(tex: Texture2D | null, alpha: number, additive: boolean): Material {
  const mat = new Material();
  mat.initialize({
    effectName: 'builtin-unlit',
    technique: 0,
    defines: { USE_TEXTURE: !!tex },
    states: {
      rasterizerState: { cullMode: gfx.CullMode.NONE },
      depthStencilState: {
        depthTest: true,
        depthWrite: false,
        depthFunc: gfx.ComparisonFunc.LESS_EQUAL,
      },
      blendState: {
        targets: [{
          blend: true,
          blendSrc: gfx.BlendFactor.SRC_ALPHA,
          blendDst: additive ? gfx.BlendFactor.ONE : gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
          blendSrcAlpha: gfx.BlendFactor.ONE,
          blendDstAlpha: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
        }],
      },
    },
  });
  if (tex) mat.setProperty('mainTexture', tex);
  mat.setProperty('mainColor', new Color(248, 246, 255, alpha));
  return mat;
}

function applyMesh(node: Node, mesh: Mesh | null, mat: Material | null): MeshRenderer | null {
  if (!mesh || !mat) return null;
  let mr = node.getComponent(MeshRenderer);
  if (!mr) mr = node.addComponent(MeshRenderer);
  mr.mesh = mesh;
  mr.setSharedMaterial(mat, 0);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  mr.enabled = true;
  return mr;
}

function child(host: Node, name: string): Node {
  let n = host.getChildByName(name);
  if (!n) {
    n = new Node(name);
    host.addChild(n);
  }
  n.layer = Layers.Enum.DEFAULT;
  n.active = true;
  return n;
}

function mainCam(): Camera | null {
  if (_cam?.node?.isValid) return _cam;
  const scene = director.getScene();
  _cam = scene?.getChildByName('Main Camera')?.getComponent(Camera)
    ?? scene?.getComponentInChildren(Camera)
    ?? null;
  return _cam;
}

function camPos(out: Vec3, fallback: Vec3): void {
  const cam = mainCam();
  if (cam?.node?.isValid) cam.node.getWorldPosition(out);
  else out.set(fallback.x, fallback.y + 10, fallback.z);
}

function faceCam(node: Node, camPosW: Vec3): void {
  node.getWorldPosition(_pos);
  _toCam.set(camPosW.x - _pos.x, camPosW.y - _pos.y, camPosW.z - _pos.z);
  if (_toCam.lengthSqr() < 1e-8) _toCam.set(0, 1, 0);
  Vec3.normalize(_axisZ, _toCam);
  _axisY.set(0, 1, 0);
  Vec3.cross(_axisX, _axisY, _axisZ);
  if (_axisX.lengthSqr() < 1e-8) {
    _axisY.set(0, 0, 1);
    Vec3.cross(_axisX, _axisY, _axisZ);
  }
  Vec3.normalize(_axisX, _axisX);
  Vec3.cross(_axisY, _axisZ, _axisX);
  Quat.fromAxes(_rot, _axisX, _axisY, _axisZ);
  node.setWorldRotation(_rot);
}

function faceTrail(node: Node, along: Vec3, camPosW: Vec3): void {
  node.getWorldPosition(_pos);
  _toCam.set(camPosW.x - _pos.x, camPosW.y - _pos.y, camPosW.z - _pos.z);
  if (_toCam.lengthSqr() < 1e-8) _toCam.set(0, 1, 0);
  Vec3.normalize(_axisY, along);
  Vec3.cross(_axisX, _axisY, _toCam);
  if (_axisX.lengthSqr() < 1e-8) Vec3.cross(_axisX, _fallback, _axisY);
  Vec3.normalize(_axisX, _axisX);
  Vec3.cross(_axisZ, _axisX, _axisY);
  if (_axisZ.lengthSqr() < 1e-8) _axisZ.set(_toCam);
  Vec3.normalize(_axisZ, _axisZ);
  Quat.fromAxes(_rot, _axisX, _axisY, _axisZ);
  node.setWorldRotation(_rot);
}

export function preloadInkShot(): Promise<void> {
  if (_boot) return _boot;
  _boot = Promise.all([
    new Promise<void>((resolve) => {
      assetManager.loadAny({ uuid: PREFAB_UUID.InkShot }, (_err, asset) => {
        _prefab = (asset as Prefab) ?? null;
        resolve();
      });
    }),
    loadImage('fx/bullet-trail').then((img) => {
      if (!img) return;
      const tex = texFrom(img);
      _trailMat = addMat(tex, 105, true);
      _hazeMat = addMat(tex, 42, true);
    }),
    loadImage('fx/bullet-glow').then((img) => {
      if (img) _glowMat = addMat(texFrom(img), 95, true);
    }),
    loadImage('fx/bullet-ball').then((img) => {
      if (img) _ballMat = addMat(texFrom(img), 190, true);
    }),
    loadImage('fx/muzzle-flash').then((img) => {
      if (img) _muzzleTex = texFrom(img);
    }),
  ]).then(() => undefined);
  return _boot;
}

function sweepStuckMuzzles(host: Node): void {
  const kids = host.children;
  for (let i = 0; i < kids.length; i++) {
    const n = kids[i];
    if (!n.name.startsWith('Muzzle_')) continue;
    let live = false;
    for (let j = 0; j < _muzzles.length; j++) {
      if (_muzzles[j].live && _muzzles[j].node === n) {
        live = true;
        break;
      }
    }
    if (live) continue;
    n.active = false;
    const mr = n.getComponent(MeshRenderer);
    if (mr) mr.enabled = false;
  }
}

export function createInkShot(host: Node): InkShot {
  sweepStuckMuzzles(host);
  const node = _prefab ? instantiate(_prefab) : new Node('InkShot');
  node.layer = Layers.Enum.DEFAULT;
  node.active = false;
  host.addChild(node);
  return node.getComponent(InkShot) ?? node.addComponent(InkShot);
}

let _muzzleTick = false;

function hideMuzzle(fx: MuzzleFx): void {
  fx.live = false;
  if (fx.mr.isValid) fx.mr.enabled = false;
  if (fx.node.isValid) fx.node.active = false;
}

function poseMuzzle(fx: MuzzleFx): void {
  const i = Math.min(MUZZLE_FRAMES - 1, (fx.t * MUZZLE_FPS) | 0);
  fx.mr.mesh = muzzleFrame(i);
  fx.mr.enabled = true;
  fx.node.getWorldPosition(_pos);
  camPos(_camP, _pos);
  faceCam(fx.node, _camP);
  const u = Math.min(1, fx.t / (MUZZLE_FRAMES / MUZZLE_FPS));
  const pop = u < 0.2 ? 0.7 + u * 1.5 : 1.1 - u * 0.25;
  fx.node.setScale(MUZZLE * pop, MUZZLE * pop, 1);
}

function poseHit(fx: HitFx): void {
  const u = Math.min(1, fx.t / HIT_LIFE);
  const s = HIT_S0 + (HIT_S1 - HIT_S0) * u;
  fx.node.getWorldPosition(_pos);
  camPos(_camP, _pos);
  faceCam(fx.node, _camP);
  const fade = 1 - u * u;
  fx.node.setScale(s * fade, s * fade, 1);
}

function tickHits(dt: number): boolean {
  let any = false;
  for (let i = 0; i < _hits.length; i++) {
    const fx = _hits[i];
    if (!fx.live || !fx.node.isValid) continue;
    fx.t += dt;
    if (fx.t >= HIT_LIFE) {
      fx.live = false;
      fx.node.active = false;
      continue;
    }
    poseHit(fx);
    any = true;
  }
  return any;
}

function bindFxTick(): void {
  if (_muzzleTick) return;
  director.on(Director.EVENT_AFTER_UPDATE, onMuzzleUpdate);
  _muzzleTick = true;
}

function tickMuzzles(dt: number): void {
  let any = tickHits(dt);
  for (let i = 0; i < _muzzles.length; i++) {
    const fx = _muzzles[i];
    if (!fx.node.isValid) {
      fx.live = false;
      continue;
    }
    if (!fx.live) {
      if (fx.node.active) hideMuzzle(fx);
      continue;
    }
    fx.t += dt;
    if (fx.t >= MUZZLE_FRAMES / MUZZLE_FPS) {
      hideMuzzle(fx);
      continue;
    }
    poseMuzzle(fx);
    any = true;
  }
  if (any) return;
  if (!_muzzleTick) return;
  director.off(Director.EVENT_AFTER_UPDATE, onMuzzleUpdate);
  _muzzleTick = false;
}

function onMuzzleUpdate(): void {
  tickMuzzles(game.deltaTime);
}

export function playMuzzleFlash(host: Node, world: Vec3, _along: Vec3): void {
  if (!_muzzleTex) return;
  sweepStuckMuzzles(host);
  let fx: MuzzleFx | null = null;
  for (let i = 0; i < _muzzles.length; i++) {
    if (!_muzzles[i].live) {
      fx = _muzzles[i];
      break;
    }
  }
  if (!fx) {
    const node = new Node(`Muzzle_${_muzzles.length}`);
    node.layer = Layers.Enum.UI_3D;
    host.addChild(node);
    const mat = addMat(_muzzleTex, 255, true);
    const mr = applyMesh(node, muzzleFrame(0), mat);
    if (!mr) return;
    fx = { node, mr, t: 0, live: false };
    _muzzles.push(fx);
  }
  if (fx.node.parent !== host) host.addChild(fx.node);
  fx.t = 0;
  fx.live = true;
  fx.node.layer = Layers.Enum.UI_3D;
  _dir.set(_along);
  if (_dir.lengthSqr() > 1e-8) {
    Vec3.normalize(_dir, _dir);
    fx.node.setWorldPosition(world.x + _dir.x * 0.05, world.y + _dir.y * 0.05, world.z + _dir.z * 0.05);
  } else {
    fx.node.setWorldPosition(world);
  }
  fx.node.active = true;
  poseMuzzle(fx);
  bindFxTick();
}

export function playHitFlash(host: Node, world: Vec3): void {
  if (!_glowMat) return;
  let fx: HitFx | null = null;
  for (let i = 0; i < _hits.length; i++) {
    if (!_hits[i].live) {
      fx = _hits[i];
      break;
    }
  }
  if (!fx) {
    const node = new Node(`Hit_${_hits.length}`);
    node.layer = Layers.Enum.UI_3D;
    host.addChild(node);
    applyMesh(node, glowQuad(), _glowMat);
    fx = { node, t: 0, live: false };
    _hits.push(fx);
  }
  if (fx.node.parent !== host) host.addChild(fx.node);
  fx.t = 0;
  fx.live = true;
  fx.node.layer = Layers.Enum.UI_3D;
  fx.node.setWorldPosition(world);
  fx.node.active = true;
  poseHit(fx);
  bindFxTick();
}

@ccclass('InkShot')
export class InkShot extends Component {
  private _ball: Node | null = null;
  private _trail: Node | null = null;
  private _haze: Node | null = null;
  private _glow: Node | null = null;
  private readonly _from = new Vec3();
  private readonly _to = new Vec3();
  private _t = 0;
  private _dur = 0.16;
  private _onHit: (() => void) | null = null;
  private _seek: (() => Vec3) | null = null;
  private _armed = false;

  get busy(): boolean {
    return this.node.active && this._armed;
  }

  fire(
    from: Vec3,
    to: Vec3,
    _token: string,
    duration: number,
    _arc: number,
    onHit?: () => void,
    seek?: () => Vec3,
  ): void {
    this._from.set(from);
    this._to.set(to);
    this._t = 0;
    this._dur = Math.max(0.06, duration);
    this._onHit = onHit ?? null;
    this._seek = seek ?? null;
    this._armed = false;
    this.node.active = true;
    this.enabled = true;
    try {
      this._ensureLook();
      this._pose(0);
    } catch (err) {
      console.error('[Suck:fire] InkShot look failed', err);
    }
    this._armed = true;
    if (_inkLogN < 8) {
      _inkLogN += 1;
      console.warn(
        `[Suck:fire] ink ${this.node.name} from=${from.x.toFixed(2)},${from.y.toFixed(2)},${from.z.toFixed(2)}`
        + ` to=${to.x.toFixed(2)},${to.y.toFixed(2)},${to.z.toFixed(2)} dur=${this._dur.toFixed(2)}`,
      );
    }
  }

  update(dt: number): void {
    tickMuzzles(dt);
    if (!this._armed) return;
    this._t += dt;
    const u = Math.min(1, this._t / this._dur);
    this._pose(u);
    if (u < 1) return;
    this._armed = false;
    if (this._trail?.isValid) this._trail.active = false;
    if (this._haze?.isValid) this._haze.active = false;
    if (this._glow?.isValid) this._glow.active = false;
    if (this._ball?.isValid) this._ball.active = false;
    this.node.active = false;
    this.enabled = false;
    const done = this._onHit;
    this._onHit = null;
    done?.();
  }

  private _ensureLook(): void {
    if (!_ballMat) _ballMat = addMat(null, 255, true);
    this.node.layer = Layers.Enum.DEFAULT;
    this.node.setScale(1, 1, 1);
    const rootMr = this.node.getComponent(MeshRenderer);
    if (rootMr) rootMr.enabled = false;

    const glow = child(this.node, 'Glow');
    glow.setPosition(0, 0, 0);
    glow.active = !!_glowMat;
    if (_glowMat) applyMesh(glow, glowQuad(), _glowMat);
    this._glow = glow;

    const leftover = this.node.getChildByName('Streak');
    if (leftover) leftover.active = false;

    const haze = child(this.node, 'Haze');
    haze.setPosition(0, 0, 0);
    haze.active = !!_hazeMat;
    if (_hazeMat) applyMesh(haze, trailQuad(), _hazeMat);
    this._haze = haze;

    const trail = child(this.node, 'Trail');
    trail.setPosition(0, 0, 0);
    trail.active = !!_trailMat;
    if (_trailMat) applyMesh(trail, trailQuad(), _trailMat);
    this._trail = trail;

    const ball = child(this.node, 'Ball');
    ball.setPosition(0, 0, 0);
    ball.setRotationFromEuler(0, 0, 0);
    ball.active = !!_ballMat;
    if (_ballMat) applyMesh(ball, glowQuad(), _ballMat);
    this._ball = ball;
  }

  private _pose(u: number): void {
    const seek = this._seek?.();
    if (seek) this._to.set(seek);
    const dx = this._to.x - this._from.x;
    const dy = this._to.y - this._from.y;
    const dz = this._to.z - this._from.z;
    _pos.set(this._from.x + dx * u, this._from.y + dy * u, this._from.z + dz * u);
    this.node.setWorldPosition(_pos);
    this.node.setWorldRotation(Quat.IDENTITY);
    this.node.setScale(1, 1, 1);

    _dir.set(dx, dy, dz);
    camPos(_camP, _pos);
    if (_dir.lengthSqr() < 1e-8) _dir.set(_fallback);

    const fade = u > 0.88 ? (1 - u) / 0.12 : 1;
    const flown = Math.hypot(dx, dy, dz) * u;
    const trailLen = Math.min(TRAIL_LEN, Math.max(0, flown * 0.72));
    const hazeLen = Math.min(HAZE_LEN, Math.max(0, flown * 0.58));
    const showTrail = trailLen > 0.03;

    if (this._ball?.isValid) {
      faceCam(this._ball, _camP);
      this._ball.setScale(BALL * fade, BALL * fade, 1);
    }
    if (this._glow?.isValid) {
      faceCam(this._glow, _camP);
      this._glow.setScale(GLOW * fade, GLOW * fade, 1);
    }
    if (this._haze?.isValid) {
      this._haze.active = showTrail && !!_hazeMat;
      if (showTrail) {
        faceTrail(this._haze, _dir, _camP);
        this._haze.setScale(HAZE_W * fade, hazeLen, 1);
      }
    }
    if (this._trail?.isValid) {
      this._trail.active = showTrail && !!_trailMat;
      if (showTrail) {
        faceTrail(this._trail, _dir, _camP);
        this._trail.setScale(TRAIL_W * fade, trailLen, 1);
      }
    }
  }
}
