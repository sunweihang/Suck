import { Color, Material, Mesh, MeshRenderer, Node, Vec3, utils } from 'cc';

let _ball: Mesh | null = null;
let _floor: Mesh | null = null;
let _rim: Mesh | null = null;
const _mats = new Map<string, Material>();

export const SLOT_PAD_TOP = 0.012;

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

const KEEP = new Set(['Floor', 'Rim', 'SignPost', 'SignBoard', 'SignX0', 'SignX1']);

export function applyToySlot(root: Node, locked = false): void {
  root.setScale(1, 1, 1);
  const body = root.getComponent(MeshRenderer);
  if (body) body.enabled = false;
  for (const n of root.children) {
    if (!KEEP.has(n.name)) n.active = false;
  }

  const rim = locked
    ? glossy('rimLock', new Color(120, 124, 148, 255), 0.36, 0.1)
    : glossy('rimOpen', new Color(255, 246, 232, 255), 0.28, 0.2);
  const floor = locked
    ? glossy('floorLock', new Color(88, 92, 114, 255), 0.48, 0.08)
    : glossy('floorOpen', new Color(236, 210, 186, 255), 0.42, 0.14);
  dress(part(root, 'Floor'), getFloor(), floor, 0);
  dress(part(root, 'Rim'), getRim(), rim, 0);

  const post = part(root, 'SignPost');
  const board = part(root, 'SignBoard');
  const x0 = part(root, 'SignX0');
  const x1 = part(root, 'SignX1');
  if (!locked) {
    post.active = false;
    board.active = false;
    x0.active = false;
    x1.active = false;
    return;
  }

  const wood = glossy('signWood', new Color(168, 112, 64, 255), 0.48, 0.12);
  const orange = glossy('signBoard', new Color(255, 132, 28, 255), 0.48, 0.18);
  const red = glossy('signXRed', new Color(220, 32, 40, 255), 0.36, 0.22);
  blob(root, 'SignPost', 0, 0.1, 0, 0.04, 0.15, 0.04, wood);
  blob(root, 'SignBoard', 0, 0.24, 0.01, 0.26, 0.2, 0.05, orange);
  blob(root, 'SignX0', 0, 0.24, 0.034, 0.2, 0.05, 0.036, red, 0, 0, 38);
  blob(root, 'SignX1', 0, 0.24, 0.034, 0.2, 0.05, 0.036, red, 0, 0, -38);
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
