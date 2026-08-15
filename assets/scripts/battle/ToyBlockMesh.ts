import { Color, Material, Mesh, MeshRenderer, Vec3, utils } from 'cc';
import { ColorId } from '../game/GameConfig';

const HALF = 0.5;
const RADIUS = 0.148;
const SEG = 3;

const BLOCK_COLOR: Record<ColorId, Color> = {
  [ColorId.Orange]: new Color(255, 132, 28, 255),
  [ColorId.Yellow]: new Color(255, 220, 40, 255),
  [ColorId.Cyan]: new Color(24, 228, 236, 255),
  [ColorId.Lime]: new Color(96, 224, 48, 255),
  [ColorId.Pink]: new Color(255, 84, 164, 255),
  [ColorId.Violet]: new Color(164, 92, 255, 255),
  [ColorId.Red]: new Color(255, 60, 76, 255),
  [ColorId.Sky]: new Color(72, 176, 255, 255),
  [ColorId.Coral]: new Color(255, 124, 100, 255),
  [ColorId.Mint]: new Color(0, 212, 128, 255),
  [ColorId.Magenta]: new Color(240, 56, 216, 255),
  [ColorId.Gold]: new Color(255, 196, 44, 255),
};

let _mesh: Mesh | null = null;
const _mats = new Map<ColorId, Material>();

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function project(x: number, y: number, z: number, pos: number[], nrm: number[]): void {
  const lim = HALF - RADIUS;
  const ix = clamp(x, -lim, lim);
  const iy = clamp(y, -lim, lim);
  const iz = clamp(z, -lim, lim);
  let dx = x - ix;
  let dy = y - iy;
  let dz = z - iz;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const az = Math.abs(z);
    if (ax >= ay && ax >= az) {
      dx = Math.sign(x);
      dy = 0;
      dz = 0;
    } else if (ay >= az) {
      dx = 0;
      dy = Math.sign(y);
      dz = 0;
    } else {
      dx = 0;
      dy = 0;
      dz = Math.sign(z);
    }
  } else {
    dx /= len;
    dy /= len;
    dz /= len;
  }
  pos.push(ix + dx * RADIUS, iy + dy * RADIUS, iz + dz * RADIUS);
  nrm.push(dx, dy, dz);
}

function addFace(axis: number, sign: number, pos: number[], nrm: number[], uvs: number[], idx: number[]): void {
  const n = SEG + 1;
  const base = pos.length / 3;
  const a1 = (axis + 1) % 3;
  const a2 = (axis + 2) % 3;
  const p = [0, 0, 0];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      p[axis] = sign * HALF;
      p[a1] = ((i / SEG) * 2 - 1) * HALF;
      p[a2] = ((j / SEG) * 2 - 1) * HALF;
      project(p[0], p[1], p[2], pos, nrm);
      uvs.push(i / SEG, j / SEG);
    }
  }
  for (let j = 0; j < SEG; j++) {
    for (let i = 0; i < SEG; i++) {
      const i0 = base + j * n + i;
      const i1 = i0 + 1;
      const i2 = i0 + n;
      const i3 = i2 + 1;
      if (sign > 0) idx.push(i0, i1, i3, i0, i3, i2);
      else idx.push(i0, i3, i1, i0, i2, i3);
    }
  }
}

function makeMesh(data: Parameters<typeof utils.MeshUtils.createMesh>[0]): Mesh | null {
  return utils.MeshUtils.createMesh(data) ?? null;
}

export function getToyBlockMesh(): Mesh | null {
  if (_mesh) return _mesh;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let axis = 0; axis < 3; axis++) {
    addFace(axis, 1, positions, normals, uvs, indices);
    addFace(axis, -1, positions, normals, uvs, indices);
  }
  _mesh = makeMesh({
    positions,
    normals,
    uvs,
    indices,
    minPos: new Vec3(-HALF, -HALF, -HALF),
    maxPos: new Vec3(HALF, HALF, HALF),
    boundingRadius: Math.SQRT1_2,
  });
  return _mesh;
}

function makeLitMat(color: Color, roughness: number, emit: number): Material {
  const mat = new Material();
  mat.initialize({ effectName: 'builtin-standard' });
  mat.setProperty('mainColor', color);
  mat.setProperty('roughness', roughness);
  mat.setProperty('metallic', 0);
  mat.setProperty('emissive', color);
  mat.setProperty('emissiveScale', new Vec3(emit, emit, emit));
  return mat;
}

export function makeInstancedMat(
  color: Color,
  roughness: number,
  emit: number,
): Material {
  return makeLitMat(color, roughness, emit);
}

export function getClayMat(id: ColorId): Material {
  let mat = _mats.get(id);
  if (mat) return mat;
  mat = makeLitMat(BLOCK_COLOR[id], 0.52, 0.18);
  _mats.set(id, mat);
  return mat;
}

export function applyMesh(
  mr: MeshRenderer | null,
  mesh: Mesh | null,
  mat: Material | null,
): boolean {
  if (!mr) return false;
  if (!mesh || !mat?.passes?.length) {
    mr.enabled = false;
    return false;
  }
  mr.enabled = false;
  mr.setSharedMaterial(mat, 0);
  mr.mesh = mesh;
  mr.enabled = true;
  return true;
}

export function applyToyBlock(
  node: { getComponent: (t: typeof MeshRenderer) => MeshRenderer | null },
  colorId: ColorId,
): void {
  const mr = node.getComponent(MeshRenderer);
  const mesh = getToyBlockMesh();
  if (!mr || !mesh) return;
  mr.mesh = mesh;
  mr.setSharedMaterial(getClayMat(colorId), 0);
  mr.enabled = true;
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
}

export function applyToySkin(
  node: { getComponentsInChildren: (t: typeof MeshRenderer) => MeshRenderer[] },
  colorId: ColorId,
): void {
  const mat = getClayMat(colorId);
  if (!mat.passes?.length) return;
  for (const mr of node.getComponentsInChildren(MeshRenderer)) {
    const name = mr.node.name;
    if (name.startsWith('Eye') || name.startsWith('Pupil')) continue;
    if (!mr.mesh) {
      mr.enabled = false;
      continue;
    }
    mr.setSharedMaterial(mat, 0);
    mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON;
    mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  }
}

export function applyShadowReceiver(node: { getComponent: (t: typeof MeshRenderer) => MeshRenderer | null }): void {
  const mr = node.getComponent(MeshRenderer);
  if (!mr) return;
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.ON;
}
