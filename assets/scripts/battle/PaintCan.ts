import { Color, Material, Mesh, MeshRenderer, Node, Vec3, utils } from 'cc';
import { ColorToken, TOKEN_RGB } from '../game/GameConfig';

type Pack = { p: number[]; n: number[]; u: number[]; i: number[] };

let _body: Mesh | null = null;
let _rim: Mesh | null = null;
let _handle: Mesh | null = null;
let _drip: Mesh | null = null;
let _gold: Material | null = null;

function meshOf(p: number[], n: number[], u: number[], i: number[]): Mesh | null {
  let minX = 1e9;
  let minY = 1e9;
  let minZ = 1e9;
  let maxX = -1e9;
  let maxY = -1e9;
  let maxZ = -1e9;
  for (let k = 0; k < p.length; k += 3) {
    minX = Math.min(minX, p[k]);
    minY = Math.min(minY, p[k + 1]);
    minZ = Math.min(minZ, p[k + 2]);
    maxX = Math.max(maxX, p[k]);
    maxY = Math.max(maxY, p[k + 1]);
    maxZ = Math.max(maxZ, p[k + 2]);
  }
  return utils.MeshUtils.createMesh({
    positions: p,
    normals: n,
    uvs: u,
    indices: i,
    minPos: new Vec3(minX, minY, minZ),
    maxPos: new Vec3(maxX, maxY, maxZ),
    boundingRadius: Math.hypot(maxX, maxY, maxZ),
  });
}

function append(dst: Pack, src: Pack): void {
  const base = dst.p.length / 3;
  for (let i = 0; i < src.p.length; i++) dst.p.push(src.p[i]);
  for (let i = 0; i < src.n.length; i++) dst.n.push(src.n[i]);
  for (let i = 0; i < src.u.length; i++) dst.u.push(src.u[i]);
  for (let i = 0; i < src.i.length; i++) dst.i.push(src.i[i] + base);
}

function lathe(profile: ReadonlyArray<readonly [number, number]>, segs: number): Pack {
  const n = profile.length;
  const p: number[] = [];
  const nrm: number[] = [];
  const u: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = profile[Math.max(0, i - 1)];
    const next = profile[Math.min(n - 1, i + 1)];
    let nr = next[1] - prev[1];
    let ny = prev[0] - next[0];
    const len = Math.hypot(nr, ny) || 1;
    nr /= len;
    ny /= len;
    for (let s = 0; s <= segs; s++) {
      const th = (s / segs) * Math.PI * 2;
      const c = Math.cos(th);
      const si = Math.sin(th);
      p.push(profile[i][0] * si, profile[i][1], profile[i][0] * c);
      nrm.push(nr * si, ny, nr * c);
      u.push(s / segs, i / Math.max(1, n - 1));
    }
  }
  const stride = segs + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < segs; s++) {
      const i0 = i * stride + s;
      const i1 = i0 + 1;
      const i2 = i0 + stride;
      const i3 = i2 + 1;
      idx.push(i0, i2, i1, i1, i2, i3);
    }
  }
  return { p, n: nrm, u, i: idx };
}

function sphere(cx: number, cy: number, cz: number, r: number, su: number, sv: number): Pack {
  const p: number[] = [];
  const nrm: number[] = [];
  const u: number[] = [];
  const idx: number[] = [];
  for (let v = 0; v <= sv; v++) {
    const phi = (v / sv) * Math.PI;
    const cy0 = Math.cos(phi);
    const rr = Math.sin(phi);
    for (let s = 0; s <= su; s++) {
      const th = (s / su) * Math.PI * 2;
      const nx = rr * Math.cos(th);
      const nz = rr * Math.sin(th);
      p.push(cx + nx * r, cy + cy0 * r, cz + nz * r);
      nrm.push(nx, cy0, nz);
      u.push(s / su, v / sv);
    }
  }
  const stride = su + 1;
  for (let v = 0; v < sv; v++) {
    for (let s = 0; s < su; s++) {
      const i0 = v * stride + s;
      const i1 = i0 + 1;
      const i2 = i0 + stride;
      const i3 = i2 + 1;
      idx.push(i0, i2, i1, i1, i2, i3);
    }
  }
  return { p, n: nrm, u, i: idx };
}

function tube(path: ReadonlyArray<readonly [number, number, number]>, radius: number, segs: number): Pack {
  const p: number[] = [];
  const nrm: number[] = [];
  const u: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    let tz = b[2] - a[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    let bx = -ty;
    let by = tx;
    let bz = 0;
    const bl = Math.hypot(bx, by, bz) || 1;
    bx /= bl;
    by /= bl;
    bz /= bl;
    const nx = by * tz - bz * ty;
    const ny = bz * tx - bx * tz;
    const nz = bx * ty - by * tx;
    for (let j = 0; j < segs; j++) {
      const ang = (j / segs) * Math.PI * 2;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const vx = bx * c + nx * s;
      const vy = by * c + ny * s;
      const vz = bz * c + nz * s;
      p.push(path[i][0] + vx * radius, path[i][1] + vy * radius, path[i][2] + vz * radius);
      nrm.push(vx, vy, vz);
      u.push(j / segs, i / Math.max(1, path.length - 1));
    }
  }
  for (let i = 0; i < path.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      const a = i * segs + j;
      const b = i * segs + j1;
      const c = (i + 1) * segs + j;
      const d = (i + 1) * segs + j1;
      idx.push(a, c, b, b, c, d);
    }
  }
  return { p, n: nrm, u, i: idx };
}

function ensureMeshes(): void {
  if (_body && _rim && _handle && _drip) return;
  _body = meshOf(...toArgs(lathe([
    [0.00, -0.46],
    [0.34, -0.46],
    [0.42, -0.40],
    [0.44, -0.18],
    [0.44, 0.10],
    [0.40, 0.20],
    [0.30, 0.24],
    [0.00, 0.24],
  ], 28)));
  _rim = meshOf(...toArgs(lathe([
    [0.30, 0.22],
    [0.46, 0.24],
    [0.48, 0.30],
    [0.44, 0.36],
    [0.28, 0.36],
    [0.26, 0.30],
    [0.32, 0.26],
  ], 28)));
  const handlePath: Array<[number, number, number]> = [];
  for (let k = 0; k <= 14; k++) {
    const t = k / 14;
    const a = Math.PI * t;
    handlePath.push([Math.cos(a) * 0.38, 0.32 + Math.sin(a) * 0.14, 0.02]);
  }
  const handle: Pack = { p: [], n: [], u: [], i: [] };
  append(handle, tube(handlePath, 0.055, 12));
  append(handle, sphere(-0.38, 0.32, 0.02, 0.07, 12, 8));
  append(handle, sphere(0.38, 0.32, 0.02, 0.07, 12, 8));
  _handle = meshOf(handle.p, handle.n, handle.u, handle.i);
  const drip: Pack = { p: [], n: [], u: [], i: [] };
  append(drip, sphere(0.00, 0.28, 0.44, 0.10, 14, 10));
  append(drip, sphere(0.02, 0.08, 0.46, 0.08, 12, 8));
  append(drip, sphere(0.03, -0.10, 0.45, 0.06, 12, 8));
  _drip = meshOf(drip.p, drip.n, drip.u, drip.i);
}

function toArgs(pack: Pack): [number[], number[], number[], number[]] {
  return [pack.p, pack.n, pack.u, pack.i];
}

function clayColor(token: ColorToken, shade: number): Color {
  const rgb = TOKEN_RGB[token] ?? TOKEN_RGB.p;
  return new Color(
    Math.min(255, Math.round(rgb[0] * shade)),
    Math.min(255, Math.round(rgb[1] * shade)),
    Math.min(255, Math.round(rgb[2] * shade)),
    255,
  );
}

function paintMesh(mr: MeshRenderer, token: ColorToken, shade: number, emit: number): void {
  const color = clayColor(token, shade);
  const inst = mr.getMaterialInstance(0);
  if (!inst) return;
  inst.setProperty('mainColor', color);
  inst.setProperty('roughness', 0.2);
  inst.setProperty('metallic', 0.04);
  inst.setProperty('emissive', color);
  inst.setProperty('emissiveScale', new Vec3(emit, emit, emit));
}

function goldMat(): Material {
  if (_gold) return _gold;
  const mat = new Material();
  mat.initialize({ effectName: 'builtin-standard' });
  mat.setProperty('mainColor', new Color(255, 220, 88, 255));
  mat.setProperty('roughness', 0.16);
  mat.setProperty('metallic', 0.42);
  mat.setProperty('emissive', new Color(255, 210, 72, 255));
  mat.setProperty('emissiveScale', new Vec3(0.28, 0.28, 0.28));
  _gold = mat;
  return mat;
}

function dress(root: Node, name: string, mesh: Mesh | null, mat: Material | null, token?: ColorToken, shade = 1, emit = 0.16): void {
  if (!mesh) return;
  let n = root.getChildByName(name);
  if (!n) {
    n = new Node(name);
    n.layer = root.layer;
    root.addChild(n);
  }
  n.setPosition(0, 0, 0);
  n.setScale(1, 1, 1);
  const mr = n.getComponent(MeshRenderer) ?? n.addComponent(MeshRenderer);
  mr.mesh = mesh;
  if (mat) mr.setSharedMaterial(mat, 0);
  mr.enabled = true;
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  if (token) paintMesh(mr, token, shade, emit);
}

export function preloadPaintCan(): Promise<void> {
  ensureMeshes();
  return Promise.resolve();
}

export function applyPaintCan(root: Node, token: ColorToken): void {
  ensureMeshes();
  root.getChildByName('PaintCan')?.destroy();
  root.getChildByName('PaintRig')?.destroy();
  const mr = root.getComponent(MeshRenderer);
  if (mr && _body) {
    mr.mesh = _body;
    mr.enabled = true;
    paintMesh(mr, token, 1, 0.16);
  }
  dress(root, 'PaintRim', _rim, goldMat());
  dress(root, 'PaintHandle', _handle, null, token, 0.72, 0.1);
  dress(root, 'PaintDrip', _drip, null, token, 1.15, 0.26);
}
