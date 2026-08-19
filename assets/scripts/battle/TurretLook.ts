import {
  JsonAsset,
  Mesh,
  MeshRenderer,
  Node,
  Vec3,
  resources,
  utils,
} from 'cc';
import { ColorId, tokenOfColorId } from '../game/GameConfig';
import { paintUnitColor } from './BrickSpecials';
import { applyToyCaster } from './ToyBlockMesh';
import { applyTurretPose } from './TurretPose';
import { TURRET_PITCH_DEG, TURRET_SCALE, TURRET_YAW_DEG, turretFireLocal } from './ToyLook';
import { applyBlobShadow, applyToyOutline, preloadToyOutline } from './ToyOutline';

/** Shooter_Hidden is ~1.010 wide; keep queue cubes a touch smaller than live turrets. */
export const UNIT_CUBE_SCALE = (0.4 * 1.34) / 1.010196328;
const _fireP = new Vec3();

type MeshPack = {
  p: number[];
  n: number[];
  u: number[];
  i: number[];
  min: number[];
  max: number[];
  r: number;
};

const FACE = [
  'Art', 'EyeL', 'EyeR', 'PupilL', 'PupilR', 'HighlightL', 'HighlightR',
  'CheekL', 'CheekR', 'MouthHole', 'Lid', 'Cap', 'Barrel', 'Neck',
];

let _mesh: Mesh | null = null;
let _cube: Mesh | null = null;
let _hidden: Mesh | null = null;
let _boot: Promise<void> | null = null;
const HIDDEN_SCALE = UNIT_CUBE_SCALE;

function meshFrom(pack: MeshPack): Mesh | null {
  return utils.MeshUtils.createMesh({
    positions: pack.p,
    normals: pack.n,
    uvs: pack.u,
    indices: pack.i,
    minPos: new Vec3(pack.min[0], pack.min[1], pack.min[2]),
    maxPos: new Vec3(pack.max[0], pack.max[1], pack.max[2]),
    boundingRadius: pack.r,
  });
}

export function getShooterMesh(): Mesh | null {
  return _mesh;
}

function loadPack(path: string, set: (mesh: Mesh) => void): Promise<void> {
  return new Promise((resolve) => {
    resources.load(path, JsonAsset, (err, asset) => {
      if (!err && asset?.json) {
        const mesh = meshFrom(asset.json as MeshPack);
        if (mesh) set(mesh);
      }
      resolve();
    });
  });
}

export function preloadTurretLooks(): Promise<void> {
  if (_mesh && _hidden) return preloadToyOutline();
  if (_boot) return _boot;
  _boot = Promise.all([
    loadPack('meshes/toy-shooter', (m) => { _mesh = m; }),
    loadPack('meshes/toy-block', (m) => { _cube = m; }),
    loadPack('meshes/hidden-shooter', (m) => { _hidden = m; }),
    preloadToyOutline(),
  ]).then(() => undefined);
  return _boot;
}

const _hid = new WeakSet<Node>();

function hideFace(host: Node): void {
  if (_hid.has(host)) return;
  _hid.add(host);
  for (const name of FACE) {
    const n = host.getChildByName(name) ?? host.getChildByName('Rig')?.getChildByName(name);
    if (n) n.active = false;
  }
}

function bodyOf(host: Node): Node | null {
  return host.getChildByName('Body') ?? host.getChildByName('Rig')?.getChildByName('Body') ?? null;
}

function placeMuzzle(host: Node): void {
  const body = bodyOf(host);
  const parent = body ?? host;
  let mouth = host.getChildByName('Mouth')
    ?? host.getChildByName('Rig')?.getChildByName('Mouth')
    ?? body?.getChildByName('Mouth');
  if (!mouth) {
    mouth = new Node('Mouth');
    parent.addChild(mouth);
  } else if (mouth.parent !== parent) {
    mouth.setParent(parent, false);
  }
  mouth.active = true;
  mouth.layer = host.layer;
  mouth.setPosition(turretFireLocal(_fireP));
  mouth.setRotationFromEuler(0, 0, 0);
  mouth.setScale(1, 1, 1);
  const mr = mouth.getComponent(MeshRenderer);
  if (mr) mr.enabled = false;
  for (const child of mouth.children) child.active = false;
}

export function applyTurretLook(host: Node, colorId: ColorId, outline = true): void {
  hideFace(host);
  placeMuzzle(host);
  const body = bodyOf(host);
  if (!body) return;
  body.setPosition(0, 0, 0);
  const mr = body.getComponent(MeshRenderer);
  if (!mr) return;
  const apply = (mesh: Mesh) => {
    if (!host.isValid || !mr.isValid) return;
    host.setScale(TURRET_SCALE, TURRET_SCALE, TURRET_SCALE);
    mr.mesh = mesh;
    mr.enabled = true;
    paintUnitColor(host, tokenOfColorId(colorId));
    void preloadToyOutline().then(() => {
      if (host.isValid) applyToyOutline(host, outline);
    });
    applyBlobShadow(host);
    applyTurretPose(host);
  };
  if (_mesh) {
    apply(_mesh);
    applyToyCaster(host, false, false);
    return;
  }
  preloadTurretLooks().then(() => {
    if (_mesh) apply(_mesh);
    if (host.isValid) applyToyCaster(host, false, false);
  });
}

/** Same 45° sit as live turrets so the lid tilts toward the camera. */
function lockQueueBlockPose(host: Node): void {
  host.setRotationFromEuler(0, 0, 0);
  host.setScale(HIDDEN_SCALE, HIDDEN_SCALE, HIDDEN_SCALE);
  const rig = host.getChildByName('Rig');
  if (rig) {
    rig.setPosition(0, 0, 0);
    rig.setRotationFromEuler(0, 0, 0);
    rig.setScale(1, 1, 1);
  }
  const body = bodyOf(host);
  if (!body) return;
  body.setPosition(0, 0, 0);
  body.setRotationFromEuler(TURRET_PITCH_DEG, TURRET_YAW_DEG, 0);
  body.setScale(1, 1, 1);
}

/** Queued / unactivated: original Shooter_Hidden + T_Hidden_Pattern. */
export function applyQueueBlockLook(host: Node, colorId: ColorId = 0): void {
  hideFace(host);
  const body = bodyOf(host);
  if (!body) return;
  const mr = body.getComponent(MeshRenderer);
  if (!mr) return;
  const apply = (mesh: Mesh) => {
    if (!host.isValid || !mr.isValid) return;
    lockQueueBlockPose(host);
    mr.mesh = mesh;
    mr.enabled = true;
    paintUnitColor(host, tokenOfColorId(colorId));
    applyToyOutline(host, false);
    const mouth = host.getChildByName('Mouth')
      ?? host.getChildByName('Rig')?.getChildByName('Mouth')
      ?? body.getChildByName('Mouth');
    if (mouth) mouth.active = false;
    applyBlobShadow(host);
  };
  const mesh = _hidden ?? _cube;
  if (mesh) {
    apply(mesh);
    applyToyCaster(host, false, false);
    return;
  }
  preloadTurretLooks().then(() => {
    const ready = _hidden ?? _cube;
    if (ready) apply(ready);
    if (host.isValid) applyToyCaster(host, false, false);
  });
}
