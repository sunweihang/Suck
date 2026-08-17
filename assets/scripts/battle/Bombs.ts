import { Color, JsonAsset, Material, Mesh, MeshRenderer, Node, Vec3, resources, utils } from 'cc';
import { ColorToken } from '../game/GameConfig';
import { applyToyCaster } from './ToyBlockMesh';

type MeshPack = {
  p: number[];
  n: number[];
  u: number[];
  i: number[];
  min: number[];
  max: number[];
  r: number;
};

const CANDY: Record<ColorToken, [number, number, number]> = {
  o: [255, 132, 28],
  y: [255, 158, 72],
  c: [24, 228, 236],
  g: [96, 224, 48],
  p: [255, 84, 164],
  v: [164, 92, 255],
  r: [255, 60, 76],
  s: [72, 176, 255],
  k: [255, 124, 100],
  m: [0, 212, 128],
  a: [240, 56, 216],
  d: [255, 196, 44],
};

let _body: Mesh | null = null;
let _trim: Mesh | null = null;
let _gold: Material | null = null;
let _ready: Promise<void> | null = null;

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

function paintBody(mr: MeshRenderer, token: ColorToken): void {
  const rgb = CANDY[token] ?? CANDY.y;
  const color = new Color(rgb[0], rgb[1], rgb[2], 255);
  const inst = mr.getMaterialInstance(0);
  if (!inst) return;
  inst.setProperty('mainColor', color);
  inst.setProperty('roughness', 0.22);
  inst.setProperty('metallic', 0.04);
  inst.setProperty('emissive', color);
  inst.setProperty('emissiveScale', new Vec3(0.14, 0.14, 0.14));
}

function goldMat(): Material {
  if (_gold) return _gold;
  const mat = new Material();
  mat.initialize({ effectName: 'builtin-standard' });
  mat.setProperty('mainColor', new Color(255, 224, 96, 255));
  mat.setProperty('roughness', 0.16);
  mat.setProperty('metallic', 0.48);
  mat.setProperty('emissive', new Color(255, 214, 80, 255));
  mat.setProperty('emissiveScale', new Vec3(0.26, 0.26, 0.26));
  _gold = mat;
  return mat;
}

function loadJson(path: string): Promise<MeshPack | null> {
  return new Promise((resolve) => {
    resources.load(path, JsonAsset, (err, asset) => {
      if (err || !asset?.json) {
        resolve(null);
        return;
      }
      resolve(asset.json as MeshPack);
    });
  });
}

export function preloadBombs(): Promise<void> {
  if (_body && _trim) return Promise.resolve();
  if (_ready) return _ready;
  _ready = Promise.all([loadJson('meshes/bomb-body'), loadJson('meshes/bomb-trim')]).then(([body, trim]) => {
    if (body) _body = meshFrom(body);
    if (trim) _trim = meshFrom(trim);
  });
  return _ready;
}

export function applyBombs(root: Node, token: ColorToken = 'y'): void {
  const body = _body;
  const mr = root.getComponent(MeshRenderer);
  if (mr && body) {
    mr.mesh = body;
    paintBody(mr, token);
    mr.enabled = true;
  }
  for (const name of ['BombLook', 'Bombs', 'BombCap', 'BombFuse', 'BombSpark', 'BombMark']) {
    root.getChildByName(name)?.destroy();
  }
  if (_trim) {
    let trim = root.getChildByName('BombTrim');
    if (!trim) {
      trim = new Node('BombTrim');
      root.addChild(trim);
    }
    const tmr = trim.getComponent(MeshRenderer) ?? trim.addComponent(MeshRenderer);
    tmr.mesh = _trim;
    tmr.setSharedMaterial(goldMat(), 0);
    tmr.enabled = true;
  }
  applyToyCaster(root, false, false);
}
