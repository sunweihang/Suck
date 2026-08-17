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

export function paintLevelBadge(g: Graphics, w: number, h: number): void {
  const r = h * 0.5;
  g.clear();
  g.fillColor = Theme.badgeShadow;
  g.roundRect(-w * 0.5 + 4, -h * 0.5 - 8, w - 8, h - 6, r);
  g.fill();
  g.fillColor = Theme.badgeFill;
  g.roundRect(-w * 0.5, -h * 0.5 + 2, w, h - 10, r * 0.92);
  g.fill();
  g.strokeColor = Theme.badgeStroke;
  g.lineWidth = Math.max(3, h * 0.045);
  g.roundRect(-w * 0.5 + 10, -h * 0.5 + 12, w - 20, h - 28, Math.max(8, r * 0.72));
  g.stroke();
}

export function styleLevelBadge(lab: Label, size: number): void {
  lab.fontSize = size;
  lab.lineHeight = size + 10;
  lab.isBold = true;
  lab.color = Theme.badgeText;
  lab.enableOutline = true;
  lab.outlineWidth = Math.max(4, Math.round(size * 0.12));
  lab.outlineColor = Theme.badgeTextStroke;
  lab.enableShadow = true;
  lab.shadowOffset = new Vec2(0, -Math.max(2, Math.round(size * 0.05)));
  lab.shadowBlur = 1;
  lab.shadowColor = new Color(88, 56, 140, 90);
  lab.horizontalAlign = Label.HorizontalAlign.CENTER;
  lab.verticalAlign = Label.VerticalAlign.CENTER;
  lab.overflow = Label.Overflow.SHRINK;
  lab.useSystemFont = true;
  lab.fontFamily = 'PingFang SC';
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

export function paintCapsuleBtn(g: Graphics, w: number, h: number, fill: Color, stroke: Color): void {
  const r = Math.min(h * 0.5, w * 0.5);
  const rim = Math.max(7, Math.round(h * 0.08));
  g.clear();
  g.fillColor = new Color(48, 32, 56, 46);
  g.roundRect(-w * 0.5 + 4, -h * 0.5 - 6, w, h, r);
  g.fill();
  g.fillColor = new Color(255, 255, 255, 255);
  g.roundRect(-w * 0.5, -h * 0.5, w, h, r);
  g.fill();
  const iw = w - rim * 2;
  const ih = h - rim * 2;
  const ir = Math.max(10, r - rim);
  g.fillColor = fill;
  g.roundRect(-iw * 0.5, -ih * 0.5, iw, ih, ir);
  g.fill();
  g.fillColor = new Color(255, 255, 255, 96);
  g.roundRect(-iw * 0.5 + 10, ih * 0.06, iw - 20, ih * 0.30, ir * 0.42);
  g.fill();
  g.strokeColor = stroke;
  g.lineWidth = Math.max(3, Math.round(h * 0.036));
  g.roundRect(-iw * 0.5, -ih * 0.5, iw, ih, ir);
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
