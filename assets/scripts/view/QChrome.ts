import { Color, Graphics, Label, UITransform, Vec2 } from 'cc';
import { Theme } from '../game/Theme';

export function paintQBoard(g: Graphics, w: number, h: number): void {
  const r = Math.min(h * 0.30, w * 0.16);
  g.clear();
  g.fillColor = Theme.boardShadow;
  g.roundRect(-w * 0.5 + 6, -h * 0.5 - 8, w, h, r);
  g.fill();
  g.fillColor = Theme.boardFill;
  g.roundRect(-w * 0.5, -h * 0.5, w, h, r);
  g.fill();
  g.fillColor = Theme.boardHi;
  g.roundRect(-w * 0.5 + 18, h * 0.10, w - 36, h * 0.26, r * 0.55);
  g.fill();
  g.strokeColor = Theme.boardStroke;
  g.lineWidth = Math.max(7, h * 0.055);
  g.roundRect(-w * 0.5, -h * 0.5, w, h, r);
  g.stroke();
  g.strokeColor = Theme.playStroke;
  g.lineWidth = 3;
  g.roundRect(-w * 0.5 + 14, -h * 0.5 + 14, w - 28, h - 28, Math.max(10, r - 14));
  g.stroke();
}

export function paintQChip(g: Graphics, w: number, h: number, fill = Theme.boardChip): void {
  const r = h * 0.5;
  g.clear();
  g.fillColor = fill;
  g.roundRect(-w * 0.5, -h * 0.5, w, h, r);
  g.fill();
  g.strokeColor = Theme.boardDeep;
  g.lineWidth = 4;
  g.roundRect(-w * 0.5, -h * 0.5, w, h, r);
  g.stroke();
}

export function paintQBtn(g: Graphics, w: number, h: number, fill: Color, stroke: Color): void {
  const r = Math.min(h * 0.46, w * 0.28);
  g.clear();
  g.fillColor = Theme.boardShadow;
  g.roundRect(-w * 0.5 + 5, -h * 0.5 - 7, w, h, r);
  g.fill();
  g.fillColor = fill;
  g.roundRect(-w * 0.5, -h * 0.5, w, h, r);
  g.fill();
  g.fillColor = Theme.playStroke;
  g.roundRect(-w * 0.5 + 10, h * 0.12, w - 20, h * 0.22, r * 0.4);
  g.fill();
  g.strokeColor = stroke;
  g.lineWidth = 6;
  g.roundRect(-w * 0.5, -h * 0.5, w, h, r);
  g.stroke();
}

export function styleQNum(lab: Label, size: number, color = Theme.boardNum): void {
  lab.fontSize = size;
  lab.lineHeight = size + 8;
  lab.isBold = true;
  lab.color = color;
  lab.enableOutline = true;
  lab.outlineWidth = Math.max(5, Math.round(size * 0.08));
  lab.outlineColor = Theme.boardHi;
  lab.enableShadow = true;
  lab.shadowOffset = new Vec2(0, -Math.max(3, size * 0.04));
  lab.shadowBlur = 2;
  lab.shadowColor = new Color(120, 48, 16, 140);
  lab.horizontalAlign = Label.HorizontalAlign.CENTER;
  lab.verticalAlign = Label.VerticalAlign.CENTER;
  lab.useSystemFont = true;
}

export function styleQCaption(lab: Label, size: number, color = Theme.playText): void {
  lab.fontSize = size;
  lab.lineHeight = size + 6;
  lab.isBold = true;
  lab.color = color;
  lab.enableOutline = true;
  lab.outlineWidth = Math.max(3, Math.round(size * 0.1));
  lab.outlineColor = Theme.boardHi;
  lab.horizontalAlign = Label.HorizontalAlign.CENTER;
  lab.verticalAlign = Label.VerticalAlign.CENTER;
  lab.useSystemFont = true;
}

export function fitBox(node: { getComponent: (t: typeof UITransform) => UITransform | null }, w: number, h: number): void {
  node.getComponent(UITransform)?.setContentSize(w, h);
}
