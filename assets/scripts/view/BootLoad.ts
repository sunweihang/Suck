import {
  AssetManager,
  BlockInputEvents,
  Color,
  Layers,
  Node,
  Sprite,
  SpriteFrame,
  UITransform,
  Widget,
} from 'cc';
import { openResourcesBundle } from '../boot/LoadBundles';
import { coverBackgroundSize, portraitVisibleSize } from '../game/PortraitFit';

export type BootLoad = {
  set: (progress: number, tip?: string) => void;
  raise: () => void;
  show: () => void;
  finish: () => Promise<void>;
  hide: () => void;
};

const TRACK_W = 560;
const THUMB = 48;
const FILL_INSET = 8;

type BootArt = {
  home: SpriteFrame;
  track: SpriteFrame;
  fill: SpriteFrame;
  knob: SpriteFrame;
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

  const relayout = (): void => {
    const vis = portraitVisibleSize();
    const cover = coverBackgroundSize(vis.width, vis.height);
    root.getComponent(UITransform)?.setContentSize(vis.width, vis.height);
    root.getComponent(Widget)?.updateAlignment();
    paint(bg, art.home, cover.w, cover.h, false);
  };

  return {
    set(progress: number) {
      aim(progress);
    },
    raise,
    show() {
      if (!root.isValid) return;
      if (tick) clearTimeout(tick);
      tick = 0;
      shown = 0.08;
      goal = 0.08;
      paintBar(0.08);
      relayout();
      root.active = true;
      raise();
    },
    async finish() {
      aim(1);
      while (root.isValid && root.active && shown < 0.999) await wait(16);
      if (root.isValid) paintBar(1);
      await wait(180);
    },
    hide() {
      if (tick) clearTimeout(tick);
      tick = 0;
      if (root.isValid) root.active = false;
    },
  };
}

async function loadBootArt(): Promise<BootArt> {
  const bundle = await openResourcesBundle();
  const [home, track, fill, knob] = await Promise.all([
    loadSprite(bundle, 'ui/bg-home/spriteFrame'),
    loadSprite(bundle, 'ui/load-track/spriteFrame'),
    loadSprite(bundle, 'ui/load-fill/spriteFrame'),
    loadSprite(bundle, 'ui/load-knob/spriteFrame'),
  ]);
  return { home, track, fill, knob };
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
