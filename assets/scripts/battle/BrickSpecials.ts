import { Color, EffectAsset, Material, MeshRenderer, Node, Vec3, assetManager } from 'cc';
import { ColorToken, PLAY, TOKEN_RGB } from '../game/GameConfig';
import { VoxelLook, lookOfRgb, lookOfVoxel } from '../game/VoxelPalette';
import { applyPaintCan } from './PaintCan';
import { applyToyCaster } from './ToyBlockMesh';
import { getToyBall } from './ToySlotMesh';

const FX_CLAY = '9d13ee10-0200-4a01-8001-000000000001';

const _mats = new Map<string, Material>();
let _clayFx: EffectAsset | null = null;
let _clayBoot: Promise<void> | null = null;

function usable(mat: Material | null | undefined): mat is Material {
  return !!mat?.passes?.length;
}

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

function colorOf(rgb: readonly [number, number, number]): Color {
  return new Color(rgb[0], rgb[1], rgb[2], 255);
}

function paintUnlit(inst: Material, color: Color): void {
  inst.setProperty('mainColor', color);
}

function skipPaint(name: string): boolean {
  return (
    name === 'HoldRim'
    || name === 'Outline'
    || name === 'Crease'
    || name === 'BlobShadow'
    || name === 'Pad'
    || name === 'Power'
    || name === 'Bank'
    || name === 'Text'
    || name.startsWith('Paint')
    || name.startsWith('Magnet')
    || name.startsWith('Lock')
    || /^[DN]\d$/.test(name)
  );
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

function pixelMat(look: VoxelLook): Material | null {
  const key = `unlit-${look.rgb[0]}-${look.rgb[1]}-${look.rgb[2]}`;
  const hit = _mats.get(key);
  if (usable(hit)) return hit;
  const fx = _clayFx ?? EffectAsset.get('toy-clay');
  const mat = new Material();
  if (fx) {
    try {
      mat.initialize({ effectAsset: fx, techniqueIndex: 0 });
    } catch {
      /* effect failed to compile */
    }
  }
  if (!usable(mat)) {
    try {
      mat.initialize({ effectName: 'toy-clay' });
    } catch {
      /* name lookup failed */
    }
  }
  if (!usable(mat)) mat.initialize({ effectName: 'builtin-unlit' });
  if (!usable(mat)) return null;
  paintUnlit(mat, colorOf(look.rgb));
  _mats.set(key, mat);
  return mat;
}

function paintLook(root: Node, look: VoxelLook): void {
  const mat = pixelMat(look);
  if (mat) {
    for (const mr of root.getComponentsInChildren(MeshRenderer)) {
      if (skipPaint(mr.node.name)) continue;
      mr.setSharedMaterial(mat, 0);
    }
    return;
  }
  const color = colorOf(look.rgb);
  for (const mr of root.getComponentsInChildren(MeshRenderer)) {
    if (skipPaint(mr.node.name)) continue;
    const inst = mr.getMaterialInstance(0);
    if (inst) paintUnlit(inst, color);
  }
}

export function preloadVoxelLook(): Promise<void> {
  if (_clayFx) return Promise.resolve();
  if (_clayBoot) return _clayBoot;
  _clayBoot = new Promise((resolve) => {
    assetManager.loadAny({ uuid: FX_CLAY }, (err, asset) => {
      if (!err && asset) _clayFx = asset as EffectAsset;
      resolve();
    });
  });
  return _clayBoot;
}

/** Recolor without material instances so same-color debris stay batched. */
export function paintNodeShared(root: Node, token: ColorToken): void {
  paintLook(root, lookOfRgb(PLAY.tints[token] ?? TOKEN_RGB[token] ?? TOKEN_RGB.y));
}

export function paintVoxelRgb(root: Node, rgb: readonly [number, number, number]): void {
  paintLook(root, lookOfRgb(rgb));
}

export function paintVoxelId(root: Node, colorId: number): void {
  paintLook(root, lookOfVoxel(colorId));
}

export function paintNodeColor(root: Node, token: ColorToken): void {
  paintLook(root, lookOfRgb(PLAY.tints[token] ?? TOKEN_RGB[token] ?? TOKEN_RGB.y));
}

export function paintUnitColor(root: Node, token: ColorToken): void {
  const rgb = PLAY.tints[token] ?? TOKEN_RGB[token] ?? TOKEN_RGB.y;
  const mat = glossy(
    `unit-${rgb[0]}-${rgb[1]}-${rgb[2]}`,
    new Color(rgb[0], rgb[1], rgb[2], 255),
    0.26,
    0.18,
  );
  for (const mr of root.getComponentsInChildren(MeshRenderer)) {
    if (skipPaint(mr.node.name)) continue;
    mr.setSharedMaterial(mat, 0);
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
  paintLook(root, lookOfRgb([195, 175, 113]));
}

export function applyGhostLook(root: Node): void {
  for (const mr of root.getComponentsInChildren(MeshRenderer)) {
    if (skipPaint(mr.node.name)) continue;
    const inst = mr.getMaterialInstance(0);
    if (!inst) continue;
    const cur = inst.getProperty('mainColor');
    const c = cur instanceof Color ? cur : new Color(220, 230, 240, 255);
    inst.setProperty('mainColor', new Color(
      Math.min(255, c.r + 70),
      Math.min(255, c.g + 80),
      Math.min(255, c.b + 90),
      255,
    ));
  }
}
