import { Layers, ParticleSystem, Prefab, Node, Vec3, instantiate } from 'cc';

const pools = new Map<string, Node[]>();

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

function playSystems(node: Node): void {
  const systems = node.getComponentsInChildren(ParticleSystem);
  for (let i = 0; i < systems.length; i++) {
    const ps = systems[i];
    if ((ps.capacity | 0) <= 0) {
      ps.enabled = false;
      continue;
    }
    ps.stop();
    ps.loop = false;
    ps.clear();
    ps.play();
  }
}

export function playPooledBurst(
  key: string,
  prefab: Prefab,
  host: Node,
  world: Vec3,
  scale: number,
  lifeMs: number,
  max = 6,
): void {
  let list = pools.get(key);
  if (!list) {
    list = [];
    pools.set(key, list);
  }
  let node: Node | null = null;
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (n.isValid && !n.active) {
      node = n;
      break;
    }
  }
  if (!node) {
    if (list.length >= max) {
      node = list[0];
      list.push(list.shift()!);
    } else {
      node = instantiate(prefab);
      compactNullComponents(node);
      node.name = key;
      setLayerRecursive(node, Layers.Enum.DEFAULT);
      list.push(node);
    }
  }
  if (!node.isValid) return;
  if (node.parent !== host) host.addChild(node);
  node.active = true;
  node.setWorldPosition(world.x, world.y, world.z);
  node.setScale(scale, scale, scale);
  playSystems(node);
  const recycled = node;
  setTimeout(() => {
    if (recycled.isValid) recycled.active = false;
  }, lifeMs);
}
