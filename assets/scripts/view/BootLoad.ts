import {
  AssetManager,
  BlockInputEvents,
  Color,
  EventTouch,
  Graphics,
  Label,
  Layers,
  Node,
  Sprite,
  SpriteFrame,
  Tween,
  UIOpacity,
  UITransform,
  Vec3,
  Widget,
  tween,
} from 'cc';
import { openResourcesBundle } from '../boot/LoadBundles';
import { vibrateShort } from '../game/Haptic';
import { type LoadTip } from '../game/LoadTip';
import { coverBackgroundSize, portraitVisibleSize } from '../game/PortraitFit';
import { applyArtSpriteSoon } from './UiArt';

export type BootLoad = {
  set: (progress: number, tip?: string) => void;
  raise: () => void;
  show: (tip?: LoadTip | null) => void;
  finish: (hold?: boolean) => Promise<void>;
  hide: () => void;
};

const TRACK_W = 560;
const THUMB = 48;
const FILL_INSET = 8;
const CARD_W = 820;
const CARD_H = 520;
const TIP_W = 860;
const TIP_H = 640;
const TIP_ICON = 168;
const SPARK = 40;
const GO_W = 420;
const GO_H = 72;
const DIM = new Color(6, 8, 14, 200);
const TITLE_INK = new Color(255, 118, 86, 255);
const TITLE_OUTLINE = new Color(132, 52, 40, 255);
const BODY_INK = new Color(92, 58, 48, 255);
const GO_INK = new Color(255, 236, 150, 255);
const GO_OUTLINE = new Color(92, 48, 20, 255);
const IRON_FILL = new Color(168, 176, 188, 255);
const IRON_HI = new Color(214, 220, 228, 255);
const IRON_STROKE = new Color(96, 104, 116, 255);

type BootArt = {
  home: SpriteFrame;
  load: SpriteFrame;
  track: SpriteFrame;
  fill: SpriteFrame;
  knob: SpriteFrame;
  card: SpriteFrame;
  spark: SpriteFrame;
};

export async function attachBootLoad(host: Node): Promise<BootLoad> {
  const art = await loadBootArt();
  const vis = portraitVisibleSize();
  const cover = coverBackgroundSize(vis.width, vis.height);

  const root = new Node('BootLoad');
  host.addChild(root);
  root.layer = Layers.Enum.UI_2D;
  root.addComponent(UITransform).setContentSize(vis.width, vis.height);
  const rootW = root.addComponent(Widget);
  rootW.isAlignTop = rootW.isAlignBottom = rootW.isAlignLeft = rootW.isAlignRight = true;
  rootW.top = rootW.bottom = rootW.left = rootW.right = 0;
  rootW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
  if (!root.getComponent(BlockInputEvents)) root.addComponent(BlockInputEvents);

  const bg = mk(root, 'Bg', cover.w, cover.h);
  paint(bg, art.home, cover.w, cover.h, false);
  let cardBg = false;

  const dim = mk(root, 'Dim', vis.width, vis.height);
  const dimW = dim.addComponent(Widget);
  dimW.isAlignTop = dimW.isAlignBottom = dimW.isAlignLeft = dimW.isAlignRight = true;
  dimW.top = dimW.bottom = dimW.left = dimW.right = 0;
  dimW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
  dim.active = false;

  const trackH = Math.round(art.track.rect.height);
  const fillH = Math.round(art.fill.rect.height);
  const area = mk(root, 'Bar', TRACK_W, Math.max(trackH, THUMB) + 8);
  const barW = area.addComponent(Widget);
  barW.isAlignBottom = true;
  barW.isAlignHorizontalCenter = true;
  barW.isAlignTop = barW.isAlignLeft = barW.isAlignRight = false;
  barW.bottom = 96;
  barW.horizontalCenter = 0;
  barW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
  barW.updateAlignment();
  if (!area.getComponent(UIOpacity)) area.addComponent(UIOpacity);

  const tip = mk(root, 'Tip', TIP_W, TIP_H);
  const tipW = tip.addComponent(Widget);
  tipW.isAlignHorizontalCenter = tipW.isAlignVerticalCenter = true;
  tipW.isAlignTop = tipW.isAlignBottom = tipW.isAlignLeft = tipW.isAlignRight = false;
  tipW.horizontalCenter = 0;
  tipW.verticalCenter = 48;
  tipW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
  tipW.updateAlignment();
  tip.active = false;
  paint(mk(tip, 'Plate', CARD_W, CARD_H), art.card, CARD_W, CARD_H, false);
  mk(tip, 'Icon', TIP_ICON, TIP_ICON);
  styleTipTitle(mk(tip, 'Title', CARD_W - 160, 88).addComponent(Label), 56);
  styleTipBody(mk(tip, 'Body', CARD_W - 180, 140).addComponent(Label), 30);

  const go = mk(root, 'Continue', GO_W, GO_H);
  const goW = go.addComponent(Widget);
  goW.isAlignBottom = true;
  goW.isAlignHorizontalCenter = true;
  goW.isAlignTop = goW.isAlignLeft = goW.isAlignRight = false;
  goW.bottom = 108;
  goW.horizontalCenter = 0;
  goW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
  goW.updateAlignment();
  if (!go.getComponent(UIOpacity)) go.addComponent(UIOpacity);
  paint(mk(go, 'SparkL', SPARK, SPARK), art.spark, SPARK, SPARK, false);
  paint(mk(go, 'SparkR', SPARK, SPARK), art.spark, SPARK, SPARK, false);
  styleGo(mk(go, 'Label', 280, GO_H).addComponent(Label));
  placeContinue(go);
  go.active = false;

  sliceCapsule(art.track);
  sliceCapsule(art.fill);

  const track = mk(area, 'Track', TRACK_W, trackH);
  paint(track, art.track, TRACK_W, trackH, true);
  const fill = mk(area, 'Fill', fillH, fillH);
  fill.getComponent(UITransform)?.setAnchorPoint(0, 0.5);
  paint(fill, art.fill, fillH, fillH, true);
  const thumb = mk(area, 'Handle', THUMB, THUMB);
  paint(thumb, art.knob, THUMB, THUMB, false);

  let shown = 0.08;
  let goal = 0.08;
  let tick = 0;
  let tapDone: (() => void) | null = null;
  setFill(fill, thumb, fillH, shown);

  const paintBar = (p: number): void => {
    shown = p;
    setFill(fill, thumb, fillH, shown);
  };

  const pump = (): void => {
    if (tick || !root.isValid) return;
    tick = setTimeout(() => {
      tick = 0;
      if (!root.isValid) return;
      if (shown >= goal) return;
      paintBar(Math.min(goal, shown + 0.016));
      if (shown < goal) pump();
    }, 16) as unknown as number;
  };

  const aim = (progress: number): void => {
    goal = Math.max(goal, Math.min(1, progress));
    pump();
  };

  const raise = (): void => {
    if (root.parent) root.setSiblingIndex(root.parent.children.length - 1);
  };

  const paintBg = (): void => {
    const vis = portraitVisibleSize();
    const cover = coverBackgroundSize(vis.width, vis.height);
    paint(bg, cardBg ? art.load : art.home, cover.w, cover.h, false);
  };

  const relayout = (): void => {
    const vis = portraitVisibleSize();
    root.getComponent(UITransform)?.setContentSize(vis.width, vis.height);
    root.getComponent(Widget)?.updateAlignment();
    paintBg();
    dim.getComponent(UITransform)?.setContentSize(vis.width, vis.height);
    dim.getComponent(Widget)?.updateAlignment();
    if (dim.active) fillDim(dim, vis.width, vis.height);
    if (go.active) go.setSiblingIndex(root.children.length - 1);
    else area.setSiblingIndex(root.children.length - 1);
  };

  const resetReady = (): void => {
    Tween.stopAllByTarget(area);
    Tween.stopAllByTarget(go);
    const barOp = area.getComponent(UIOpacity);
    if (barOp) barOp.opacity = 255;
    area.active = true;
    area.setScale(1, 1, 1);
    go.active = false;
    go.setScale(1, 1, 1);
    const goOp = go.getComponent(UIOpacity);
    if (goOp) goOp.opacity = 255;
  };

  const revealContinue = (): void => {
    Tween.stopAllByTarget(area);
    const barOp = area.getComponent(UIOpacity) ?? area.addComponent(UIOpacity);
    tween(barOp)
      .to(0.22, { opacity: 0 }, { easing: 'sineOut' })
      .call(() => {
        if (area.isValid) area.active = false;
      })
      .start();
    go.active = true;
    go.setSiblingIndex(root.children.length - 1);
    placeContinue(go);
    breathGo(go);
  };

  const waitTap = (): Promise<void> => {
    return new Promise((resolve) => {
      const done = (): void => {
        if (tapDone !== done) return;
        tapDone = null;
        root.off(Node.EventType.TOUCH_END, onTap);
        resolve();
      };
      const onTap = (e: EventTouch): void => {
        e.propagationStopped = true;
        vibrateShort('light');
        done();
      };
      tapDone = done;
      root.on(Node.EventType.TOUCH_END, onTap);
    });
  };

  return {
    set(progress: number) {
      aim(progress);
    },
    raise,
    show(nextTip?: LoadTip | null) {
      if (!root.isValid) return;
      if (tick) clearTimeout(tick);
      tick = 0;
      shown = 0.08;
      goal = 0.08;
      cardBg = true;
      tapDone?.();
      resetReady();
      paintBar(0.08);
      paintTip(tip, dim, nextTip ?? null);
      relayout();
      root.active = true;
      raise();
    },
    async finish(hold = false) {
      aim(1);
      while (root.isValid && root.active && shown < 0.999) await wait(16);
      if (root.isValid) paintBar(1);
      await wait(160);
      if (!hold || !root.isValid || !root.active) return;
      revealContinue();
      await waitTap();
    },
    hide() {
      if (tick) clearTimeout(tick);
      tick = 0;
      tapDone?.();
      Tween.stopAllByTarget(tip);
      Tween.stopAllByTarget(area);
      Tween.stopAllByTarget(go);
      dim.active = false;
      tip.active = false;
      go.active = false;
      if (root.isValid) root.active = false;
    },
  };
}

async function loadBootArt(): Promise<BootArt> {
  const bundle = await openResourcesBundle();
  const [home, load, track, fill, knob, card, spark] = await Promise.all([
    loadSprite(bundle, 'ui/bg-home/spriteFrame'),
    loadSprite(bundle, 'ui/bg-load/spriteFrame'),
    loadSprite(bundle, 'ui/load-track/spriteFrame'),
    loadSprite(bundle, 'ui/load-fill/spriteFrame'),
    loadSprite(bundle, 'ui/load-knob/spriteFrame'),
    loadSprite(bundle, 'ui/tip-card/spriteFrame'),
    loadSprite(bundle, 'ui/tip-spark/spriteFrame'),
  ]);
  return { home, load, track, fill, knob, card, spark };
}

function loadSprite(bundle: AssetManager.Bundle, path: string): Promise<SpriteFrame> {
  return new Promise((resolve, reject) => {
    bundle.load(path, SpriteFrame, (err, sf) => {
      if (err || !(sf instanceof SpriteFrame) || (sf.rect?.width ?? 0) < 8) {
        reject(err ?? new Error(`boot sprite missing ${path}`));
        return;
      }
      resolve(sf);
    });
  });
}

function sliceCapsule(sf: SpriteFrame): void {
  const cap = Math.ceil(sf.rect.height * 0.5) + 6;
  sf.insetTop = 0;
  sf.insetBottom = 0;
  sf.insetLeft = cap;
  sf.insetRight = cap;
}

function paint(node: Node, sf: SpriteFrame, w: number, h: number, sliced: boolean): void {
  let sp = node.getComponent(Sprite);
  if (!sp) sp = node.addComponent(Sprite);
  sp.spriteFrame = sf;
  sp.color = Color.WHITE;
  sp.sizeMode = Sprite.SizeMode.CUSTOM;
  sp.type = sliced ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
  sp.enabled = true;
  node.getComponent(UITransform)?.setContentSize(w, h);
}

function setFill(fill: Node, thumb: Node, fillH: number, progress: number): void {
  const ut = fill.getComponent(UITransform);
  if (!ut) return;
  const travel = TRACK_W - FILL_INSET * 2;
  const t = Math.max(0, Math.min(1, progress));
  const cap = Math.ceil(fillH * 0.5) + 6;
  const w = Math.max(cap * 2, travel * t);
  ut.setAnchorPoint(0, 0.5);
  ut.setContentSize(w, fillH);
  fill.setPosition(-TRACK_W * 0.5 + FILL_INSET, 0, 0);
  thumb.setPosition(-TRACK_W * 0.5 + FILL_INSET + travel * t, 0, 0);
}

function fillDim(node: Node | null, w: number, h: number): void {
  if (!node) return;
  const sp = node.getComponent(Sprite);
  if (sp) {
    sp.spriteFrame = null;
    sp.enabled = false;
  }
  let g = node.getComponent(Graphics);
  if (!g) g = node.addComponent(Graphics);
  g.enabled = true;
  g.clear();
  g.fillColor = DIM;
  g.rect(-w * 0.5, -h * 0.5, w, h);
  g.fill();
}

function paintTip(root: Node, dim: Node, next: LoadTip | null): void {
  root.active = !!next;
  dim.active = false;
  if (!next) return;
  const plate = root.getChildByName('Plate');
  plate?.setPosition(0, -8, 0);
  if (plate) plate.active = true;
  const icon = root.getChildByName('Icon');
  const hasIcon = !!next.icon;
  if (icon) icon.active = hasIcon;
  icon?.getComponent(UITransform)?.setContentSize(TIP_ICON, TIP_ICON);
  icon?.setPosition(0, 70, 0);
  if (hasIcon) paintTipIcon(icon, next);
  const title = root.getChildByName('Title');
  title?.setPosition(0, hasIcon ? -68 : 36, 0);
  const titleLab = title?.getComponent(Label);
  if (titleLab) titleLab.string = next.title;
  const body = root.getChildByName('Body');
  body?.setPosition(0, hasIcon ? -168 : -88, 0);
  const bodyLab = body?.getComponent(Label);
  if (bodyLab) bodyLab.string = next.body;
  popTip(root);
}

function styleTipTitle(lab: Label, size: number): Label {
  lab.fontSize = size;
  lab.lineHeight = size + 8;
  lab.isBold = true;
  lab.color = TITLE_INK;
  lab.enableOutline = true;
  lab.outlineWidth = 5;
  lab.outlineColor = TITLE_OUTLINE;
  lab.horizontalAlign = Label.HorizontalAlign.CENTER;
  lab.verticalAlign = Label.VerticalAlign.CENTER;
  lab.overflow = Label.Overflow.SHRINK;
  lab.useSystemFont = true;
  lab.fontFamily = 'PingFang SC';
  return lab;
}

function styleTipBody(lab: Label, size: number): Label {
  lab.fontSize = size;
  lab.lineHeight = size + 10;
  lab.isBold = true;
  lab.color = BODY_INK;
  lab.enableOutline = false;
  lab.horizontalAlign = Label.HorizontalAlign.CENTER;
  lab.verticalAlign = Label.VerticalAlign.TOP;
  lab.overflow = Label.Overflow.RESIZE_HEIGHT;
  lab.enableWrapText = true;
  lab.useSystemFont = true;
  lab.fontFamily = 'PingFang SC';
  return lab;
}

function styleGo(lab: Label): Label {
  lab.string = '点击继续';
  lab.fontSize = 42;
  lab.lineHeight = 50;
  lab.isBold = true;
  lab.color = GO_INK;
  lab.enableOutline = true;
  lab.outlineWidth = 5;
  lab.outlineColor = GO_OUTLINE;
  lab.horizontalAlign = Label.HorizontalAlign.CENTER;
  lab.verticalAlign = Label.VerticalAlign.CENTER;
  lab.overflow = Label.Overflow.SHRINK;
  lab.useSystemFont = true;
  lab.fontFamily = 'PingFang SC';
  return lab;
}

function placeContinue(go: Node): void {
  go.getChildByName('Label')?.setPosition(0, 0, 0);
  go.getChildByName('SparkL')?.setPosition(-168, 2, 0);
  go.getChildByName('SparkR')?.setPosition(168, 2, 0);
}

function breathGo(node: Node): void {
  Tween.stopAllByTarget(node);
  const op = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
  Tween.stopAllByTarget(op);
  node.setScale(1, 1, 1);
  op.opacity = 255;
  tween(node)
    .repeatForever(
      tween()
        .to(0.9, { scale: new Vec3(1.07, 1.07, 1) }, { easing: 'sineInOut' })
        .to(0.9, { scale: new Vec3(0.96, 0.96, 1) }, { easing: 'sineInOut' }),
    )
    .start();
  tween(op)
    .repeatForever(
      tween()
        .to(0.9, { opacity: 168 }, { easing: 'sineInOut' })
        .to(0.9, { opacity: 255 }, { easing: 'sineInOut' }),
    )
    .start();
}

function popTip(node: Node): void {
  Tween.stopAllByTarget(node);
  node.setScale(0.86, 0.86, 1);
  tween(node).to(0.32, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
}

function paintTipIcon(node: Node | null, next: LoadTip): void {
  if (!node || !next.icon) return;
  if (next.icon === 'iron') {
    let g = node.getComponent(Graphics);
    if (!g) g = node.addComponent(Graphics);
    const w = 168;
    const h = 46;
    g.enabled = true;
    g.clear();
    g.fillColor = IRON_STROKE;
    g.roundRect(-w * 0.5 + 3, -h * 0.5 - 4, w, h, 10);
    g.fill();
    g.fillColor = IRON_FILL;
    g.roundRect(-w * 0.5, -h * 0.5, w, h, 10);
    g.fill();
    g.fillColor = IRON_HI;
    g.roundRect(-w * 0.5 + 14, h * 0.08, w - 28, 12, 5);
    g.fill();
    const sp = node.getComponent(Sprite);
    if (sp) {
      sp.spriteFrame = null;
      sp.enabled = false;
    }
    return;
  }
  const g = node.getComponent(Graphics);
  if (g) {
    g.clear();
    g.enabled = false;
  }
  applyArtSpriteSoon(node, next.icon, TIP_ICON, TIP_ICON);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mk(parent: Node, name: string, w: number, h: number): Node {
  const n = new Node(name);
  parent.addChild(n);
  n.layer = Layers.Enum.UI_2D;
  n.addComponent(UITransform).setContentSize(w, h);
  return n;
}
