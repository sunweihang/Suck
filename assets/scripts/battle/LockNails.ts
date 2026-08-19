import {
  Color,
  Layers,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  RenderRoot2D,
  Sprite,
  SpriteFrame,
  Tween,
  UITransform,
  Vec3,
  gfx,
  resources,
  tween,
  utils,
} from 'cc';
import { PLAY, SPECIAL_SPAN, specialCenterX, specialCenterY, wallStartX } from '../game/GameConfig';

const NAIL_PX = 256;
const NAIL_SCALE = 0.00305;

export type LockLookKind = 'block' | 'octopus' | 'chest';

let _nailSf: SpriteFrame | null = null;
let _chainSf: SpriteFrame | null = null;
let _chainMat: Material | null = null;
let _chainQuad: Mesh | null = null;
let _depthMat: Material | null = null;

function loadFrame(path: string): Promise<SpriteFrame | null> {
  return new Promise((resolve) => {
    resources.load(`${path}/spriteFrame`, SpriteFrame, (err, sf) => {
      resolve(!err && sf ? sf : null);
    });
  });
}

function spriteMat(depthTest: boolean): Material | null {
  try {
    const mat = new Material();
    mat.initialize({
      effectName: 'builtin-sprite',
      states: {
        depthStencilState: {
          depthTest,
          depthWrite: false,
          depthFunc: gfx.ComparisonFunc.LESS_EQUAL,
        },
        rasterizerState: {
          cullMode: gfx.CullMode.NONE,
        },
      },
    });
    if (mat.passes?.length) return mat;
  } catch {
    /* keep default */
  }
  return null;
}

function depthMat(): Material | null {
  if (_depthMat) return _depthMat;
  _depthMat = spriteMat(true);
  return _depthMat;
}

function ensureUiHost(root: Node): void {
  const host = root.parent;
  if (!host || host.name === 'Wall' || host.name === 'Field') return;
  if (!host.getComponent(RenderRoot2D)) host.addComponent(RenderRoot2D);
}

function bindSprite(
  node: Node,
  sf: SpriteFrame,
  px: number,
  scale: number,
  x: number,
  y: number,
  z: number,
): Sprite {
  node.layer = Layers.Enum.UI_3D;
  node.setPosition(x, y, z);
  node.setScale(scale, scale, scale);
  node.setRotationFromEuler(0, 0, 0);
  const ut = node.getComponent(UITransform) ?? node.addComponent(UITransform);
  ut.setContentSize(px, px);
  ut.hitTest = () => false;
  const sp = node.getComponent(Sprite) ?? node.addComponent(Sprite);
  sp.sizeMode = Sprite.SizeMode.CUSTOM;
  sp.type = Sprite.Type.SIMPLE;
  sp.spriteFrame = sf;
  sp.color = Color.WHITE;
  const mat = depthMat();
  if (mat) sp.customMaterial = mat;
  return sp;
}

const _fading = new WeakSet<Node>();

function fadeOff(node: Node | null): void {
  if (!node || !node.active || _fading.has(node)) return;
  _fading.add(node);
  const chain = node.getChildByName('Chain');
  if (chain) {
    Tween.stopAllByTarget(chain);
    _pulsing.delete(chain);
  }
  Tween.stopAllByTarget(node);
  tween(node)
    .to(0.2, { scale: new Vec3(0, 0, 0) }, { easing: 'backIn' })
    .call(() => {
      _fading.delete(node);
      if (node.isValid) node.active = false;
    })
    .start();
}

function dropOldRim(root: Node): void {
  const rim = root.getChildByName('HoldRim');
  if (!rim) return;
  Tween.stopAllByTarget(rim);
  rim.destroy();
}

function isMeshLock(n: Node): boolean {
  return !!n.getChildByName('LockLink0') || !!n.getChildByName('LockChain');
}

function chainQuad(): Mesh | null {
  if (_chainQuad) return _chainQuad;
  _chainQuad = utils.MeshUtils.createMesh({
    positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 1, 1, 1, 0, 0, 1, 0],
    indices: [0, 1, 2, 1, 3, 2],
    minPos: new Vec3(-0.5, -0.5, 0),
    maxPos: new Vec3(0.5, 0.5, 0),
    boundingRadius: 0.75,
  });
  return _chainQuad;
}

function chainMat(sf: SpriteFrame): Material | null {
  if (_chainMat) return _chainMat;
  const tex = sf.texture;
  if (!tex) return null;
  const mat = new Material();
  mat.initialize({
    effectName: 'builtin-unlit',
    technique: 0,
    defines: { USE_TEXTURE: true, USE_ALPHA_TEST: true },
    states: {
      rasterizerState: { cullMode: gfx.CullMode.NONE },
      depthStencilState: {
        depthTest: true,
        depthWrite: false,
        depthFunc: gfx.ComparisonFunc.LESS_EQUAL,
      },
    },
  });
  mat.setProperty('mainTexture', tex);
  mat.setProperty('mainColor', Color.WHITE);
  try {
    mat.setProperty('alphaThreshold', 0.2);
  } catch {
    /* older unlit */
  }
  _chainMat = mat;
  return mat;
}

/** lock-chain-metal.png opaque bbox is 475px in a 512 canvas. */
const CHAIN_TEX = 512 / 475;

function trapCell(name: string): { col: number; row: number } | null {
  const p = name.split('_');
  if (p[0] === 'Rescue' && p.length >= 4) return { col: Number(p[2]) || 0, row: Number(p[3]) || 0 };
  if (p[0] === 'Chest' && p.length >= 3) return { col: Number(p[1]) || 0, row: Number(p[2]) || 0 };
  return null;
}

function parentScale(host: Node): number {
  const parent = host.parent;
  return parent ? Math.max(0.001, Math.abs(parent.scale.x)) : 1;
}

function chainLocalSize(host: Node): number {
  return (PLAY.blockStep * SPECIAL_SPAN * CHAIN_TEX) / parentScale(host);
}

function alignLockToHole(host: Node): void {
  const root = host.parent;
  const step = PLAY.blockStep;
  const s = parentScale(host);
  const trap = trapCell(root?.name ?? '');
  const holeX = trap ? specialCenterX(trap.col, wallStartX(), step) : (root?.position.x ?? 0);
  const holeY = trap ? specialCenterY(trap.row, PLAY.wallBaseY, step) : (root?.position.y ?? 0);
  const px = root?.position.x ?? 0;
  const py = root?.position.y ?? 0;
  host.setPosition((holeX - px) / s, (holeY - py) / s, (PLAY.blockSize * 0.5 + 0.06) / s);
  host.setRotationFromEuler(0, 0, 0);
  host.setScale(1, 1, 1);
}

const _pulsing = new WeakSet<Node>();

function pulseChain(chain: Node, size: number): void {
  if (_pulsing.has(chain)) return;
  _pulsing.add(chain);
  const beat = () => {
    if (!chain.isValid || !chain.active) {
      _pulsing.delete(chain);
      return;
    }
    tween(chain)
      .to(0.48, { scale: new Vec3(size * 1.1, size * 1.1, 1) }, { easing: 'sineOut' })
      .to(0.48, { scale: new Vec3(size, size, 1) }, { easing: 'sineIn' })
      .call(beat)
      .start();
  };
  beat();
}

function mountFlatChain(host: Node, _kind: 'octopus' | 'chest'): void {
  if (!_chainSf) return;
  const mesh = chainQuad();
  const mat = chainMat(_chainSf);
  if (!mesh || !mat) return;
  for (const child of [...host.children]) {
    if (child.name !== 'Chain') child.destroy();
  }
  host.layer = host.parent?.layer ?? Layers.Enum.DEFAULT;
  alignLockToHole(host);
  let chain = host.getChildByName('Chain');
  if (!chain) {
    chain = new Node('Chain');
    host.addChild(chain);
    chain.addComponent(MeshRenderer);
  }
  const size = chainLocalSize(host);
  chain.layer = host.layer;
  chain.active = true;
  chain.setPosition(0, 0, 0);
  chain.setRotationFromEuler(0, 0, 0);
  const mr = chain.getComponent(MeshRenderer);
  if (!mr) return;
  mr.enabled = true;
  mr.mesh = mesh;
  mr.setSharedMaterial(mat, 0);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  if (!_pulsing.has(chain)) {
    chain.setScale(size, size, 1);
    pulseChain(chain, size);
  }
}

export function preloadLockNails(): Promise<void> {
  return Promise.all([
    loadFrame('ui/lock-nail'),
    loadFrame('ui/lock-chain-metal'),
  ]).then(([nail, chain]) => {
    if (nail) _nailSf = nail;
    if (chain) {
      _chainSf = chain;
      _chainMat = null;
    }
  });
}

export function clearLockLook(root: Node): void {
  fadeOff(root.getChildByName('LockNails'));
}

export function applyLockNails(root: Node, kind: LockLookKind = 'block'): void {
  let n = root.getChildByName('LockNails');
  if (n && (kind === 'octopus' || kind === 'chest') && isMeshLock(n)) {
    n.destroy();
    n = null;
  }
  if (n && n.active && !_fading.has(n) && (kind === 'octopus' || kind === 'chest')) return;
  if (n) {
    if (!n.active || _fading.has(n)) {
      _fading.delete(n);
      Tween.stopAllByTarget(n);
      n.active = true;
    }
  } else {
    n = new Node('LockNails');
    n.layer = root.layer;
    root.addChild(n);
  }
  if (kind === 'octopus' || kind === 'chest') {
    mountFlatChain(n, kind);
    return;
  }
  if (!_nailSf) return;
  ensureUiHost(root);
  n.setPosition(0, 0, 0);
  n.setScale(1, 1, 1);
  n.layer = Layers.Enum.UI_3D;
  let nail = n.getChildByName('Nail');
  if (!nail) {
    nail = new Node('Nail');
    n.addChild(nail);
  }
  bindSprite(nail, _nailSf, NAIL_PX, NAIL_SCALE, 0, 0.02, 0.56);
}

export function clearHoldGlow(root: Node): void {
  const n = root.getChildByName('HoldGlow');
  const rim = root.getChildByName('HoldRim');
  if (!n && !rim) return;
  if (n) {
    Tween.stopAllByTarget(n);
    n.destroy();
  }
  dropOldRim(root);
}

export function applyHoldGlow(_root: Node, _sides: number): void {
  /* glow art retired; keep the hook so holder tracking stays cheap */
}
