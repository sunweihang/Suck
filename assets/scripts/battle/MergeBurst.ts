import { Prefab, Node, Vec3, assetManager } from 'cc';
import { PREFAB_UUID } from './PrefabCatalog';
import { playPooledBurst } from './VfxPool';

/** TripleTown regular merge uses xingxing at worldMergeVfxScale 2. */
const LIFE_MS = 2200;
const SCALE = 0.7;

let _prefab: Prefab | null = null;
let _boot: Promise<void> | null = null;
const _pos = new Vec3();

function loadAny(uuid: string): Promise<unknown> {
  return new Promise((resolve) => {
    assetManager.loadAny({ uuid }, (err, asset) => {
      if (err || !asset) console.warn('[Suck] vfx asset missing', uuid, err);
      resolve(asset ?? null);
    });
  });
}

function preload(): Promise<void> {
  if (_boot) return _boot;
  _boot = loadAny(PREFAB_UUID.Xingxing).then((asset) => {
    _prefab = (asset as Prefab) ?? null;
    if (!_prefab) console.warn('[Suck] xingxing prefab missing');
  });
  return _boot;
}

export function preloadMergeBurst(): Promise<void> {
  return preload();
}

/** TripleTown ordinary 3-merge burst (xingxing), not first-building pingmu. */
export function playMergeBurst(host: Node, world: Vec3): void {
  if (!host?.isValid) return;
  if (_prefab) {
    playPooledBurst('Xingxing', _prefab, host, world, SCALE, LIFE_MS, 6);
    return;
  }
  const x = world.x;
  const y = world.y;
  const z = world.z;
  void preload().then(() => {
    if (!host.isValid || !_prefab) return;
    _pos.set(x, y, z);
    playPooledBurst('Xingxing', _prefab, host, _pos, SCALE, LIFE_MS, 6);
  });
}
