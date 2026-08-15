import { assetManager, JsonAsset, Mesh, MeshRenderer, Node, Vec3, utils } from 'cc';
import { PREFAB_UUID } from './PrefabCatalog';

type MeshDump = {
  p: number[];
  n: number[];
  u: number[];
  i: number[];
  min: number[];
  max: number[];
  r: number;
};

const _ready = new Map<string, Mesh | null>();
let _loading: Promise<void> | null = null;

function loadJson(uuid: string): Promise<MeshDump> {
  return new Promise((resolve, reject) => {
    assetManager.loadAny({ uuid }, (err, asset) => {
      if (err || !asset) {
        reject(err ?? new Error(`mesh json missing ${uuid}`));
        return;
      }
      const dump = ((asset as JsonAsset).json ?? asset) as MeshDump;
      if (!dump?.p || !dump.i) {
        reject(new Error(`mesh json invalid ${uuid}`));
        return;
      }
      resolve(dump);
    });
  });
}

function makeMesh(dump: MeshDump): Mesh | null {
  return utils.MeshUtils.createMesh({
    positions: dump.p,
    normals: dump.n,
    uvs: dump.u,
    indices: dump.i,
    minPos: new Vec3(dump.min[0], dump.min[1], dump.min[2]),
    maxPos: new Vec3(dump.max[0], dump.max[1], dump.max[2]),
    boundingRadius: dump.r,
  }) ?? null;
}

export function preloadToyMeshes(): Promise<void> {
  if (_ready.size >= 3) return Promise.resolve();
  if (_loading) return _loading;
  _loading = Promise.all([
    loadJson(PREFAB_UUID.MeshBlock),
    loadJson(PREFAB_UUID.MeshOctopus),
    loadJson(PREFAB_UUID.MeshBall),
  ]).then(([block, octopus, ball]) => {
    _ready.set('block', makeMesh(block));
    _ready.set('octopus', makeMesh(octopus));
    _ready.set('ball', makeMesh(ball));
  }).finally(() => {
    _loading = null;
  });
  return _loading;
}

export function toyMesh(kind: 'block' | 'octopus' | 'ball'): Mesh | null {
  return _ready.get(kind) ?? null;
}

export function bindToyMesh(mr: MeshRenderer | null, kind: 'block' | 'octopus' | 'ball', cast: boolean): boolean {
  if (!mr) return true;
  const mesh = mr.mesh ?? toyMesh(kind);
  if (!mesh) {
    mr.enabled = false;
    return false;
  }
  if (mr.mesh !== mesh) mr.mesh = mesh;
  mr.enabled = true;
  mr.shadowCastingMode = cast
    ? MeshRenderer.ShadowCastingMode.ON
    : MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  return true;
}

export function bindOctopusMeshes(root: Node): boolean {
  let ok = bindToyMesh(root.getChildByName('Body')?.getComponent(MeshRenderer) ?? null, 'octopus', true);
  for (const name of ['EyeL', 'EyeR', 'PupilL', 'PupilR', 'HighlightL', 'HighlightR']) {
    ok = bindToyMesh(root.getChildByName(name)?.getComponent(MeshRenderer) ?? null, 'ball', false) && ok;
  }
  return ok;
}
