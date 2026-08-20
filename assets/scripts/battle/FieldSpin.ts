import { Material, Node, Quat, Vec3, Vec4 } from 'cc';

const _q = new Quat();
const _inv = new Quat();
const _p = new Vec3();
const _p4 = new Vec4();
const _q4 = new Vec4();
const _v = new Vec3();
const _rq = new Quat();

const _fieldMats = new Set<Material>();
const _released = new WeakSet<Node>();

let _actors: Node | null = null;

export function fieldActors(): Node | null {
  return _actors?.isValid ? _actors : null;
}

export function bindFieldActors(node: Node | null): void {
  _actors = node;
}

type SpinHandle = { q: number; p: number };

const _spinHandles = new WeakMap<Material, SpinHandle>();

function spinHandle(mat: Material): SpinHandle | null {
  const cached = _spinHandles.get(mat);
  if (cached) return cached;
  const pass = mat.passes?.[0] as { getHandle?: (n: string) => number } | undefined;
  const q = pass?.getHandle?.('spinQuat');
  const p = pass?.getHandle?.('spinPivot');
  if (typeof q !== 'number' || typeof p !== 'number') return null;
  const hit = { q, p };
  _spinHandles.set(mat, hit);
  return hit;
}

function bindSpinProps(mat: Material): void {
  const pass = mat.passes?.[0] as
    | { setUniform?: (h: number, v: Vec4) => void }
    | undefined;
  if (!pass) return;
  _q4.set(_q.x, _q.y, _q.z, _q.w);
  _p4.set(_p.x, _p.y, _p.z, 0);
  const h = spinHandle(mat);
  if (h && pass.setUniform) {
    pass.setUniform(h.q, _q4);
    pass.setUniform(h.p, _p4);
    return;
  }
  try {
    mat.setProperty('spinQuat', _q4);
    mat.setProperty('spinPivot', _p4);
  } catch {
    /* builtin-standard fallback has no spin */
  }
}

export function setFieldSpin(q: Quat, pivot: Vec3): void {
  _q.set(q);
  _p.set(pivot);
  Quat.invert(_inv, _q);
  _fieldMats.forEach((mat) => {
    if (!mat.passes?.length) {
      _fieldMats.delete(mat);
      return;
    }
    bindSpinProps(mat);
  });
}

export function registerFieldMat(mat: Material): Material {
  _fieldMats.add(mat);
  bindSpinProps(mat);
  return mat;
}

export function isFieldMat(mat: Material | null | undefined): boolean {
  return !!mat && _fieldMats.has(mat);
}

export function restToWorld(rest: Vec3, out: Vec3): Vec3 {
  Vec3.subtract(out, rest, _p);
  Vec3.transformQuat(out, out, _q);
  return out.add(_p);
}

export function worldToRest(world: Vec3, out: Vec3): Vec3 {
  Vec3.subtract(out, world, _p);
  Vec3.transformQuat(out, out, _inv);
  return out.add(_p);
}

export function fieldWorldOf(node: Node, out: Vec3): Vec3 {
  node.getWorldPosition(out);
  return restToWorld(out, out);
}

export function adoptNodeToActors(node: Node): void {
  const actors = fieldActors();
  if (!actors?.isValid || node.parent === actors) return;
  node.getWorldPosition(_v);
  node.setParent(actors, false);
  actors.inverseTransformPoint(_v, _v);
  node.setPosition(_v);
}

export function mountOnFieldActors(node: Node, restWorld: Vec3): void {
  const actors = fieldActors();
  if (!actors?.isValid) return;
  if (node.parent !== actors) node.setParent(actors, false);
  actors.inverseTransformPoint(_v, restWorld);
  node.setPosition(_v);
}

export function bindFieldNode(node: Node): void {
  _released.delete(node);
}

function bakeOffField(node: Node): void {
  node.getWorldPosition(_v);
  restToWorld(_v, _v);
  node.getWorldRotation(_rq);
  Quat.multiply(_rq, _q, _rq);
  node.setWorldPosition(_v);
  node.setWorldRotation(_rq);
}

export function releaseFieldNode(node: Node, swapMats: (n: Node) => void): void {
  if (_released.has(node)) return;
  _released.add(node);
  bakeOffField(node);
  swapMats(node);
}
