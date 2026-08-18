import {
  Color,
  ImageAsset,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Texture2D,
  Vec3,
  gfx,
  resources,
  utils,
} from 'cc';
import { GAME } from '../game/GameConfig';

let _ball: Mesh | null = null;
let _floor: Mesh | null = null;
let _rim: Mesh | null = null;
let _padQuad: Mesh | null = null;
let _baseTex: Texture2D | null = null;
let _plusTex: Texture2D | null = null;
let _baseMat: Material | null = null;
let _plusMat: Material | null = null;
let _slotBoot: Promise<void> | null = null;
const _mats = new Map<string, Material>();

export const SLOT_PAD_TOP = 0.012;
const SLOT_PAD_SIZE = 0.69;
/** Local -Z after the pad faces the camera: sit behind the turret. */
export const SLOT_PAD_BACK = -0.18;
/** Turret lift / forward from the slot origin when seated. */
export const SLOT_UNIT_LIFT = 0.04;
export const SLOT_UNIT_FWD = 0.12;

function glossy(key: string, color: Color, roughness: number, emit: number): Material {
  let mat = _mats.get(key);
  if (mat) return mat;
  mat = new Material();
  mat.initialize({ effectName: 'builtin-standard' });
  mat.setProperty('mainColor', color);
  mat.setProperty('roughness', roughness);
  mat.setProperty('metallic', 0);
  mat.setProperty('emissive', color);
  mat.setProperty('emissiveScale', new Vec3(emit, emit, emit));
  _mats.set(key, mat);
  return mat;
}

export function getToyBall(): Mesh | null {
  if (_ball) return _ball;
  const su = 12;
  const sv = 8;
  const pos: number[] = [];
  const nrm: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let v = 0; v <= sv; v++) {
    const phi = (v / sv) * Math.PI;
    const cy = Math.cos(phi);
    const r = Math.sin(phi);
    for (let u = 0; u <= su; u++) {
      const th = (u / su) * Math.PI * 2;
      const cx = r * Math.cos(th);
      const cz = r * Math.sin(th);
      pos.push(cx * 0.5, cy * 0.5, cz * 0.5);
      nrm.push(cx, cy, cz);
      uvs.push(u / su, v / sv);
    }
  }
  const stride = su + 1;
  for (let v = 0; v < sv; v++) {
    for (let u = 0; u < su; u++) {
      const i0 = v * stride + u;
      const i1 = i0 + 1;
      const i2 = i0 + stride;
      const i3 = i2 + 1;
      idx.push(i0, i2, i1, i1, i2, i3);
    }
  }
  _ball = utils.MeshUtils.createMesh({
    positions: pos,
    normals: nrm,
    uvs,
    indices: idx,
    minPos: new Vec3(-0.5, -0.5, -0.5),
    maxPos: new Vec3(0.5, 0.5, 0.5),
    boundingRadius: 0.5,
  });
  return _ball;
}

function finish(
  pos: number[],
  nrm: number[],
  uvs: number[],
  idx: number[],
  r: number,
  y0: number,
  y1: number,
): Mesh | null {
  return utils.MeshUtils.createMesh({
    positions: pos,
    normals: nrm,
    uvs,
    indices: idx,
    minPos: new Vec3(-r, y0, -r),
    maxPos: new Vec3(r, y1, r),
    boundingRadius: Math.hypot(r, Math.max(Math.abs(y0), Math.abs(y1))),
  });
}

function lathe(profile: ReadonlyArray<readonly [number, number]>, segs: number): Mesh | null {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const n = profile.length;
  let rMax = 0;
  let y0 = 1e9;
  let y1 = -1e9;
  for (let i = 0; i < n; i++) {
    const [r, y] = profile[i];
    rMax = Math.max(rMax, r);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
    const prev = profile[Math.max(0, i - 1)];
    const next = profile[Math.min(n - 1, i + 1)];
    let nr = next[1] - prev[1];
    let ny = prev[0] - next[0];
    const len = Math.hypot(nr, ny) || 1;
    nr /= len;
    ny /= len;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const s = Math.sin(a);
      const c = Math.cos(a);
      pos.push(r * s, y, r * c);
      nrm.push(nr * s, ny, nr * c);
      uvs.push(j / segs, i / Math.max(1, n - 1));
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      const a = i * segs + j;
      const b = i * segs + j1;
      const c = (i + 1) * segs + j;
      const d = (i + 1) * segs + j1;
      idx.push(a, c, d, a, d, b);
    }
  }
  return finish(pos, nrm, uvs, idx, rMax, y0, y1);
}

function arc(cx: number, cy: number, rad: number, a0: number, a1: number, steps: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = a0 + ((a1 - a0) * i) / steps;
    out.push([cx + Math.cos(t) * rad, cy + Math.sin(t) * rad]);
  }
  return out;
}

function getFloor(): Mesh | null {
  if (_floor) return _floor;
  _floor = lathe(
    [
      [0.02, 0.006],
      [0.2, 0.006],
      [0.2, 0.018],
      [0.02, 0.018],
    ],
    32,
  );
  return _floor;
}

function getRim(): Mesh | null {
  if (_rim) return _rim;
  const R = 0.26;
  const tube = 0.062;
  const y = 0.03;
  const segR = 32;
  const segT = 14;
  const pos: number[] = [];
  const nrm: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segR; i++) {
    const u = (i / segR) * Math.PI * 2;
    const su = Math.sin(u);
    const cu = Math.cos(u);
    for (let j = 0; j <= segT; j++) {
      const v = (j / segT) * Math.PI * 2;
      const cv = Math.cos(v);
      const sv = Math.sin(v);
      pos.push((R + tube * cv) * su, y + tube * sv, (R + tube * cv) * cu);
      nrm.push(cv * su, sv, cv * cu);
      uvs.push(i / segR, j / segT);
    }
  }
  const stride = segT + 1;
  for (let i = 0; i < segR; i++) {
    for (let j = 0; j < segT; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      idx.push(a, c, d, a, d, b);
    }
  }
  _rim = finish(pos, nrm, uvs, idx, R + tube, y - tube, y + tube);
  return _rim;
}

function part(root: Node, name: string): Node {
  let n = root.getChildByName(name);
  if (!n) {
    n = new Node(name);
    root.addChild(n);
    n.layer = root.layer;
    n.addComponent(MeshRenderer);
  }
  n.active = true;
  return n;
}

function dress(node: Node, mesh: Mesh | null, mat: Material, y: number): void {
  node.setPosition(0, y, 0);
  node.setScale(1, 1, 1);
  node.setRotationFromEuler(0, 0, 0);
  const mr = node.getComponent(MeshRenderer);
  if (!mr || !mesh) return;
  mr.enabled = true;
  mr.mesh = mesh;
  mr.setSharedMaterial(mat, 0);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.ON;
}

function blob(
  root: Node,
  name: string,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  mat: Material,
  rx = 0,
  ry = 0,
  rz = 0,
): void {
  const n = part(root, name);
  n.setPosition(x, y, z);
  n.setScale(sx, sy, sz);
  n.setRotationFromEuler(rx, ry, rz);
  const mr = n.getComponent(MeshRenderer);
  const mesh = getToyBall();
  if (!mr || !mesh) return;
  mr.enabled = true;
  mr.mesh = mesh;
  mr.setSharedMaterial(mat, 0);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
}

const KEEP = new Set(['Pad']);

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

function padMat(tex: Texture2D): Material {
  const mat = new Material();
  mat.initialize({
    effectName: 'builtin-unlit',
    technique: 0,
    defines: { USE_TEXTURE: true },
    states: {
      depthStencilState: {
        depthTest: true,
        depthWrite: false,
        depthFunc: gfx.ComparisonFunc.LESS_EQUAL,
      },
      rasterizerState: {
        cullMode: gfx.CullMode.NONE,
      },
      blendState: {
        targets: [{
          blend: true,
          blendSrc: gfx.BlendFactor.SRC_ALPHA,
          blendDst: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
          blendSrcAlpha: gfx.BlendFactor.ONE,
          blendDstAlpha: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
        }],
      },
    },
  });
  mat.setProperty('mainTexture', tex);
  mat.setProperty('mainColor', Color.WHITE);
  return mat;
}

function padQuad(): Mesh | null {
  if (_padQuad) return _padQuad;
  _padQuad = utils.MeshUtils.createMesh({
    positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 1, 1, 1, 1, 0, 0, 0],
    indices: [0, 1, 2, 0, 2, 3],
    minPos: new Vec3(-0.5, -0.5, 0),
    maxPos: new Vec3(0.5, 0.5, 0),
    boundingRadius: Math.SQRT1_2,
  });
  return _padQuad;
}

export function preloadToySlots(): Promise<void> {
  if (_baseMat && _plusMat) return Promise.resolve();
  if (_slotBoot) return _slotBoot;
  _slotBoot = Promise.all([loadImage('toys/slot-base'), loadImage('toys/slot-plus')]).then(([base, plus]) => {
    if (base) {
      _baseTex = texFrom(base);
      _baseMat = padMat(_baseTex);
    }
    if (plus) {
      _plusTex = texFrom(plus);
      _plusMat = padMat(_plusTex);
    }
  });
  return _slotBoot;
}

export function applyToySlot(root: Node, locked = false): void {
  root.setScale(1, 1, 1);
  const body = root.getComponent(MeshRenderer);
  if (body) body.enabled = false;
  root.removeComponent('RenderRoot2D');
  for (const n of root.children) {
    if (!KEEP.has(n.name)) n.active = false;
  }

  const pad = part(root, 'Pad');
  pad.setSiblingIndex(0);
  pad.setPosition(0, 0, SLOT_PAD_BACK);
  pad.setRotationFromEuler(-GAME.worldCamPitchDeg, 0, 0);
  pad.setScale(SLOT_PAD_SIZE, SLOT_PAD_SIZE, 1);
  pad.removeComponent('Sprite');
  pad.removeComponent('UITransform');
  const mr = pad.getComponent(MeshRenderer);
  const mesh = padQuad();
  const mat = locked ? _plusMat : _baseMat;
  if (mr && mesh && mat) {
    mr.enabled = true;
    mr.mesh = mesh;
    mr.setSharedMaterial(mat, 0);
    mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
    mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  } else if (mr) {
    mr.enabled = false;
  }
}

export function applyToyHand(root: Node): void {
  const skin = glossy('skin', new Color(255, 196, 168, 255), 0.22, 0.18);
  const nail = glossy('nail', new Color(255, 230, 220, 255), 0.14, 0.28);

  blob(root, 'Palm', 0, 0, 0, 0.2, 0.16, 0.15, skin);
  blob(root, 'Finger0', 0.015, -0.14, 0.02, 0.055, 0.2, 0.055, skin);
  blob(root, 'Finger1', 0.06, -0.07, 0.01, 0.05, 0.09, 0.05, skin);
  blob(root, 'Finger2', 0.1, -0.045, 0, 0.045, 0.07, 0.045, skin);
  blob(root, 'Finger3', -0.07, -0.04, 0.03, 0.055, 0.08, 0.055, skin);
  blob(root, 'Tip', 0.015, -0.24, 0.02, 0.048, 0.05, 0.048, nail);
  root.setRotationFromEuler(-18, 20, 8);
}
