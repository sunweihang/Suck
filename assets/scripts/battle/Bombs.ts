import { Color, JsonAsset, Material, Mesh, MeshRenderer, Node, Vec3, resources, utils } from 'cc';
import { ColorToken, TOKEN_RGB } from '../game/GameConfig';
import { applyToyCaster, cachedFieldLit, makeFieldLit } from './ToyBlockMesh';

type MeshPack = {
  p: number[];
  n: number[];
  u: number[];
  i: number[];
  min: number[];
  max: number[];
  r: number;
};

const CANDY: Record<ColorToken, readonly [number, number, number]> = TOKEN_RGB;

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

const _bodyColor = new Color();

function paintBody(mr: MeshRenderer, token: ColorToken): void {
  const rgb = CANDY[token] ?? CANDY.y;
  _bodyColor.set(rgb[0], rgb[1], rgb[2], 255);
  mr.setSharedMaterial(cachedFieldLit(_bodyColor, 0.22, 0.04, 0.14), 0);
}

function goldMat(): Material {
  if (_gold) return _gold;
  _gold = makeFieldLit(new Color(255, 224, 96, 255), 0.16, 0.48, 0.26);
  return _gold;
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
