import {
  Color,
  ImageAsset,
  Layers,
  Material,
  Node,
  RenderRoot2D,
  Sprite,
  SpriteFrame,
  Texture2D,
  UITransform,
  gfx,
  resources,
} from 'cc';
import { TURRET_POWER_LOCAL } from './ToyLook';

const POWER_SCALE = 0.0054;
const DIGIT_H = 32;
const OVERLAP = 0.16;
const SHADOW = { x: 1.4, y: -1.4 };
let _depthMat: Material | null = null;
const _frames: Array<SpriteFrame | null> = [];
let _boot: Promise<void> | null = null;

function powerDepthMat(): Material | null {
  if (_depthMat) return _depthMat;
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
    if (mat.passes?.length) {
      _depthMat = mat;
      return mat;
    }
  } catch {
    /* keep default UI material */
  }
  return null;
}

function frameFromImage(img: ImageAsset): SpriteFrame {
  const tex = new Texture2D();
  tex.image = img;
  try {
    tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
    tex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
    tex.setMipFilter(Texture2D.Filter.NONE);
  } catch {
    /* older engine */
  }
  const sf = new SpriteFrame();
  sf.texture = tex;
  return sf;
}

function loadDigit(d: number): Promise<SpriteFrame | null> {
  return new Promise((resolve) => {
    resources.load(`toys/power-${d}`, ImageAsset, (err, img) => {
      if (!err && img) {
        resolve(frameFromImage(img));
        return;
      }
      resources.load(`toys/power-${d}/texture`, Texture2D, (err2, tex) => {
        if (err2 || !tex) {
          resolve(null);
          return;
        }
        const sf = new SpriteFrame();
        sf.texture = tex;
        resolve(sf);
      });
    });
  });
}

function ensureBenchRoot(host: Node): void {
  const parent = host.parent;
  if (!parent || parent.name === 'Wall' || parent.name === 'Field') return;
  if (!parent.getComponent(RenderRoot2D)) parent.addComponent(RenderRoot2D);
}

function findPower(host: Node): Node | null {
  const rig = host.getChildByName('Rig');
  return host.getChildByName('Power')
    ?? rig?.getChildByName('Power')
    ?? rig?.getChildByName('Body')?.getChildByName('Power')
    ?? host.getChildByName('Body')?.getChildByName('Power')
    ?? null;
}

function powerParent(host: Node): Node {
  return host.getChildByName('Rig')?.getChildByName('Body')
    ?? host.getChildByName('Body')
    ?? host.getChildByName('Rig')
    ?? host;
}

function stripMeshJunk(tag: Node): void {
  tag.removeComponent('MeshRenderer');
  tag.removeComponent('Billboard');
  tag.removeComponent('Sprite');
  tag.removeComponent('Label');
  for (const child of [...tag.children]) {
    if (child.name === 'Digits') continue;
    child.destroy();
  }
}

function uiNode(parent: Node, name: string, w: number, h: number): Node {
  let n = parent.getChildByName(name);
  if (!n) {
    n = new Node(name);
    parent.addChild(n);
  }
  n.layer = Layers.Enum.UI_3D;
  const ut = n.getComponent(UITransform) ?? n.addComponent(UITransform);
  ut.setContentSize(w, h);
  ut.hitTest = () => false;
  return n;
}

function paintSprite(node: Node, sf: SpriteFrame, w: number, h: number, color: Color): void {
  const ut = node.getComponent(UITransform) ?? node.addComponent(UITransform);
  ut.setContentSize(w, h);
  ut.hitTest = () => false;
  const sp = node.getComponent(Sprite) ?? node.addComponent(Sprite);
  sp.sizeMode = Sprite.SizeMode.CUSTOM;
  sp.type = Sprite.Type.SIMPLE;
  sp.spriteFrame = sf;
  sp.color = color;
  const mat = powerDepthMat();
  if (mat) sp.customMaterial = mat;
}

function digitWidth(sf: SpriteFrame): number {
  const h = Math.max(1, sf.rect.height);
  return DIGIT_H * (sf.rect.width / h);
}

function ensureDigits(tag: Node): Node {
  return uiNode(tag, 'Digits', 48, DIGIT_H);
}

export function preloadPowerDigits(): Promise<void> {
  if (_frames.length === 10 && _frames.every(Boolean)) return Promise.resolve();
  if (_boot) return _boot;
  _boot = Promise.all(Array.from({ length: 10 }, (_, d) => loadDigit(d))).then((list) => {
    for (let d = 0; d < 10; d++) _frames[d] = list[d];
  });
  return _boot;
}

export function bindPowerLayer(canvas: Node): void {
  const leftover = canvas.getChildByName('PowerLayer');
  if (leftover) leftover.destroy();
}

export function syncPowerMarks(_cam: unknown): void {
  /* labels stay on the shooter */
}

export function bindPowerMark(host: Node): Node {
  ensureBenchRoot(host);
  const parent = powerParent(host);
  let tag = findPower(host);
  if (tag && tag.parent !== parent) tag.setParent(parent, false);
  if (!tag) {
    tag = new Node('Power');
    parent.addChild(tag);
    const tagUt = tag.addComponent(UITransform);
    tagUt.setContentSize(48, DIGIT_H);
    tagUt.hitTest = () => false;
  }
  stripMeshJunk(tag);
  ensureDigits(tag);
  tag.layer = Layers.Enum.UI_3D;
  tag.active = true;
  tag.setSiblingIndex(0);
  tag.setPosition(TURRET_POWER_LOCAL);
  tag.setRotationFromEuler(-90, 0, 0);
  tag.setScale(POWER_SCALE, POWER_SCALE, POWER_SCALE);
  return tag;
}

export function paintPowerMark(tag: Node | null, value: number): void {
  if (!tag?.isValid) return;
  const box = ensureDigits(tag);
  const num = String(Math.max(0, Math.round(value)));
  const glyphs = [...num].map((ch) => _frames[Number(ch)] ?? null);
  if (glyphs.some((sf) => !sf)) {
    box.active = false;
    return;
  }
  box.active = true;
  const gap = DIGIT_H * OVERLAP;
  const widths = glyphs.map((sf) => digitWidth(sf!));
  const total = widths.reduce((s, w) => s + w, 0) - gap * Math.max(0, widths.length - 1);
  box.getComponent(UITransform)?.setContentSize(total, DIGIT_H);
  tag.getComponent(UITransform)?.setContentSize(total, DIGIT_H);

  let x = -total * 0.5;
  for (let i = 0; i < glyphs.length; i++) {
    const sf = glyphs[i]!;
    const w = widths[i];
    const cx = x + w * 0.5;
    const face = uiNode(box, `D${i}`, w, DIGIT_H);
    const shade = uiNode(box, `S${i}`, w, DIGIT_H);
    paintSprite(shade, sf, w, DIGIT_H, Color.BLACK);
    paintSprite(face, sf, w, DIGIT_H, Color.WHITE);
    shade.setPosition(cx + SHADOW.x, SHADOW.y, 0);
    face.setPosition(cx, 0, 0);
    shade.setSiblingIndex(i * 2);
    face.setSiblingIndex(i * 2 + 1);
    x += w - gap;
  }
  for (const child of [...box.children]) {
    const m = /^[DS](\d+)$/.exec(child.name);
    if (m && Number(m[1]) >= glyphs.length) child.destroy();
  }
}
