import { Color, Material, MeshRenderer, Node, Vec3 } from 'cc';
import { ColorToken, TOKEN_RGB } from '../game/GameConfig';
import { applyPaintCan } from './PaintCan';
import { applyToyCaster } from './ToyBlockMesh';
import { getToyBall } from './ToySlotMesh';

const _mats = new Map<string, Material>();

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

function rgbOf(token: ColorToken): Color {
  const rgb = TOKEN_RGB[token] ?? TOKEN_RGB.y;
  return new Color(rgb[0], rgb[1], rgb[2], 255);
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
): void {
  const n = part(root, name);
  n.setPosition(x, y, z);
  n.setScale(sx, sy, sz);
  n.setRotationFromEuler(0, 0, 0);
  const mr = n.getComponent(MeshRenderer);
  const mesh = getToyBall();
  if (!mr || !mesh) return;
  mr.enabled = true;
  mr.mesh = mesh;
  mr.setSharedMaterial(mat, 0);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
}

function plasticMat(token: ColorToken): Material {
  const key = `plastic-${token}`;
  let mat = _mats.get(key);
  if (mat) return mat;
  const color = rgbOf(token);
  mat = new Material();
  mat.initialize({ effectName: 'builtin-standard' });
  mat.setProperty('mainColor', color);
  mat.setProperty('roughness', 0.52);
  mat.setProperty('metallic', 0);
  mat.setProperty('emissive', color);
  mat.setProperty('emissiveScale', new Vec3(0.12, 0.12, 0.12));
  _mats.set(key, mat);
  return mat;
}

/** Recolor without material instances so same-color debris stay batched. */
export function paintNodeShared(root: Node, token: ColorToken): void {
  const mat = plasticMat(token);
  for (const mr of root.getComponentsInChildren(MeshRenderer)) {
    if (
      mr.node.name === 'HoldRim'
      || mr.node.name.startsWith('Paint')
      || mr.node.name.startsWith('Magnet')
      || mr.node.name.startsWith('Lock')
    ) continue;
    mr.setSharedMaterial(mat, 0);
  }
}

export function paintNodeColor(root: Node, token: ColorToken): void {
  const color = rgbOf(token);
  for (const mr of root.getComponentsInChildren(MeshRenderer)) {
    if (
      mr.node.name === 'HoldRim'
      || mr.node.name.startsWith('Paint')
      || mr.node.name.startsWith('Magnet')
      || mr.node.name.startsWith('Lock')
    ) continue;
    const inst = mr.getMaterialInstance(0);
    if (!inst) continue;
    inst.setProperty('mainColor', color);
    inst.setProperty('emissive', color);
    inst.setProperty('emissiveScale', new Vec3(0.12, 0.12, 0.12));
    inst.setProperty('roughness', 0.52);
    inst.setProperty('metallic', 0);
  }
}

export function applyPaintLook(root: Node, token: ColorToken = 'p'): void {
  applyPaintCan(root, token);
  applyToyCaster(root, false, false);
}

export function applyMagnetLook(root: Node): void {
  const steel = glossy('magnet-steel', new Color(72, 84, 104, 255), 0.22, 0.1);
  const red = glossy('magnet-red', new Color(220, 40, 48, 255), 0.2, 0.2);
  const blue = glossy('magnet-blue', new Color(48, 96, 220, 255), 0.2, 0.2);
  blob(root, 'MagnetArch', 0, 0.16, 0.52, 0.72, 0.55, 0.22, steel);
  blob(root, 'MagnetL', -0.22, -0.12, 0.54, 0.22, 0.38, 0.2, red);
  blob(root, 'MagnetR', 0.22, -0.12, 0.54, 0.22, 0.38, 0.2, blue);
  applyToyCaster(root, false, false);
}

export function applySandLook(root: Node): void {
  for (const mr of root.getComponentsInChildren(MeshRenderer)) {
    const inst = mr.getMaterialInstance(0);
    if (!inst) continue;
    inst.setProperty('roughness', 0.78);
    inst.setProperty('metallic', 0);
    inst.setProperty('emissive', new Color(210, 150, 70, 255));
    inst.setProperty('emissiveScale', new Vec3(0.08, 0.05, 0.02));
  }
}

export function applyGhostLook(root: Node): void {
  for (const mr of root.getComponentsInChildren(MeshRenderer)) {
    const inst = mr.getMaterialInstance(0);
    if (!inst) continue;
    const cur = inst.getProperty('mainColor');
    const c = cur instanceof Color ? cur : new Color(220, 230, 240, 255);
    const washed = new Color(
      Math.min(255, c.r + 70),
      Math.min(255, c.g + 80),
      Math.min(255, c.b + 90),
      255,
    );
    inst.setProperty('mainColor', washed);
    inst.setProperty('emissive', new Color(220, 240, 255, 255));
    inst.setProperty('emissiveScale', new Vec3(0.28, 0.32, 0.36));
    inst.setProperty('roughness', 0.12);
  }
}
