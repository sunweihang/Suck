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
import { PLAY, TOKEN_RGB, isColorToken } from '../game/GameConfig';

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

/** Candy bolt: hot core, colored bloom, short comet. */
const BALL = 0.15;
const GLOW = 0.34;
const TRAIL_W = 0.13;
const TRAIL_L = 0.46;
const SPARKS = 4;
const SPARK_GAP = 0.085;
const SPARK_S = [0.11, 0.082, 0.06, 0.044];
const MUZZLE = 0.30;
const MUZZLE_GLOW = 0.40;
const HIT_LIFE = 0.16;
const HIT_S0 = 0.22;
const HIT_S1 = 0.58;
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
let _ballTex: Texture2D | null = null;
let _glowTex: Texture2D | null = null;
let _trailTex: Texture2D | null = null;
let _muzzleTex: Texture2D | null = null;
let _prefab: Prefab | null = null;
let _boot: Promise<void> | null = null;
let _cam: Camera | null = null;
const _mats = new Map<string, Material>();
type MuzzleFx = {
  node: Node;
  bloom: Node | null;
  mr: MeshRenderer;
  t: number;
  live: boolean;
  along: Vec3;
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

function addMat(tex: Texture2D | null, color: Color, additive: boolean): Material {
  const mat = new Material();
  mat.initialize({
    effectName: 'builtin-unlit',
    technique: 0,
    defines: { USE_TEXTURE: !!tex },
    states: {
      rasterizerState: { cullMode: gfx.CullMode.NONE },
      depthStencilState: {
        depthTest: false,
        depthWrite: false,
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
  mat.setProperty('mainColor', color);
  return mat;
}

function tokenRgb(token: string): readonly [number, number, number] {
  if (!isColorToken(token)) return [248, 246, 255];
  return PLAY.tints[token] ?? TOKEN_RGB[token];
}

function kindTex(kind: 'ball' | 'glow' | 'trail' | 'muzzle' | 'bloom' | 'hit'): Texture2D | null {
  if (kind === 'ball') return _ballTex;
  if (kind === 'trail') return _trailTex;
  if (kind === 'muzzle') return _muzzleTex;
  return _glowTex;
}

function luma(rgb: readonly [number, number, number]): number {
  return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
}

/** Additive glow cannot paint black — it only adds light. */
function isInk(rgb: readonly [number, number, number]): boolean {
  return luma(rgb) < 80;
}

/** Keep a hot core; the grayscale texture already supplies the white center. */
function lift(rgb: readonly [number, number, number], white: number, alpha: number): Color {
  return new Color(
    Math.min(255, Math.round(rgb[0] + (255 - rgb[0]) * white)),
    Math.min(255, Math.round(rgb[1] + (255 - rgb[1]) * white)),
    Math.min(255, Math.round(rgb[2] + (255 - rgb[2]) * white)),
    alpha,
  );
}

function matFor(
  kind: 'ball' | 'glow' | 'trail' | 'muzzle' | 'bloom' | 'hit',
  token: string,
  rgb?: readonly [number, number, number],
): Material {
  const color = rgb ?? tokenRgb(token);
  const ink = isInk(color);
  const tex = kindTex(kind);
  const key = `${kind}:${color[0]},${color[1]},${color[2]}:${tex ? 1 : 0}:${ink ? 'i' : 'a'}`;
  const cached = _mats.get(key);
  if (cached) return cached;
  const add = !ink;
  let mat: Material;
  if (kind === 'ball') mat = addMat(tex, lift(color, ink ? 0 : 0.16, 255), add);
  else if (kind === 'glow') mat = addMat(tex, lift(color, ink ? 0 : 0.04, ink ? 240 : 210), add);
  else if (kind === 'trail') mat = addMat(tex, lift(color, ink ? 0 : 0.06, ink ? 245 : 235), add);
  else if (kind === 'muzzle') mat = addMat(tex, lift(color, ink ? 0 : 0.08, 255), add);
  else if (kind === 'bloom') mat = addMat(tex, lift(color, ink ? 0 : 0.04, ink ? 210 : 230), add);
  else mat = addMat(tex, lift(color, ink ? 0 : 0.08, ink ? 230 : 230), add);
  _mats.set(key, mat);
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
  mr.priority = 80;
  mr.enabled = true;
  return mr;
}

function child(host: Node, name: string): Node {
  let n = host.getChildByName(name);
  if (!n) {
    n = new Node(name);
    host.addChild(n);
  }
  n.layer = Layers.Enum.UI_3D;
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

const _camCached = new Vec3();
let _camFrame = -1;

function camPos(out: Vec3, fallback: Vec3): void {
  const frame = director.getTotalFrames();
  if (_camFrame !== frame) {
    _camFrame = frame;
    const cam = mainCam();
    if (cam?.node?.isValid) cam.node.getWorldPosition(_camCached);
    else _camCached.set(fallback.x, fallback.y + 10, fallback.z);
  }
  out.set(_camCached);
}

function faceCamAt(node: Node, at: Vec3, camPosW: Vec3): void {
  _toCam.set(camPosW.x - at.x, camPosW.y - at.y, camPosW.z - at.z);
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

function faceTrailAt(at: Vec3, along: Vec3, camPosW: Vec3): void {
  _toCam.set(camPosW.x - at.x, camPosW.y - at.y, camPosW.z - at.z);
  if (_toCam.lengthSqr() < 1e-8) _toCam.set(0, 1, 0);
  Vec3.normalize(_axisY, along);
  Vec3.cross(_axisX, _axisY, _toCam);
  if (_axisX.lengthSqr() < 1e-8) Vec3.cross(_axisX, _fallback, _axisY);
  Vec3.normalize(_axisX, _axisX);
  Vec3.cross(_axisZ, _axisX, _axisY);
  if (_axisZ.lengthSqr() < 1e-8) _axisZ.set(_toCam);
  Vec3.normalize(_axisZ, _axisZ);
  Quat.fromAxes(_rot, _axisX, _axisY, _axisZ);
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
      _trailTex = texFrom(img);
      _trailMat = addMat(_trailTex, new Color(248, 246, 255, 200), true);
      _hazeMat = addMat(_trailTex, new Color(248, 246, 255, 70), true);
    }),
    loadImage('fx/bullet-glow').then((img) => {
      if (!img) return;
      _glowTex = texFrom(img);
      _glowMat = addMat(_glowTex, new Color(248, 246, 255, 160), true);
    }),
    loadImage('fx/bullet-ball').then((img) => {
      if (!img) return;
      _ballTex = texFrom(img);
      _ballMat = addMat(_ballTex, new Color(255, 252, 255, 240), true);
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

export function resetPlayFx(): void {
  director.off(Director.EVENT_AFTER_UPDATE, onMuzzleUpdate);
  _muzzleTick = false;
  _muzzles.length = 0;
  _hits.length = 0;
  _cam = null;
  _camFrame = -1;
  if (_ballMat && !_ballMat.isValid) _ballMat = null;
  if (_trailMat && !_trailMat.isValid) _trailMat = null;
  if (_hazeMat && !_hazeMat.isValid) _hazeMat = null;
  if (_glowMat && !_glowMat.isValid) _glowMat = null;
  if (_glowQuad && !_glowQuad.isValid) _glowQuad = null;
  if (_trailQuad && !_trailQuad.isValid) _trailQuad = null;
  if (_muzzleFrames) {
    _muzzleFrames = _muzzleFrames.some((m) => !m.isValid) ? null : _muzzleFrames;
  }
  for (const [key, mat] of [..._mats]) {
    if (!mat?.isValid) _mats.delete(key);
  }
  if (_prefab && !_prefab.isValid) {
    _prefab = null;
    _boot = null;
  }
}

export function createInkShot(host: Node): InkShot {
  sweepStuckMuzzles(host);
  const pf = _prefab?.isValid ? _prefab : null;
  const node = pf ? instantiate(pf) : new Node('InkShot');
  node.layer = Layers.Enum.UI_3D;
  node.active = false;
  host.addChild(node);
  const shot = node.getComponent(InkShot) ?? node.addComponent(InkShot);
  shot.enabled = true;
  shot.prepareLook();
  return shot;
}

export function warmInkShots(host: Node, count: number): InkShot[] {
  const out: InkShot[] = [];
  for (let i = 0; i < count; i++) {
    const shot = createInkShot(host);
    shot.node.name = `Shot_${i}`;
    out.push(shot);
  }
  return out;
}

let _muzzleTick = false;

function hideMuzzle(fx: MuzzleFx): void {
  fx.live = false;
  if (fx.mr.isValid) fx.mr.enabled = false;
  if (fx.node.isValid) fx.node.active = false;
  if (fx.bloom?.isValid) fx.bloom.active = false;
}

function faceMuzzleAt(node: Node, at: Vec3, along: Vec3, camPosW: Vec3): void {
  _toCam.set(camPosW.x - at.x, camPosW.y - at.y, camPosW.z - at.z);
  if (_toCam.lengthSqr() < 1e-8) _toCam.set(0, 1, 0);
  Vec3.normalize(_axisZ, _toCam);
  _dir.set(along);
  const d = _dir.x * _axisZ.x + _dir.y * _axisZ.y + _dir.z * _axisZ.z;
  _axisX.set(_dir.x - _axisZ.x * d, _dir.y - _axisZ.y * d, _dir.z - _axisZ.z * d);
  if (_axisX.lengthSqr() < 1e-8) {
    _axisY.set(0, 1, 0);
    Vec3.cross(_axisX, _axisY, _axisZ);
  }
  Vec3.normalize(_axisX, _axisX);
  Vec3.cross(_axisY, _axisZ, _axisX);
  Quat.fromAxes(_rot, _axisX, _axisY, _axisZ);
  node.setWorldRotation(_rot);
}

function poseMuzzle(fx: MuzzleFx): void {
  const i = Math.min(MUZZLE_FRAMES - 1, (fx.t * MUZZLE_FPS) | 0);
  fx.mr.mesh = muzzleFrame(i);
  fx.mr.enabled = true;
  fx.node.getWorldPosition(_pos);
  camPos(_camP, _pos);
  faceMuzzleAt(fx.node, _pos, fx.along, _camP);
  const u = Math.min(1, fx.t / (MUZZLE_FRAMES / MUZZLE_FPS));
  const pop = u < 0.18 ? 0.85 + u * 1.8 : 1.18 - u * 0.35;
  fx.node.setScale(MUZZLE * pop * 1.2, MUZZLE * pop * 0.88, 1);
  if (!fx.bloom?.isValid) return;
  fx.bloom.setWorldPosition(_pos);
  faceCamAt(fx.bloom, _pos, _camP);
  const gs = MUZZLE_GLOW * pop;
  fx.bloom.setScale(gs, gs, 1);
  fx.bloom.active = true;
}

function poseHit(fx: HitFx): void {
  const u = Math.min(1, fx.t / HIT_LIFE);
  const s = HIT_S0 + (HIT_S1 - HIT_S0) * u;
  fx.node.getWorldPosition(_pos);
  camPos(_camP, _pos);
  faceCamAt(fx.node, _pos, _camP);
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

export function playMuzzleFlash(
  host: Node,
  world: Vec3,
  along: Vec3,
  token = '',
  rgb?: readonly [number, number, number],
): void {
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
    const mr = applyMesh(node, muzzleFrame(0), matFor('muzzle', token, rgb));
    if (!mr) return;
    fx = { node, bloom: null, mr, t: 0, live: false, along: new Vec3() };
    _muzzles.push(fx);
  }
  if (fx.node.parent !== host) host.addChild(fx.node);
  applyMesh(fx.node, muzzleFrame(0), matFor('muzzle', token, rgb));
  if (!fx.bloom?.isValid) {
    const bloom = new Node(`${fx.node.name}_Bloom`);
    bloom.layer = Layers.Enum.UI_3D;
    host.addChild(bloom);
    applyMesh(bloom, glowQuad(), matFor('bloom', token, rgb));
    fx.bloom = bloom;
  } else {
    if (fx.bloom.parent !== host) host.addChild(fx.bloom);
    applyMesh(fx.bloom, glowQuad(), matFor('bloom', token, rgb));
  }
  fx.t = 0;
  fx.live = true;
  fx.node.layer = Layers.Enum.UI_3D;
  fx.along.set(along);
  if (fx.along.lengthSqr() > 1e-8) {
    Vec3.normalize(fx.along, fx.along);
    fx.node.setWorldPosition(
      world.x + fx.along.x * 0.06,
      world.y + fx.along.y * 0.06,
      world.z + fx.along.z * 0.06,
    );
  } else {
    fx.node.setWorldPosition(world);
  }
  fx.node.active = true;
  poseMuzzle(fx);
  bindFxTick();
}

export function playHitFlash(
  host: Node,
  world: Vec3,
  token = '',
  rgb?: readonly [number, number, number],
): void {
  if (!_glowTex && !_glowMat) return;
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
    applyMesh(node, glowQuad(), matFor('hit', token, rgb));
    fx = { node, t: 0, live: false };
    _hits.push(fx);
  }
  if (fx.node.parent !== host) host.addChild(fx.node);
  applyMesh(fx.node, glowQuad(), matFor('hit', token, rgb));
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
  private _glow: Node | null = null;
  private _trail: Node | null = null;
  private readonly _sparks: Node[] = [];
  private _token = '';
  private _rgb: readonly [number, number, number] | null = null;
  private readonly _from = new Vec3();
  private readonly _to = new Vec3();
  private _t = 0;
  private _dur = 0.16;
  private _onHit: ((shot: InkShot) => void) | null = null;
  private _armed = false;
  private _lookReady = false;
  private _stepFrame = -1;
  landUnit: unknown = null;
  landBlock: unknown = null;
  landBoom = false;
  landPaint = false;
  landToken = '';
  readonly landKick = new Vec3();

  get busy(): boolean {
    return this.node.active && this._armed;
  }

  get progress(): number {
    return this._armed && this._dur > 0 ? this._t / this._dur : 0;
  }

  prepareLook(): void {
    try {
      this._ensureLook();
    } catch {
      this._lookReady = false;
    }
  }

  fire(
    from: Vec3,
    to: Vec3,
    token: string,
    duration: number,
    _arc: number,
    onHit?: (shot: InkShot) => void,
    rgb?: readonly [number, number, number],
  ): void {
    this._token = token;
    this._rgb = rgb ?? null;
    this._from.set(from);
    this._to.set(to);
    _dir.set(to.x - from.x, to.y - from.y, to.z - from.z);
    const kickLen = Math.sqrt(_dir.lengthSqr()) || 1;
    this.landKick.set(_dir.x / kickLen, _dir.y / kickLen, _dir.z / kickLen);
    this._t = 0;
    this._dur = Math.max(0.06, duration);
    this._onHit = onHit ?? null;
    this._armed = false;
    this.node.active = true;
    this.enabled = true;
    this.node.setWorldRotation(Quat.IDENTITY);
    this.node.setScale(1, 1, 1);
    try {
      this._ensureLook();
      this._paint(this._token, this._rgb);
      this._pose(0);
    } catch (err) {
      console.error('[Suck:fire] InkShot look failed', err);
    }
    this._armed = true;
    this._stepFrame = -1;
  }

  /** BattleDirector also ticks shots so a missing InkShot.update still lands. */
  advance(dt: number): void {
    const frame = director.getTotalFrames();
    if (this._stepFrame === frame) return;
    this._stepFrame = frame;
    if (!this._armed) return;
    this._t += dt;
    const u = Math.min(1, this._t / this._dur);
    try {
      this._pose(u);
    } catch (err) {
      console.error('[Suck:fire] InkShot pose failed', err);
    }
    if (u < 1) return;
    this._finish();
  }

  forceLand(): void {
    if (!this._armed) return;
    this._t = this._dur;
    this._finish();
  }

  update(dt: number): void {
    this.advance(dt);
  }

  private _finish(): void {
    this._armed = false;
    this._hideSparks();
    if (this._glow?.isValid) this._glow.active = false;
    if (this._ball?.isValid) this._ball.active = false;
    if (this._trail?.isValid) this._trail.active = false;
    this.node.active = false;
    this.enabled = false;
    const done = this._onHit;
    this._onHit = null;
    done?.(this);
  }

  private _ensureLook(): void {
    if (this._lookReady && this._ball?.isValid) return;
    if (!_ballMat) _ballMat = addMat(null, new Color(255, 255, 255, 255), true);
    this.node.layer = Layers.Enum.UI_3D;
    this.node.setScale(1, 1, 1);
    const rootMr = this.node.getComponent(MeshRenderer);
    if (rootMr) rootMr.enabled = false;

    const glow = child(this.node, 'Glow');
    glow.setPosition(0, 0, 0);
    glow.active = !!(_glowMat || _glowTex);
    if (_glowMat) applyMesh(glow, glowQuad(), _glowMat);
    this._glow = glow;

    const leftover = this.node.getChildByName('Streak');
    if (leftover) leftover.active = false;
    const haze = this.node.getChildByName('Haze');
    if (haze) haze.active = false;

    const trail = child(this.node, 'Trail');
    trail.setPosition(0, 0, 0);
    trail.active = !!(_trailMat || _trailTex);
    if (_trailMat) applyMesh(trail, trailQuad(), _trailMat);
    this._trail = trail;

    this._sparks.length = 0;
    for (let i = 0; i < SPARKS; i++) {
      const spark = child(this.node, `Spark_${i}`);
      spark.setPosition(0, 0, 0);
      spark.active = false;
      if (_glowMat) applyMesh(spark, glowQuad(), _glowMat);
      this._sparks.push(spark);
    }

    const ball = child(this.node, 'Ball');
    ball.setPosition(0, 0, 0);
    ball.setRotationFromEuler(0, 0, 0);
    ball.active = !!_ballMat;
    if (_ballMat) applyMesh(ball, glowQuad(), _ballMat);
    this._ball = ball;
    this._lookReady = true;
  }

  private _paint(token: string, rgb?: readonly [number, number, number] | null): void {
    if (this._ball?.isValid) applyMesh(this._ball, glowQuad(), matFor('ball', token, rgb ?? undefined));
    if (this._glow?.isValid) applyMesh(this._glow, glowQuad(), matFor('glow', token, rgb ?? undefined));
    if (this._trail?.isValid) applyMesh(this._trail, trailQuad(), matFor('trail', token, rgb ?? undefined));
    for (let i = 0; i < this._sparks.length; i++) {
      const spark = this._sparks[i];
      if (spark?.isValid) applyMesh(spark, glowQuad(), matFor('glow', token, rgb ?? undefined));
    }
  }

  private _hideSparks(): void {
    for (let i = 0; i < this._sparks.length; i++) {
      const spark = this._sparks[i];
      if (spark?.isValid) spark.active = false;
    }
  }

  private _pose(u: number): void {
    const dx = this._to.x - this._from.x;
    const dy = this._to.y - this._from.y;
    const dz = this._to.z - this._from.z;
    _pos.set(this._from.x + dx * u, this._from.y + dy * u, this._from.z + dz * u);
    this.node.setWorldPosition(_pos);

    _dir.set(dx, dy, dz);
    camPos(_camP, _pos);
    const len = Math.sqrt(_dir.lengthSqr());
    if (len < 1e-8) _dir.set(_fallback);
    else _dir.multiplyScalar(1 / len);

    const fade = u > 0.88 ? (1 - u) / 0.12 : 1;
    const flown = len * u;

    if (this._ball?.isValid) {
      faceCamAt(this._ball, _pos, _camP);
      this._ball.setScale(BALL * fade, BALL * fade, 1);
      this._ball.active = true;
    }
    if (this._glow?.isValid) {
      if (this._ball?.isValid) this._glow.setWorldRotation(_rot);
      else faceCamAt(this._glow, _pos, _camP);
      this._glow.setScale(GLOW * fade, GLOW * fade, 1);
      this._glow.active = true;
    }
    if (this._trail?.isValid) {
      const tail = Math.min(TRAIL_L, Math.max(0.06, flown * 0.92));
      this._trail.active = flown > 0.03;
      faceTrailAt(_pos, _dir, _camP);
      this._trail.setWorldRotation(_rot);
      this._trail.setScale(TRAIL_W * fade, tail, 1);
    }

    const sparkMat = _glowMat ?? _ballMat ?? _glowTex;
    for (let i = 0; i < this._sparks.length; i++) {
      const spark = this._sparks[i];
      if (!spark?.isValid) continue;
      const back = SPARK_GAP * (i + 1);
      if (!sparkMat || flown < back + 0.02) {
        spark.active = false;
        continue;
      }
      spark.active = true;
      spark.setWorldPosition(
        _pos.x - _dir.x * back,
        _pos.y - _dir.y * back,
        _pos.z - _dir.z * back,
      );
      faceCamAt(spark, spark.worldPosition, _camP);
      const s = SPARK_S[i] * fade * (1 - i * 0.12);
      spark.setScale(s, s, 1);
    }
  }
}
