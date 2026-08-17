import { Prefab, Node, Vec3, assetManager } from 'cc';
import { PREFAB_UUID } from './PrefabCatalog';
import { playPooledBurst } from './VfxPool';

/** TripleTown shuaxin startSize 0.35; octopus is ~0.4 world units. */
const LIFE_MS = 1800;
const SCALE = 0.55;

let _prefab: Prefab | null = null;
let _boot: Promise<void> | null = null;

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
  const pos = new Vec3(world.x, world.y, world.z);
  void preload().then(() => {
    if (!host?.isValid || !_prefab) return;
    playPooledBurst('Shuaxin', _prefab, host, pos, SCALE, LIFE_MS, 4);
  });
}
