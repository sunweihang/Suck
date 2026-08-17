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

const ITEM_ART = {
  shuffle: 'icShuffle',
  merge: 'icMerge',
  hook: 'icHook',
  shovel: 'icShovel',
} as const;

const _tmp = new Vec3();

export function clearItemFlyers(fxRoot: Node | null): void {
  if (!fxRoot?.isValid) return;
  for (const child of [...fxRoot.children]) {
    if (child.name !== FLYER_NAME) continue;
    Tween.stopAllByTarget(child);
    child.destroy();
  }
}

export function playItemGrantFly(opts: {
  canvas: Node;
  ids: readonly ItemId[];
  slotWorldPos: (id: ItemId, out: Vec3) => boolean;
  onLand?: (id: ItemId) => void;
  onDone?: () => void;
}): void {
  const ids = opts.ids.filter(Boolean);
  const canvas = opts.canvas;
  if (!canvas?.isValid || ids.length <= 0) {
    opts.onDone?.();
    return;
  }
  const fx = ensureCoinFxRoot(canvas);
  fx.setSiblingIndex(canvas.children.length - 1);
  gameAudio()?.playGetNew();
  const start = new Vec3(0, 0, 0);
  let left = ids.length;
  const oneLanded = (id: ItemId): void => {
    opts.onLand?.(id);
    left -= 1;
    if (left <= 0) opts.onDone?.();
  };
  ids.forEach((id, i) => {
    if (!opts.slotWorldPos(id, _tmp)) {
      oneLanded(id);
      return;
    }
    const end = new Vec3();
    worldToFxLocal(fx, _tmp, end);
    spawnItemFlyer(fx, start.clone(), end, artFrame(ITEM_ART[id]), i * STAGGER, () => oneLanded(id));
  });
}

function spawnItemFlyer(
  fxRoot: Node,
  start: Vec3,
  end: Vec3,
  frame: SpriteFrame | null,
  delay: number,
  onLand: () => void,
): void {
  const n = new Node(FLYER_NAME);
  n.layer = Layers.Enum.UI_2D;
  fxRoot.addChild(n);
  n.setSiblingIndex(fxRoot.children.length - 1);
  n.addComponent(UITransform).setContentSize(START_SIZE, START_SIZE);
  n.setPosition(start);
  n.setScale(0.72, 0.72, 1);
  if (frame) {
    const sp = n.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.spriteFrame = frame;
    sp.color = Color.WHITE;
  } else {
    const g = n.addComponent(Graphics);
    const half = START_SIZE * 0.5;
    g.fillColor = new Color(255, 214, 96, 240);
    g.roundRect(-half, -half, START_SIZE, START_SIZE, 36);
    g.fill();
  }
  n.addComponent(UIOpacity).opacity = 255;
  const endScale = 168 / START_SIZE;
  tween(n)
    .delay(delay)
    .to(HOLD, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'sineOut' })
    .to(FLY_SEC, { scale: new Vec3(endScale, endScale, 1) }, {
      easing: 'cubicInOut',
      onUpdate: (_t, ratio) => {
        if (!n.isValid) return;
        const r = ratio ?? 0;
        n.setPosition(
          start.x + (end.x - start.x) * r,
          start.y + (end.y - start.y) * r + Math.sin(r * Math.PI) * ARC * (1 - r),
          0,
        );
      },
    })
    .call(() => {
      if (n.isValid) n.destroy();
      onLand();
    })
    .start();
}
