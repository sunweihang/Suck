import { JsonAsset, Mesh, MeshRenderer, Node, Vec3, resources, utils } from 'cc';
import { ColorId } from '../game/GameConfig';
import { applyToyCaster } from './ToyBlockMesh';
import { applyTurretPose } from './TurretPose';
import { TURRET_FIRE_LOCAL, TURRET_SCALE } from './ToyLook';
import { applyBlobShadow, applyToyOutline, preloadToyOutline } from './ToyOutline';

export const UNIT_CUBE_SCALE = 0.40;

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
let _boot: Promise<void> | null = null;
const CUBE_SCALE = 0.40;

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

export function preloadTurretLooks(): Promise<void> {
  if (_mesh) return preloadToyOutline();
  if (_boot) return _boot;
  _boot = Promise.all([
    new Promise<void>((resolve) => {
      resources.load('meshes/toy-shooter', JsonAsset, (err, asset) => {
        if (!err && asset?.json) _mesh = meshFrom(asset.json as MeshPack);
        resolve();
      });
    }),
    new Promise<void>((resolve) => {
      resources.load('meshes/toy-block', JsonAsset, (err, asset) => {
        if (!err && asset?.json) _cube = meshFrom(asset.json as MeshPack);
        resolve();
      });
    }),
    preloadToyOutline(),
  ]).then(() => undefined);
  return _boot;
}

function hideFace(host: Node): void {
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
  mouth.setPosition(TURRET_FIRE_LOCAL);
  mouth.setRotationFromEuler(0, 0, 0);
  mouth.setScale(1, 1, 1);
  const mr = mouth.getComponent(MeshRenderer);
  if (mr) mr.enabled = false;
  for (const child of mouth.children) child.active = false;
}

export function applyTurretLook(host: Node, _colorId: ColorId): void {
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
    void preloadToyOutline().then(() => {
      if (host.isValid) applyToyOutline(host);
    });
    applyBlobShadow(host);
    applyTurretPose(host);
  };
  if (_mesh) {
    apply(_mesh);
    applyToyCaster(host, false, true);
    return;
  }
  preloadTurretLooks().then(() => {
    if (_mesh) apply(_mesh);
    if (host.isValid) applyToyCaster(host, false, true);
  });
}

/** Bench cubes stay level with the slot bar. */
export function lockQueueBlockPose(host: Node): void {
  host.setRotationFromEuler(0, 0, 0);
  host.setScale(CUBE_SCALE, CUBE_SCALE, CUBE_SCALE);
  const rig = host.getChildByName('Rig');
  if (rig) {
    rig.setPosition(0, 0, 0);
    rig.setRotationFromEuler(0, 0, 0);
    rig.setScale(1, 1, 1);
  }
  const body = bodyOf(host);
  if (!body) return;
  body.setPosition(0, 0, 0);
  body.setRotationFromEuler(0, 0, 0);
  body.setScale(1, 1, 1);
}

/** Queued bench units: original waiting stack is cubes, not full shooters. */
export function applyQueueBlockLook(host: Node): void {
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
    void preloadToyOutline().then(() => {
      if (host.isValid) applyToyOutline(host);
    });
    applyBlobShadow(host);
  };
  if (_cube) {
    apply(_cube);
    applyToyCaster(host, false, true);
    return;
  }
  preloadTurretLooks().then(() => {
    if (_cube) apply(_cube);
    if (host.isValid) applyToyCaster(host, false, true);
  });
}
