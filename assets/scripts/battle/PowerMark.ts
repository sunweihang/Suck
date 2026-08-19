import {
  Color,
  Label,
  Layers,
  Node,
  RenderRoot2D,
  UITransform,
} from 'cc';
import { TURRET_POWER_LOCAL } from './ToyLook';

const POWER_SCALE = 0.0036;
const FONT = 34;

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

function ensureUiRoot(host: Node): void {
  const parent = host.parent;
  if (!parent || parent.name === 'Wall' || parent.name === 'Field') {
    if (!host.getComponent(RenderRoot2D)) host.addComponent(RenderRoot2D);
    return;
  }
  if (!parent.getComponent(RenderRoot2D)) parent.addComponent(RenderRoot2D);
}

function styleLabel(lab: Label): void {
  lab.fontSize = FONT;
  lab.lineHeight = FONT + 10;
  lab.isBold = true;
  lab.color = Color.WHITE;
  lab.enableOutline = true;
  lab.outlineWidth = 5;
  lab.outlineColor = Color.BLACK;
  lab.horizontalAlign = Label.HorizontalAlign.CENTER;
  lab.verticalAlign = Label.VerticalAlign.CENTER;
  lab.useSystemFont = true;
  lab.cacheMode = Label.CacheMode.CHAR;
  lab.overflow = Label.Overflow.NONE;
  lab.enableWrapText = false;
}

function ensureLabel(tag: Node): Label {
  tag.removeComponent('MeshRenderer');
  tag.removeComponent('Sprite');
  tag.removeComponent('Billboard');
  tag.removeComponent('RenderRoot2D');
  for (const child of [...tag.children]) child.destroy();

  tag.layer = Layers.Enum.UI_3D;
  const ut = tag.getComponent(UITransform) ?? tag.addComponent(UITransform);
  ut.setContentSize(180, 56);
  ut.hitTest = () => false;
  let lab = tag.getComponent(Label);
  if (!lab) lab = tag.addComponent(Label);
  styleLabel(lab);
  return lab;
}

export function posePowerMark(host: Node, tag: Node): void {
  const parent = powerParent(host);
  if (tag.parent !== parent) tag.setParent(parent, false);
  tag.setPosition(TURRET_POWER_LOCAL);
  tag.setRotationFromEuler(-90, 0, 0);
  tag.setScale(POWER_SCALE, POWER_SCALE, POWER_SCALE);
}

export function preloadPowerDigits(): Promise<void> {
  return Promise.resolve();
}

export function bindPowerLayer(canvas: Node): void {
  const leftover = canvas.getChildByName('PowerLayer');
  if (leftover) leftover.destroy();
}

export function syncPowerMarks(_cam: unknown): void {
  /* power stays on the turret */
}

export function bindPowerMark(host: Node): Node {
  ensureUiRoot(host);
  let tag = findPower(host);
  if (!tag) {
    tag = new Node('Power');
    powerParent(host).addChild(tag);
  }
  ensureLabel(tag);
  posePowerMark(host, tag);
  tag.active = true;
  return tag;
}

export function paintPowerMark(tag: Node | null, value: number): boolean {
  if (!tag?.isValid) return false;
  const lab = tag.getComponent(Label) ?? ensureLabel(tag);
  const text = String(Math.max(0, value | 0));
  if (lab.string === text) return true;
  lab.string = text;
  return true;
}
