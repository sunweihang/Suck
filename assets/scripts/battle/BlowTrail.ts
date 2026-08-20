import { Color, Material, Mesh, MeshRenderer, Node, Quat, Vec3 } from 'cc';
import { makeInstancedLit } from './ToyBlockMesh';

const BITS = 2;
const HIST = 6;
const SKIP = /^(Hold|Lock|Outline|BlobShadow|Trail|Chip|Paint|Magnet|Power|D\d|N\d|Bomb)/;
const FX_PRI = 40;

const _pos = new Vec3();
const _spin = new Quat();
const _q = new Quat();
const _off = new Vec3();
const _mats = new Map<string, Material>();
const _fx = new WeakMap<Node, TrailFx>();

type Bit = {
  node: Node;
  ox: number;
  oy: number;
  oz: number;
  ax: number;
  ay: number;
  az: number;
  spin: number;
  size: number;
};

type TrailFx = {
  bits: Bit[];
  hist: Vec3[];
  histI: number;
  histN: number;
};

function chipMat(rgb: readonly [number, number, number]): Material {
  const key = `${rgb[0]},${rgb[1]},${rgb[2]}`;
  let mat = _mats.get(key);
  if (mat) return mat;
  mat = makeInstancedLit(new Color(rgb[0], rgb[1], rgb[2], 255), 0.34, 0.04, 0.08);
  _mats.set(key, mat);
  return mat;
}

function sourceMesh(root: Node): Mesh | null {
  const mrs = root.getComponentsInChildren(MeshRenderer);
  for (let i = 0; i < mrs.length; i++) {
    const mr = mrs[i];
    if (!mr.mesh || !mr.enabled || SKIP.test(mr.node.name)) continue;
    return mr.mesh;
  }
  return null;
}

function dress(node: Node, mesh: Mesh, mat: Material): void {
  let mr = node.getComponent(MeshRenderer);
  if (!mr) mr = node.addComponent(MeshRenderer);
  mr.mesh = mesh;
  mr.setSharedMaterial(mat, 0);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  mr.priority = FX_PRI;
  mr.enabled = true;
}

function hideNode(node: Node | null | undefined): void {
  if (node?.isValid) node.active = false;
}

function sweepOld(host: Node): void {
  const kids = host.children;
  for (let i = 0; i < kids.length; i++) {
    const n = kids[i];
    if (n.name === 'Trail_Streak' || /^Trail_\d+$/.test(n.name)) hideNode(n);
  }
}

function takeFx(root: Node): TrailFx {
  let fx = _fx.get(root);
  if (fx) return fx;
  const host = root.parent ?? root;
  sweepOld(host);
  const bits: Bit[] = [];
  const hist: Vec3[] = [];
  for (let i = 0; i < HIST; i++) hist.push(new Vec3());
  for (let i = 0; i < BITS; i++) {
    const n = new Node(`Chip_${i}`);
    n.layer = root.layer;
    n.active = false;
    host.addChild(n);
    bits.push({
      node: n,
      ox: (Math.random() - 0.5) * 0.22,
      oy: (Math.random() - 0.5) * 0.16,
      oz: (Math.random() - 0.5) * 0.22,
      ax: Math.random() * 2 - 1,
      ay: Math.random() * 2 - 1,
      az: Math.random() * 2 - 1,
      spin: 280 + Math.random() * 420,
      size: 0.14 + Math.random() * 0.1,
    });
  }
  fx = { bits, hist, histI: 0, histN: 0 };
  _fx.set(root, fx);
  return fx;
}

export function hideBlowTrail(root: Node): void {
  const fx = _fx.get(root);
  if (!fx) {
    if (root.parent) sweepOld(root.parent);
    return;
  }
  for (let i = 0; i < fx.bits.length; i++) hideNode(fx.bits[i].node);
  fx.histN = 0;
  fx.histI = 0;
}

export function poseBlowTrail(
  root: Node,
  rgb: readonly [number, number, number],
  rot: Quat,
  _vel: Vec3,
  scale: number,
): void {
  if (!root?.isValid) return;
  const mesh = sourceMesh(root);
  if (!mesh) return;
  const fx = takeFx(root);
  const host = root.parent ?? root;
  root.getWorldPosition(_pos);
  fx.hist[fx.histI].set(_pos);
  fx.histI = (fx.histI + 1) % HIST;
  fx.histN = Math.min(HIST, fx.histN + 1);
  const mat = chipMat(rgb);

  for (let i = 0; i < fx.bits.length; i++) {
    const bit = fx.bits[i];
    const ghost = bit.node;
    if (!ghost?.isValid) continue;
    if (ghost.parent !== host) host.addChild(ghost);
    const back = 1 + i;
    if (fx.histN <= back) {
      ghost.active = false;
      continue;
    }
    const idx = (fx.histI - 1 - back + HIST * 4) % HIST;
    dress(ghost, mesh, mat);
    _off.set(fx.hist[idx].x + bit.ox, fx.hist[idx].y + bit.oy, fx.hist[idx].z + bit.oz);
    ghost.setWorldPosition(_off);
    Quat.fromAxisAngle(_spin, _off.set(bit.ax, bit.ay, bit.az).normalize(), bit.spin * (fx.histN + i) * 0.016);
    Quat.multiply(_q, _spin, rot);
    ghost.setWorldRotation(_q);
    const fade = Math.max(0.35, 1 - i / (BITS + 1));
    const s = scale * bit.size * fade;
    ghost.setScale(s, s, s);
    ghost.active = true;
  }
}
