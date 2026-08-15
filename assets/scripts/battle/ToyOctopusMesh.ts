import { Color, Material, Mesh, MeshRenderer, Node, Vec3, utils } from 'cc';
import { ColorId } from '../game/GameConfig';
import { getClayMat, makeInstancedMat } from './ToyBlockMesh';

const ISO = 1;
const NX = 26;
const NY = 24;
const NZ = 26;

type Blob = readonly [number, number, number, number];

const { blobs: BLOBS, lift: Y_LIFT } = buildBlobs();
const { MIN, MAX } = boundsFromBlobs(BLOBS);

export const OCTOPUS_STAND_Y = 0.012;
export const OCTO_POWER_LOCAL = new Vec3(0, 0.062 + Y_LIFT, 0.138);
export const OCTO_BACK_LOCAL = new Vec3(0, 0.138 + Y_LIFT - 0.14, -0.06);

let _mesh: Mesh | null = null;
let _ball: Mesh | null = null;
let _eyeMat: Material | null = null;
let _pupilMat: Material | null = null;
let _hiMat: Material | null = null;

function buildBlobs(): { blobs: Blob[]; lift: number } {
  const out: Blob[] = [];
  const add = (x: number, y: number, z: number, r: number): void => {
    out.push([x, y, z, r]);
  };

  add(0, 0.082, 0.01, 0.148);
  add(0, 0.138, 0.016, 0.112);
  add(0, 0.046, 0.004, 0.122);
  add(0.068, 0.076, 0.068, 0.072);
  add(-0.068, 0.076, 0.068, 0.072);
  add(0, 0.034, 0.064, 0.064);
  add(0, 0.02, -0.02, 0.086);
  add(0.04, 0.116, 0.108, 0.038);
  add(-0.04, 0.116, 0.108, 0.038);

  const D = Math.PI / 180;
  const tents = [
    { a: 24 * D, reach: 0.158, drop: 0.136, curl: 0.02, fat: 0.052 },
    { a: 66 * D, reach: 0.172, drop: 0.144, curl: 0.014, fat: 0.056 },
    { a: 110 * D, reach: 0.18, drop: 0.148, curl: -0.01, fat: 0.058 },
    { a: 156 * D, reach: 0.186, drop: 0.15, curl: 0.012, fat: 0.058 },
    { a: 204 * D, reach: 0.186, drop: 0.15, curl: -0.012, fat: 0.058 },
    { a: 250 * D, reach: 0.18, drop: 0.148, curl: 0.01, fat: 0.058 },
    { a: 294 * D, reach: 0.172, drop: 0.144, curl: -0.014, fat: 0.056 },
    { a: 336 * D, reach: 0.158, drop: 0.136, curl: -0.02, fat: 0.052 },
  ];
  for (const t of tents) addTentacle(add, t.a, t.reach, t.drop, t.curl, t.fat);
  const lift = -lowestSurface(out) + 0.004;
  for (let i = 0; i < out.length; i++) {
    const b = out[i];
    out[i] = [b[0], b[1] + lift, b[2], b[3]];
  }
  return { blobs: out, lift };
}

function lowestSurface(blobs: Blob[]): number {
  let lo = 1e9;
  for (const [, y, , r] of blobs) lo = Math.min(lo, y - r);
  return lo;
}

function boundsFromBlobs(blobs: Blob[]): { MIN: Vec3; MAX: Vec3 } {
  let x0 = 1e9;
  let y0 = 1e9;
  let z0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  let z1 = -1e9;
  for (const [x, y, z, r] of blobs) {
    const pad = r * 1.35 + 0.1;
    x0 = Math.min(x0, x - pad);
    y0 = Math.min(y0, y - pad);
    z0 = Math.min(z0, z - pad);
    x1 = Math.max(x1, x + pad);
    y1 = Math.max(y1, y + pad);
    z1 = Math.max(z1, z + pad);
  }
  return { MIN: new Vec3(x0, y0, z0), MAX: new Vec3(x1, y1, z1) };
}

function addTentacle(
  add: (x: number, y: number, z: number, r: number) => void,
  a: number,
  reach: number,
  drop: number,
  curl: number,
  fat: number,
): void {
  const sx = Math.sin(a);
  const sz = Math.cos(a);
  const px = Math.cos(a);
  const pz = -Math.sin(a);
  const p0 = [sx * 0.04, 0.042, sz * 0.04];
  const p1 = [sx * reach * 0.42, 0.01, sz * reach * 0.42];
  const p2 = [sx * reach * 0.78 + px * curl, -drop * 0.78, sz * reach * 0.78 + pz * curl];
  const p3 = [sx * reach * 1.02 + px * curl * 0.28, -drop, sz * reach * 1.02 + pz * curl * 0.28];
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const u = 1 - t;
    const b0 = u * u * u;
    const b1 = 3 * u * u * t;
    const b2 = 3 * u * t * t;
    const b3 = t * t * t;
    add(
      b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
      b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1],
      b0 * p0[2] + b1 * p1[2] + b2 * p2[2] + b3 * p3[2],
      fat * (0.94 - 0.48 * t * t),
    );
  }
  add(p3[0], p3[1] - fat * 0.12, p3[2], fat * 0.5);
}

function field(x: number, y: number, z: number): number {
  let v = 0;
  for (let i = 0; i < BLOBS.length; i++) {
    const b = BLOBS[i];
    const dx = x - b[0];
    const dy = y - b[1];
    const dz = z - b[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    const R = b[3] * 1.62;
    const R2 = R * R;
    if (d2 >= R2) continue;
    v += (b[3] * b[3]) / Math.max(d2, 1e-5);
  }
  return v;
}

function gradOut(x: number, y: number, z: number, n: number[]): void {
  const e = 0.0035;
  let nx = field(x - e, y, z) - field(x + e, y, z);
  let ny = field(x, y - e, z) - field(x, y + e, z);
  let nz = field(x, y, z - e) - field(x, y, z + e);
  const len = Math.hypot(nx, ny, nz) || 1;
  n[0] = nx / len;
  n[1] = ny / len;
  n[2] = nz / len;
}

function buildOctopusMesh(): Mesh {
  const dx = (MAX.x - MIN.x) / NX;
  const dy = (MAX.y - MIN.y) / NY;
  const dz = (MAX.z - MIN.z) / NZ;
  const sx = NX + 1;
  const sy = NY + 1;
  const values = new Float32Array(sx * sy * (NZ + 1));
  const gi = (i: number, j: number, k: number): number => i + j * sx + k * sx * sy;
  for (let k = 0; k <= NZ; k++) {
    const z = MIN.z + k * dz;
    for (let j = 0; j <= NY; j++) {
      const y = MIN.y + j * dy;
      for (let i = 0; i < sx; i++) {
        values[gi(i, j, k)] = field(MIN.x + i * dx, y, z);
      }
    }
  }

  const cell = (i: number, j: number, k: number): number => i + j * NX + k * NX * NY;
  const vertOf = new Int32Array(NX * NY * NZ).fill(-1);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const nrm = [0, 0, 0];
  const C = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ];
  const E = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];

  for (let k = 0; k < NZ; k++) {
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const cv = new Array<number>(8);
        let inside = 0;
        for (let c = 0; c < 8; c++) {
          const p = C[c];
          cv[c] = values[gi(i + p[0], j + p[1], k + p[2])];
          if (cv[c] >= ISO) inside++;
        }
        if (inside === 0 || inside === 8) continue;
        let ax = 0;
        let ay = 0;
        let az = 0;
        let hits = 0;
        for (let e = 0; e < 12; e++) {
          const a = E[e][0];
          const b = E[e][1];
          const va = cv[a];
          const vb = cv[b];
          if ((va >= ISO) === (vb >= ISO)) continue;
          const t = (ISO - va) / (vb - va || 1e-6);
          ax += MIN.x + (i + C[a][0] + (C[b][0] - C[a][0]) * t) * dx;
          ay += MIN.y + (j + C[a][1] + (C[b][1] - C[a][1]) * t) * dy;
          az += MIN.z + (k + C[a][2] + (C[b][2] - C[a][2]) * t) * dz;
          hits++;
        }
        if (!hits) continue;
        ax /= hits;
        ay /= hits;
        az /= hits;
        vertOf[cell(i, j, k)] = positions.length / 3;
        positions.push(ax, ay, az);
        gradOut(ax, ay, az, nrm);
        normals.push(nrm[0], nrm[1], nrm[2]);
        uvs.push(i / NX, k / NZ);
      }
    }
  }

  const indices: number[] = [];
  const pushTri = (a: number, b: number, c: number): void => {
    if (a < 0 || b < 0 || c < 0) return;
    const ax = positions[b * 3] - positions[a * 3];
    const ay = positions[b * 3 + 1] - positions[a * 3 + 1];
    const az = positions[b * 3 + 2] - positions[a * 3 + 2];
    const bx = positions[c * 3] - positions[a * 3];
    const by = positions[c * 3 + 1] - positions[a * 3 + 1];
    const bz = positions[c * 3 + 2] - positions[a * 3 + 2];
    const fx = ay * bz - az * by;
    const fy = az * bx - ax * bz;
    const fz = ax * by - ay * bx;
    const nx = normals[a * 3] + normals[b * 3] + normals[c * 3];
    const ny = normals[a * 3 + 1] + normals[b * 3 + 1] + normals[c * 3 + 1];
    const nz = normals[a * 3 + 2] + normals[b * 3 + 2] + normals[c * 3 + 2];
    if (fx * nx + fy * ny + fz * nz < 0) indices.push(a, c, b);
    else indices.push(a, b, c);
  };
  const quad = (a: number, b: number, c: number, d: number): void => {
    pushTri(a, b, c);
    pushTri(a, c, d);
  };

  for (let k = 1; k < NZ; k++) {
    for (let j = 1; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const va = values[gi(i, j, k)];
        const vb = values[gi(i + 1, j, k)];
        if ((va >= ISO) === (vb >= ISO)) continue;
        quad(
          vertOf[cell(i, j - 1, k - 1)],
          vertOf[cell(i, j, k - 1)],
          vertOf[cell(i, j, k)],
          vertOf[cell(i, j - 1, k)],
        );
      }
    }
  }
  for (let k = 1; k < NZ; k++) {
    for (let j = 0; j < NY; j++) {
      for (let i = 1; i < NX; i++) {
        const va = values[gi(i, j, k)];
        const vb = values[gi(i, j + 1, k)];
        if ((va >= ISO) === (vb >= ISO)) continue;
        quad(
          vertOf[cell(i - 1, j, k - 1)],
          vertOf[cell(i, j, k - 1)],
          vertOf[cell(i, j, k)],
          vertOf[cell(i - 1, j, k)],
        );
      }
    }
  }
  for (let k = 0; k < NZ; k++) {
    for (let j = 1; j < NY; j++) {
      for (let i = 1; i < NX; i++) {
        const va = values[gi(i, j, k)];
        const vb = values[gi(i, j, k + 1)];
        if ((va >= ISO) === (vb >= ISO)) continue;
        quad(
          vertOf[cell(i - 1, j - 1, k)],
          vertOf[cell(i, j - 1, k)],
          vertOf[cell(i, j, k)],
          vertOf[cell(i - 1, j, k)],
        );
      }
    }
  }

  smooth(positions, indices, 2, 0.38);
  for (let i = 0; i < positions.length; i += 3) {
    gradOut(positions[i], positions[i + 1], positions[i + 2], nrm);
    normals[i] = nrm[0];
    normals[i + 1] = nrm[1];
    normals[i + 2] = nrm[2];
  }

  if (indices.length < 3) {
    return getBallMesh();
  }
  return utils.MeshUtils.createMesh({
    positions,
    normals,
    uvs,
    indices,
    minPos: MIN,
    maxPos: MAX,
    boundingRadius: 0.55,
  });
}

function getBallMesh(): Mesh {
  if (_ball) return _ball;
  const su = 12;
  const sv = 8;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let v = 0; v <= sv; v++) {
    const phi = (v / sv) * Math.PI;
    const cy = Math.cos(phi);
    const r = Math.sin(phi);
    for (let u = 0; u <= su; u++) {
      const th = (u / su) * Math.PI * 2;
      const cx = r * Math.cos(th);
      const cz = r * Math.sin(th);
      positions.push(cx * 0.5, cy * 0.5, cz * 0.5);
      normals.push(cx, cy, cz);
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
      indices.push(i0, i2, i1, i1, i2, i3);
    }
  }
  _ball = utils.MeshUtils.createMesh({
    positions,
    normals,
    uvs,
    indices,
    minPos: new Vec3(-0.5, -0.5, -0.5),
    maxPos: new Vec3(0.5, 0.5, 0.5),
    boundingRadius: 0.5,
  });
  return _ball;
}

function smooth(pos: number[], idx: number[], iters: number, t: number): void {
  const n = pos.length / 3;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i];
    const b = idx[i + 1];
    const c = idx[i + 2];
    adj[a].push(b, c);
    adj[b].push(a, c);
    adj[c].push(a, b);
  }
  const next = new Float32Array(pos.length);
  for (let pass = 0; pass < iters; pass++) {
    for (let v = 0; v < n; v++) {
      const nb = adj[v];
      if (!nb.length) {
        next[v * 3] = pos[v * 3];
        next[v * 3 + 1] = pos[v * 3 + 1];
        next[v * 3 + 2] = pos[v * 3 + 2];
        continue;
      }
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let k = 0; k < nb.length; k++) {
        const o = nb[k] * 3;
        sx += pos[o];
        sy += pos[o + 1];
        sz += pos[o + 2];
      }
      const inv = 1 / nb.length;
      next[v * 3] = pos[v * 3] + (sx * inv - pos[v * 3]) * t;
      next[v * 3 + 1] = pos[v * 3 + 1] + (sy * inv - pos[v * 3 + 1]) * t;
      next[v * 3 + 2] = pos[v * 3 + 2] + (sz * inv - pos[v * 3 + 2]) * t;
    }
    for (let i = 0; i < pos.length; i++) pos[i] = next[i];
  }
}

function getOctopusMesh(): Mesh {
  if (!_mesh) _mesh = buildOctopusMesh();
  return _mesh;
}

function glossy(color: Color, roughness: number, emit: number): Material {
  return makeInstancedMat(color, roughness, emit);
}

function eyeMats(): { eye: Material; pupil: Material; hi: Material } {
  if (!_eyeMat) _eyeMat = glossy(new Color(252, 252, 255, 255), 0.14, 0.28);
  if (!_pupilMat) _pupilMat = glossy(new Color(22, 24, 30, 255), 0.22, 0.04);
  if (!_hiMat) _hiMat = glossy(new Color(255, 255, 255, 255), 0.08, 0.55);
  return { eye: _eyeMat, pupil: _pupilMat, hi: _hiMat };
}

function place(
  node: Node | null,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  mat: Material,
  cast: boolean,
): void {
  if (!node) return;
  node.active = true;
  node.setPosition(x, y, z);
  node.setScale(sx, sy, sz);
  const mr = node.getComponent(MeshRenderer);
  if (!mr) return;
  mr.mesh = getBallMesh();
  mr.setSharedMaterial(mat, 0);
  mr.shadowCastingMode = cast
    ? MeshRenderer.ShadowCastingMode.ON
    : MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
}

function ensureHi(root: Node, name: string, src: Node | null): Node {
  let n = root.getChildByName(name);
  if (n) return n;
  n = new Node(name);
  root.addChild(n);
  n.layer = root.layer;
  const mr = n.addComponent(MeshRenderer);
  const srcMr = src?.getComponent(MeshRenderer);
  if (srcMr?.mesh) mr.mesh = srcMr.mesh;
  return n;
}

export function applyToyOctopus(root: Node, colorId: ColorId): void {
  const body = root.getChildByName('Body');
  if (body) {
    body.setPosition(0, 0, 0);
    body.setScale(1, 1, 1);
    const mr = body.getComponent(MeshRenderer);
    if (mr) {
      mr.mesh = getOctopusMesh();
      mr.setSharedMaterial(getClayMat(colorId), 0);
      mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON;
      mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
    }
  }
  for (const child of root.children) {
    if (child.name.startsWith('Leg')) child.active = false;
  }

  const mats = eyeMats();
  const eyeL = root.getChildByName('EyeL');
  const eyeR = root.getChildByName('EyeR');
  place(eyeL, -0.044, 0.118 + Y_LIFT, 0.128, 0.09, 0.104, 0.054, mats.eye, false);
  place(eyeR, 0.044, 0.118 + Y_LIFT, 0.128, 0.09, 0.104, 0.054, mats.eye, false);
  place(root.getChildByName('PupilL'), -0.038, 0.11 + Y_LIFT, 0.154, 0.03, 0.034, 0.022, mats.pupil, false);
  place(root.getChildByName('PupilR'), 0.038, 0.11 + Y_LIFT, 0.154, 0.03, 0.034, 0.022, mats.pupil, false);
  place(ensureHi(root, 'HighlightL', eyeL), -0.054, 0.128 + Y_LIFT, 0.168, 0.016, 0.018, 0.012, mats.hi, false);
  place(ensureHi(root, 'HighlightR', eyeR), 0.03, 0.128 + Y_LIFT, 0.168, 0.016, 0.018, 0.012, mats.hi, false);
}
