import {
  Color,
  Label,
  Layers,
  Material,
  Node,
  RenderRoot2D,
  UITransform,
  gfx,
} from 'cc';
import { OCTO_POWER_LOCAL } from './ToyLook';

const POWER_SCALE = 0.011;
let _depthMat: Material | null = null;

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

function ensureBenchRoot(host: Node): void {
  const parent = host.parent;
  if (!parent || parent.name === 'Wall' || parent.name === 'Field') return;
  if (!parent.getComponent(RenderRoot2D)) parent.addComponent(RenderRoot2D);
}

function findPower(host: Node): Node | null {
  const direct = host.getChildByName('Power');
  if (direct) return direct;
  const body = host.getChildByName('Rig')?.getChildByName('Body') ?? host.getChildByName('Body');
  return body?.getChildByName('Power') ?? null;
}

function stripMeshJunk(tag: Node): void {
  tag.removeComponent('MeshRenderer');
  tag.removeComponent('Billboard');
  tag.removeComponent('Sprite');
  for (const child of [...tag.children]) {
    if (child.name === 'Text') continue;
    child.destroy();
  }
}

function styleLabel(lab: Label): void {
  lab.fontSize = 18;
  lab.lineHeight = 20;
  lab.isBold = true;
  lab.color = new Color(255, 252, 246, 255);
  lab.enableOutline = true;
  lab.outlineWidth = 2;
  lab.outlineColor = new Color(20, 24, 32, 220);
  lab.horizontalAlign = Label.HorizontalAlign.CENTER;
  lab.verticalAlign = Label.VerticalAlign.CENTER;
  lab.overflow = Label.Overflow.NONE;
  lab.useSystemFont = true;
  const mat = powerDepthMat();
  if (mat) lab.customMaterial = mat;
}

export function preloadPowerDigits(): Promise<void> {
  return Promise.resolve();
}

export function bindPowerLayer(canvas: Node): void {
  const leftover = canvas.getChildByName('PowerLayer');
  if (leftover) leftover.destroy();
}

export function syncPowerMarks(_cam: unknown): void {
  /* labels stay on the octopus */
}

export function bindPowerMark(host: Node): Node {
  ensureBenchRoot(host);
  let tag = findPower(host);
  if (tag && tag.parent !== host) tag.setParent(host, false);
  if (tag && !tag.getChildByName('Text')) {
    tag.removeFromParent();
    tag.destroy();
    tag = null;
  }
  if (!tag) {
    tag = new Node('Power');
    host.addChild(tag);
    const tagUt = tag.addComponent(UITransform);
    tagUt.setContentSize(48, 24);
    tagUt.hitTest = () => false;
    const text = new Node('Text');
    tag.addChild(text);
    const textUt = text.addComponent(UITransform);
    textUt.setContentSize(48, 24);
    textUt.hitTest = () => false;
    const lab = text.addComponent(Label);
    lab.string = '0';
    styleLabel(lab);
  } else {
    const lab = tag.getChildByName('Text')?.getComponent(Label);
    if (lab) styleLabel(lab);
  }
  stripMeshJunk(tag);
  tag.layer = Layers.Enum.UI_3D;
  const text = tag.getChildByName('Text');
  if (text) text.layer = Layers.Enum.UI_3D;
  tag.active = true;
  tag.setSiblingIndex(0);
  tag.setPosition(OCTO_POWER_LOCAL);
  tag.setRotationFromEuler(0, 0, 0);
  tag.setScale(POWER_SCALE, POWER_SCALE, POWER_SCALE);
  return tag;
}

export function paintPowerMark(tag: Node | null, value: number): void {
  if (!tag?.isValid) return;
  const lab = tag.getChildByName('Text')?.getComponent(Label);
  if (!lab) return;
  const num = String(Math.max(0, Math.round(value)));
  lab.string = num;
  const w = Math.max(32, 14 + num.length * 11);
  lab.node.getComponent(UITransform)?.setContentSize(w, 18);
  tag.getComponent(UITransform)?.setContentSize(w, 18);
}
