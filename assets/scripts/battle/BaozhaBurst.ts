import { Layers, ParticleSystem, Prefab, Node, Vec3, assetManager, instantiate } from 'cc';
import { PREFAB_UUID } from './PrefabCatalog';

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

function setLayerRecursive(node: Node, layer: number): void {
  if (node.layer !== layer) node.layer = layer;
  const children = node.children;
  for (let i = 0; i < children.length; i++) setLayerRecursive(children[i], layer);
}

function compactNullComponents(root: Node): void {
  const visit = (n: Node): void => {
    const comps = (n as unknown as { _components?: Array<unknown> })._components;
    if (Array.isArray(comps)) {
      for (let i = comps.length - 1; i >= 0; i--) {
        if (comps[i] == null) comps.splice(i, 1);
      }
    }
    const kids = n.children;
    for (let i = 0; i < kids.length; i++) visit(kids[i]);
  };
  visit(root);
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
  void preload().then(() => {
    if (!host?.isValid || !_prefab) return;
    const spawn = (): void => {
      if (!host.isValid || !_prefab) return;
      const node = instantiate(_prefab);
      compactNullComponents(node);
      node.name = 'Baozha';
      setLayerRecursive(node, Layers.Enum.DEFAULT);
      host.addChild(node);
      node.setWorldPosition(world.x, world.y, world.z);
      node.setScale(scale, scale, scale);
      const systems = node.getComponentsInChildren(ParticleSystem);
      let playing = 0;
      for (const ps of systems) {
        if ((ps.capacity | 0) <= 0) {
          ps.enabled = false;
          continue;
        }
        ps.stop();
        ps.loop = false;
        ps.clear();
        ps.play();
        playing++;
      }
      if (playing <= 0) console.warn('[Suck] baozha has no playable particles');
      setTimeout(() => {
        if (node.isValid) node.destroy();
      }, LIFE_MS);
    };
    if (delayMs > 0) setTimeout(spawn, delayMs);
    else spawn();
  });
}
