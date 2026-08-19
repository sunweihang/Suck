import { Prefab, Node, Vec3, assetManager } from 'cc';
import { PREFAB_UUID } from './PrefabCatalog';
import { playPooledBurst } from './VfxPool';

/** TripleTown shuaxin startSize 0.35; octopus is ~0.4 world units. */
const LIFE_MS = 1800;
const SCALE = 0.55;

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
  _boot = loadAny(PREFAB_UUID.Shuaxin).then((asset) => {
    _prefab = (asset as Prefab) ?? null;
    if (!_prefab) console.warn('[Suck] shuaxin prefab missing');
  });
  return _boot;
}

export function preloadShuaxinBurst(): Promise<void> {
  return preload();
}

export function playShuaxinBurst(host: Node, world: Vec3): void {
  if (!host?.isValid) return;
  if (_prefab) {
    playPooledBurst('Shuaxin', _prefab, host, world, SCALE, LIFE_MS, 4);
    return;
  }
  const x = world.x;
  const y = world.y;
  const z = world.z;
  void preload().then(() => {
    if (!host.isValid || !_prefab) return;
    _pos.set(x, y, z);
    playPooledBurst('Shuaxin', _prefab, host, _pos, SCALE, LIFE_MS, 4);
  });
}
