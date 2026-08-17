import { Prefab, Node, Vec3, assetManager } from 'cc';
import { PREFAB_UUID } from './PrefabCatalog';
import { playPooledBurst } from './VfxPool';

const LIFE_MS = 2000;
const SCALE = 0.95;

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
  _boot = loadAny(PREFAB_UUID.Baozha).then((asset) => {
    _prefab = (asset as Prefab) ?? null;
    if (!_prefab) console.warn('[Suck] baozha prefab missing');
  });
  return _boot;
}

export function preloadBaozhaBurst(): Promise<void> {
  return preload();
}

export function playBaozhaBurst(host: Node, world: Vec3, delayMs = 0, scale = SCALE): void {
  const pos = new Vec3(world.x, world.y, world.z);
  void preload().then(() => {
    if (!host?.isValid || !_prefab) return;
    const spawn = (): void => {
      if (!host.isValid || !_prefab) return;
      playPooledBurst('Baozha', _prefab, host, pos, scale, LIFE_MS, 6);
    };
    if (delayMs > 0) setTimeout(spawn, delayMs);
    else spawn();
  });
}
