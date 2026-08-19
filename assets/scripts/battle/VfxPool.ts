import { Director, Layers, ParticleSystem, Prefab, Node, Vec3, director, game, instantiate } from 'cc';

type Pooled = { node: Node; systems: ParticleSystem[] };
type Job = {
  key: string;
  prefab: Prefab;
  host: Node;
  x: number;
  y: number;
  z: number;
  scale: number;
  life: number;
  max: number;
  wait: number;
  node: Node | null;
};

const pools = new Map<string, Pooled[]>();
const jobs: Job[] = [];
const jobPool: Job[] = [];
let ticking = false;

function takeJob(): Job {
  return jobPool.pop() ?? {
    key: '',
    prefab: null as unknown as Prefab,
    host: null as unknown as Node,
    x: 0,
    y: 0,
    z: 0,
    scale: 1,
    life: 0,
    max: 6,
    wait: 0,
    node: null,
  };
}

function freeJob(job: Job): void {
  job.prefab = null as unknown as Prefab;
  job.host = null as unknown as Node;
  job.node = null;
  jobPool.push(job);
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

function playSystems(systems: ParticleSystem[]): void {
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

function bindTick(): void {
  if (ticking) return;
  director.on(Director.EVENT_AFTER_UPDATE, onTick);
  ticking = true;
}

function onTick(): void {
  const dt = game.deltaTime;
  for (let i = jobs.length - 1; i >= 0; i--) {
    const job = jobs[i];
    job.wait -= dt;
    if (job.wait > 0) continue;
    if (job.node) {
      if (job.node.isValid) job.node.active = false;
    } else if (job.host?.isValid && job.prefab) {
      const item = takeNode(job.key, job.prefab, job.host, job.max);
      if (item) {
        item.node.active = true;
        item.node.setWorldPosition(job.x, job.y, job.z);
        item.node.setScale(job.scale, job.scale, job.scale);
        playSystems(item.systems);
        job.node = item.node;
        job.wait = job.life;
        continue;
      }
    }
    jobs[i] = jobs[jobs.length - 1];
    jobs.pop();
    freeJob(job);
  }
  if (jobs.length === 0 && ticking) {
    director.off(Director.EVENT_AFTER_UPDATE, onTick);
    ticking = false;
  }
}

function takeNode(key: string, prefab: Prefab, host: Node, max: number): Pooled | null {
  let list = pools.get(key);
  if (!list) {
    list = [];
    pools.set(key, list);
  }
  let item: Pooled | null = null;
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (n.node.isValid && !n.node.active) {
      item = n;
      break;
    }
  }
  if (!item) {
    if (list.length >= max) {
      item = list[0];
      list.push(list.shift()!);
    } else {
      const node = instantiate(prefab);
      compactNullComponents(node);
      node.name = key;
      setLayerRecursive(node, Layers.Enum.DEFAULT);
      item = { node, systems: node.getComponentsInChildren(ParticleSystem) };
      list.push(item);
    }
  }
  if (!item.node.isValid) return null;
  if (item.node.parent !== host) host.addChild(item.node);
  for (let i = jobs.length - 1; i >= 0; i--) {
    if (jobs[i].node !== item.node) continue;
    const job = jobs[i];
    jobs[i] = jobs[jobs.length - 1];
    jobs.pop();
    freeJob(job);
  }
  return item;
}

export function playPooledBurst(
  key: string,
  prefab: Prefab,
  host: Node,
  world: Vec3,
  scale: number,
  lifeMs: number,
  max = 6,
  delayMs = 0,
): void {
  const life = Math.max(0.05, lifeMs / 1000);
  if (delayMs > 0) {
    const job = takeJob();
    job.key = key;
    job.prefab = prefab;
    job.host = host;
    job.x = world.x;
    job.y = world.y;
    job.z = world.z;
    job.scale = scale;
    job.life = life;
    job.max = max;
    job.wait = delayMs / 1000;
    job.node = null;
    jobs.push(job);
    bindTick();
    return;
  }
  const item = takeNode(key, prefab, host, max);
  if (!item) return;
  item.node.active = true;
  item.node.setWorldPosition(world.x, world.y, world.z);
  item.node.setScale(scale, scale, scale);
  playSystems(item.systems);
  const job = takeJob();
  job.node = item.node;
  job.host = host;
  job.wait = life;
  jobs.push(job);
  bindTick();
}
