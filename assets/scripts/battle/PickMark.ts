import {
  Camera,
  Color,
  Layers,
  Node,
  Quat,
  RenderRoot2D,
  Sprite,
  SpriteFrame,
  UITransform,
  Vec3,
  resources,
} from 'cc';

const NAME = 'PickMark';
const ARROW_PX = 256;
const WORLD_SCALE = 0.00124;
const _pos = new Vec3();
const _camP = new Vec3();
const _camQ = new Quat();
const _hostScale = new Vec3();
const _flags = new WeakMap<Node, boolean>();

let _arrowSf: SpriteFrame | null = null;
let _boot: Promise<void> | null = null;

function loadFrame(path: string): Promise<SpriteFrame | null> {
  return new Promise((resolve) => {
    resources.load(`${path}/spriteFrame`, SpriteFrame, (err, sf) => {
      resolve(!err && sf ? sf : null);
    });
  });
}

function bindSprite(node: Node, sf: SpriteFrame | null, px: number): void {
  node.layer = Layers.Enum.UI_3D;
  const ut = node.getComponent(UITransform) ?? node.addComponent(UITransform);
  ut.setContentSize(px, px);
  ut.setAnchorPoint(0.5, 0.5);
  ut.hitTest = () => false;
  const sp = node.getComponent(Sprite) ?? node.addComponent(Sprite);
  sp.sizeMode = Sprite.SizeMode.CUSTOM;
  sp.type = Sprite.Type.SIMPLE;
  if (sf) sp.spriteFrame = sf;
  sp.color = Color.WHITE;
}

function ensureArrow(root: Node, sf: SpriteFrame | null): Node {
  const leftover = root.getChildByName('Halo');
  if (leftover) leftover.active = false;
  let n = root.getChildByName('Arrow');
  if (!n) {
    n = new Node('Arrow');
    root.addChild(n);
  }
  bindSprite(n, sf, ARROW_PX);
  n.active = true;
  return n;
}

export function preloadPickMark(): Promise<void> {
  if (_arrowSf) return Promise.resolve();
  if (_boot) return _boot;
  _boot = loadFrame('ui/pick-arrow').then((arrow) => {
    if (arrow) _arrowSf = arrow;
  });
  return _boot;
}

export function clearPickMark(host: Node | null): void {
  if (!host?.isValid) return;
  const n = host.getChildByName(NAME);
  if (!n?.isValid) return;
  n.active = false;
}

export function setPickMark(host: Node, on: boolean, compact: boolean): boolean {
  if (!host?.isValid) return false;
  let n = host.getChildByName(NAME);
  if (!on) {
    if (n?.isValid) n.active = false;
    return false;
  }
  if (!_arrowSf) {
    void preloadPickMark().then(() => {
      if (host?.isValid && host.getChildByName(NAME)?.active) setPickMark(host, true, compact);
    });
  }
  if (!n) {
    n = new Node(NAME);
    n.layer = Layers.Enum.UI_3D;
    if (!n.getComponent(RenderRoot2D)) n.addComponent(RenderRoot2D);
    host.addChild(n);
  }
  n.active = true;
  const rootUt = n.getComponent(UITransform) ?? n.addComponent(UITransform);
  rootUt.setContentSize(8, 8);
  rootUt.hitTest = () => false;
  ensureArrow(n, _arrowSf);
  _flags.set(n, compact);
  n.setSiblingIndex(host.children.length - 1);
  return true;
}

function poseMark(mark: Node, host: Node, cam: Camera | null, compact: boolean): void {
  host.getWorldPosition(_pos);
  _pos.y += compact ? 0.34 : 0.46;
  if (cam?.node?.isValid) {
    cam.node.getWorldPosition(_camP);
    const dx = _camP.x - _pos.x;
    const dy = _camP.y - _pos.y;
    const dz = _camP.z - _pos.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const push = compact ? 0.30 : 0.34;
    _pos.x += (dx / len) * push;
    _pos.y += (dy / len) * push;
    _pos.z += (dz / len) * push;
    cam.node.getWorldRotation(_camQ);
    mark.setWorldRotation(_camQ);
  }
  mark.setWorldPosition(_pos);
  host.getWorldScale(_hostScale);
  const parent = Math.max(0.08, Math.abs(_hostScale.x));
  const s = WORLD_SCALE / parent;
  mark.setScale(s, s, s);
}

function pulseMark(mark: Node, t: number, phase: number): void {
  const compact = _flags.get(mark) === true;
  const u = ((t + phase * 0.13) % 0.82) / 0.82;
  const k = 0.5 - 0.5 * Math.cos(u * Math.PI * 2);
  const arrow = mark.getChildByName('Arrow');
  arrow?.setPosition(0, k * 14, 0);
  const as = (compact ? 0.78 : 0.88) * (1 + k * 0.06);
  arrow?.setScale(as, as, 1);
}

export function tickPickMarks(
  hosts: readonly { node: Node; index: number }[],
  cam: Camera | null,
  t: number,
): void {
  for (const u of hosts) {
    const n = u.node.getChildByName(NAME);
    if (!n?.active) continue;
    poseMark(n, u.node, cam, _flags.get(n) === true);
    pulseMark(n, t, u.index);
  }
}
