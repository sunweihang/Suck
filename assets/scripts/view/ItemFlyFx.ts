import {
  Color,
  Graphics,
  Layers,
  Node,
  Sprite,
  SpriteFrame,
  Tween,
  UIOpacity,
  UITransform,
  Vec3,
  tween,
} from 'cc';
import { gameAudio } from '../audio/AudioService';
import type { ItemId } from '../game/LevelCatalog';
import { ensureCoinFxRoot, worldToFxLocal } from './CoinFlyFx';
import { artFrame } from './UiArt';

const FLYER_NAME = 'FlyItem';
const START_SIZE = 240;
const HOLD = 0.4;
const FLY_SEC = 0.7;
const ARC = 80;
const STAGGER = 0.14;
const END_SCALE = 168 / START_SIZE;

const ITEM_ART = {
  shuffle: 'icShuffle',
  hook: 'icHook',
  shovel: 'icShovel',
  bomb: 'icBomb',
} as const;

const _tmp = new Vec3();
const SCALE_IN = new Vec3(0.72, 0.72, 1);
const SCALE_HOLD = new Vec3(1.08, 1.08, 1);
const SCALE_END = new Vec3(END_SCALE, END_SCALE, 1);
const ITEM_FALLBACK = new Color(255, 214, 96, 240);
const _pool: Node[] = [];

export function clearItemFlyers(fxRoot: Node | null): void {
  if (!fxRoot?.isValid) return;
  const kids = fxRoot.children;
  for (let i = kids.length - 1; i >= 0; i--) {
    const child = kids[i];
    if (child.name !== FLYER_NAME) continue;
    recycleItemFlyer(child);
  }
}

function takeItemFlyer(fxRoot: Node): Node {
  for (let i = 0; i < _pool.length; i++) {
    const n = _pool[i];
    if (!n.isValid || n.active) continue;
    Tween.stopAllByTarget(n);
    if (n.parent !== fxRoot) fxRoot.addChild(n);
    n.active = true;
    return n;
  }
  const n = new Node(FLYER_NAME);
  n.layer = Layers.Enum.UI_2D;
  fxRoot.addChild(n);
  n.addComponent(UITransform).setContentSize(START_SIZE, START_SIZE);
  n.addComponent(Sprite).sizeMode = Sprite.SizeMode.CUSTOM;
  n.addComponent(Graphics);
  n.addComponent(UIOpacity).opacity = 255;
  _pool.push(n);
  return n;
}

function recycleItemFlyer(n: Node): void {
  Tween.stopAllByTarget(n);
  if (n.isValid) n.active = false;
}

export function playItemGrantFly(opts: {
  canvas: Node;
  ids: readonly ItemId[];
  slotWorldPos: (id: ItemId, out: Vec3) => boolean;
  startWorld?: Vec3;
  onLand?: (id: ItemId) => void;
  onDone?: () => void;
}): void {
  const ids = opts.ids;
  const canvas = opts.canvas;
  if (!canvas?.isValid || ids.length <= 0) {
    opts.onDone?.();
    return;
  }
  const fx = ensureCoinFxRoot(canvas);
  fx.setSiblingIndex(canvas.children.length - 1);
  gameAudio()?.playGetNew();
  let left = 0;
  for (let i = 0; i < ids.length; i++) {
    if (ids[i]) left += 1;
  }
  if (left <= 0) {
    opts.onDone?.();
    return;
  }
  const start = new Vec3();
  if (opts.startWorld) worldToFxLocal(fx, opts.startWorld, start);
  const oneLanded = (id: ItemId): void => {
    opts.onLand?.(id);
    left -= 1;
    if (left <= 0) opts.onDone?.();
  };
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!id) continue;
    if (!opts.slotWorldPos(id, _tmp)) {
      oneLanded(id);
      continue;
    }
    worldToFxLocal(fx, _tmp, _tmp);
    spawnItemFlyer(fx, start.x, start.y, _tmp.x, _tmp.y, artFrame(ITEM_ART[id]), i * STAGGER, () => oneLanded(id));
  }
}

function spawnItemFlyer(
  fxRoot: Node,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  frame: SpriteFrame | null,
  delay: number,
  onLand: () => void,
): void {
  const n = takeItemFlyer(fxRoot);
  n.setSiblingIndex(fxRoot.children.length - 1);
  n.setPosition(sx, sy, 0);
  n.setScale(SCALE_IN);
  const op = n.getComponent(UIOpacity);
  if (op) op.opacity = 255;
  const sp = n.getComponent(Sprite);
  const g = n.getComponent(Graphics);
  if (frame && sp) {
    sp.enabled = true;
    sp.spriteFrame = frame;
    sp.color = Color.WHITE;
    if (g) {
      g.clear();
      g.enabled = false;
    }
  } else {
    if (sp) {
      sp.spriteFrame = null;
      sp.enabled = false;
    }
    if (g) {
      g.enabled = true;
      g.clear();
      const half = START_SIZE * 0.5;
      g.fillColor = ITEM_FALLBACK;
      g.roundRect(-half, -half, START_SIZE, START_SIZE, 36);
      g.fill();
    }
  }
  tween(n)
    .delay(delay)
    .to(HOLD, { scale: SCALE_HOLD }, { easing: 'sineOut' })
    .to(FLY_SEC, { scale: SCALE_END }, {
      easing: 'cubicInOut',
      onUpdate: (_t, ratio) => {
        if (!n.isValid) return;
        const r = ratio ?? 0;
        n.setPosition(
          sx + (ex - sx) * r,
          sy + (ey - sy) * r + Math.sin(r * Math.PI) * ARC * (1 - r),
          0,
        );
      },
    })
    .call(() => {
      recycleItemFlyer(n);
      onLand();
    })
    .start();
}
