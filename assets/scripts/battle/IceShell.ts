import {
  Color,
  EffectAsset,
  Label,
  Layers,
  Material,
  MeshRenderer,
  Node,
  Tween,
  UITransform,
  Vec3,
  assetManager,
  gfx,
  resources,
  tween,
} from 'cc';
import { PLAY } from '../game/GameConfig';
import { freezeDeployNeed } from '../game/LevelCatalog';
import { getShooterMesh } from './TurretLook';

const ICE_FX = 'fx/ice-shell';
const NEED_SCALE = 0.0036;
const NEED_FONT = 34;
const _host = new WeakMap<Node, Node>();
const _fading = new WeakSet<Node>();

let _fx: EffectAsset | null = null;
let _mat: Material | null = null;
let _labelMat: Material | null = null;
let _boot: Promise<void> | null = null;
let _need = -1;

export function setIceNeed(need: number): void {
  _need = Math.max(0, need | 0);
}

export function iceNeed(): number {
  return _need >= 0 ? _need : freezeDeployNeed(PLAY.levelId);
}

function iceMat(): Material | null {
  if (_mat) return _mat;
  if (!_fx) return null;
  const mat = new Material();
  mat.initialize({
    effectAsset: _fx,
    states: {
      depthStencilState: {
        depthTest: true,
        depthWrite: true,
        depthFunc: gfx.ComparisonFunc.LESS_EQUAL,
      },
      rasterizerState: {
        cullMode: gfx.CullMode.BACK,
      },
    },
  });
  if (mat.passes?.length) _mat = mat;
  return _mat;
}

function labelMat(): Material | null {
  if (_labelMat) return _labelMat;
  try {
    const mat = new Material();
    mat.initialize({
      effectName: 'builtin-sprite',
      states: {
        depthStencilState: {
          depthTest: true,
          depthWrite: false,
          depthFunc: gfx.ComparisonFunc.LESS_EQUAL,
        },
        rasterizerState: {
          cullMode: gfx.CullMode.NONE,
        },
      },
    });
    if (mat.passes?.length) _labelMat = mat;
  } catch {
    /* keep default */
  }
  return _labelMat;
}

function bindNeed(node: Node, need: number): void {
  node.layer = Layers.Enum.UI_3D;
  node.setPosition(0, 0.408, 0.02);
  node.setScale(NEED_SCALE, NEED_SCALE, NEED_SCALE);
  node.setRotationFromEuler(-90, 0, 0);
  const ut = node.getComponent(UITransform) ?? node.addComponent(UITransform);
  ut.setContentSize(180, 56);
  ut.hitTest = () => false;
  let lab = node.getComponent(Label);
  if (!lab) lab = node.addComponent(Label);
  lab.fontSize = NEED_FONT;
  lab.lineHeight = NEED_FONT + 10;
  lab.isBold = true;
  lab.color = Color.WHITE;
  lab.enableOutline = true;
  lab.outlineWidth = 6;
  lab.outlineColor = Color.BLACK;
  lab.horizontalAlign = Label.HorizontalAlign.CENTER;
  lab.verticalAlign = Label.VerticalAlign.CENTER;
  lab.useSystemFont = true;
  lab.cacheMode = Label.CacheMode.CHAR;
  lab.overflow = Label.Overflow.NONE;
  lab.enableWrapText = false;
  lab.string = String(Math.max(0, need | 0));
  const mat = labelMat();
  if (mat) lab.customMaterial = mat;
}

function bindCoat(node: Node, host: Node): void {
  const mat = iceMat();
  if (!mat) return;
  const body = host.getChildByName('Rig')?.getChildByName('Body')
    ?? host.getChildByName('Body')
    ?? host;
  const src = body.getComponent(MeshRenderer);
  const mesh = src?.mesh ?? getShooterMesh();
  if (!mesh) return;
  node.layer = body.layer;
  node.setPosition(0, 0, 0);
  node.setRotationFromEuler(0, 0, 0);
  node.setScale(1.035, 1.035, 1.035);
  node.removeComponent('Sprite');
  node.removeComponent(UITransform);
  const mr = node.getComponent(MeshRenderer) ?? node.addComponent(MeshRenderer);
  mr.mesh = mesh;
  mr.material = mat;
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
}

export function preloadIceShell(): Promise<void> {
  if (_fx) return Promise.resolve();
  if (_boot) return _boot;
  _boot = new Promise((resolve) => {
    const done = (err: Error | null, asset: EffectAsset): void => {
      if (!err && asset) _fx = asset;
      resolve();
    };
    const bundle = assetManager.getBundle('resources');
    if (bundle) bundle.load(ICE_FX, EffectAsset, done);
    else resources.load(ICE_FX, EffectAsset, done);
  });
  return _boot;
}

function iceParent(root: Node): Node {
  return root.getChildByName('Rig')?.getChildByName('Body')
    ?? root.getChildByName('Body')
    ?? root;
}

function findIce(root: Node): Node | null {
  return _host.get(root)
    ?? iceParent(root).getChildByName('IceShell')
    ?? root.getChildByName('IceShell');
}

export function clearIceShell(root: Node, instant = false): void {
  const n = findIce(root);
  _host.delete(root);
  if (!n?.isValid) return;
  Tween.stopAllByTarget(n);
  _fading.delete(n);
  if (instant || !n.active) {
    n.destroy();
    return;
  }
  _fading.add(n);
  n.name = 'IceShellOut';
  const to = new Vec3(0, 0, 0);
  tween(n)
    .to(0.22, { scale: to }, { easing: 'backIn' })
    .call(() => {
      _fading.delete(n);
      if (n.isValid) n.destroy();
    })
    .start();
}

export function applyIceShell(root: Node, need?: number): void {
  const shown = need ?? iceNeed();
  _need = shown;
  if (!_fx) {
    void preloadIceShell().then(() => {
      if (root?.isValid) applyIceShell(root, shown);
    });
    return;
  }
  const parent = iceParent(root);
  const stale = root.getChildByName('IceShell');
  if (stale && stale.parent !== parent) stale.destroy();
  let n = parent.getChildByName('IceShell');
  if (n && _fading.has(n)) {
    Tween.stopAllByTarget(n);
    _fading.delete(n);
    n.destroy();
    n = null;
  }
  const fresh = !n;
  if (!n) {
    n = new Node('IceShell');
    n.layer = parent.layer;
    parent.addChild(n);
  }
  n.active = true;
  n.setPosition(0, 0, 0);
  n.setRotationFromEuler(0, 0, 0);
  if (fresh) {
    n.setScale(0.2, 0.2, 0.2);
    Tween.stopAllByTarget(n);
    tween(n).to(0.28, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
  } else {
    n.setScale(1, 1, 1);
  }
  let coat = n.getChildByName('Coat');
  if (!coat) {
    coat = new Node('Coat');
    n.addChild(coat);
  }
  bindCoat(coat, root);
  const leftover = n.getChildByName('Crystal') ?? n.getChildByName('Ad');
  if (leftover) leftover.destroy();
  let tag = n.getChildByName('Need');
  if (!tag) {
    tag = new Node('Need');
    n.addChild(tag);
  }
  tag.setSiblingIndex(n.children.length - 1);
  bindNeed(tag, shown);
  _host.set(root, n);
}
