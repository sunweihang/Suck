import {
  Camera,
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
  view,
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
const _screen = new Vec3();
const _uiLocal = new Vec3();
const SCALE_IN = new Vec3(0.72, 0.72, 1);
const SCALE_HOLD = new Vec3(1.08, 1.08, 1);
const SCALE_END = new Vec3(END_SCALE, END_SCALE, 1);
const USE_START = 168 / START_SIZE;
const USE_FLY_SEC = 0.4;
const USE_ARC = 110;
const USE_CENTER_Y = 200;
const SCALE_USE_START = new Vec3(USE_START, USE_START, 1);
const SCALE_USE_MID = new Vec3(1.02, 1.02, 1);
const ITEM_FALLBACK = new Color(255, 214, 96, 240);
const RING_SHUFFLE = new Color(120, 210, 255, 220);
const RING_BOMB = new Color(255, 120, 64, 230);
const RING_HOOK = new Color(255, 214, 96, 220);
const RING_SHOVEL = new Color(255, 186, 74, 220);
const _pool: Node[] = [];
const _useEnd = new Vec3();

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
  if (!n.isValid) return;
  n.angle = 0;
  n.setScale(1, 1, 1);
  n.getComponent(UITransform)?.setAnchorPoint(0.5, 0.5);
  n.active = false;
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

export function playItemUseFly(opts: {
  canvas: Node;
  id: ItemId;
  startWorld: Vec3;
  endWorld?: Vec3 | null;
  worldCam?: Camera | null;
  onArrive?: () => void;
  onDone?: () => void;
}): void {
  const canvas = opts.canvas;
  if (!canvas?.isValid) {
    opts.onArrive?.();
    opts.onDone?.();
    return;
  }
  const fx = ensureCoinFxRoot(canvas);
  fx.setSiblingIndex(canvas.children.length - 1);
  worldToFxLocal(fx, opts.startWorld, _tmp);
  const sx = _tmp.x;
  const sy = _tmp.y;
  if (!opts.endWorld || !opts.worldCam || !world3dToFxLocal(opts.worldCam, fx, opts.endWorld, _useEnd)) {
    _useEnd.set(0, USE_CENTER_Y, 0);
  }
  spawnItemUseFlyer(fx, opts.id, sx, sy, _useEnd.x, _useEnd.y, () => {
    opts.onArrive?.();
  }, () => {
    opts.onDone?.();
  });
}

/**
 * 3D world → CoinFx local. `Camera.convertToUINode` assumes a bottom-left UI
 * origin; this canvas is centered (`alignCanvasWithScreen = false`), so that
 * API lands a half-screen off to the side.
 */
function world3dToFxLocal(cam: Camera, fxRoot: Node, world: Vec3, out: Vec3): boolean {
  try {
    cam.worldToScreen(world, _screen);
  } catch {
    return false;
  }
  if (!Number.isFinite(_screen.x) || !Number.isFinite(_screen.y)) return false;
  const vp = view.getViewportRect();
  const vw = Math.max(1, vp.width);
  const vh = Math.max(1, vp.height);
  const canvas = fxRoot.parent;
  const cut = canvas?.getComponent(UITransform);
  const visW = cut && cut.width > 1 ? cut.width : view.getVisibleSize().width;
  const visH = cut && cut.height > 1 ? cut.height : view.getVisibleSize().height;
  _uiLocal.set(
    ((_screen.x - vp.x) / vw - 0.5) * visW,
    ((_screen.y - vp.y) / vh - 0.5) * visH,
    0,
  );
  if (cut) cut.convertToWorldSpaceAR(_uiLocal, _uiLocal);
  worldToFxLocal(fxRoot, _uiLocal, out);
  return Number.isFinite(out.x) && Number.isFinite(out.y);
}

function dressFlyer(n: Node, frame: SpriteFrame | null): void {
  const op = n.getComponent(UIOpacity);
  if (op) op.opacity = 255;
  n.angle = 0;
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
  dressFlyer(n, frame);
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

function ringColor(id: ItemId): Color {
  if (id === 'bomb') return RING_BOMB;
  if (id === 'hook') return RING_HOOK;
  if (id === 'shovel') return RING_SHOVEL;
  return RING_SHUFFLE;
}

function paintUseRing(n: Node, id: ItemId, radius: number): void {
  const g = n.getComponent(Graphics);
  if (!g) return;
  g.enabled = true;
  g.clear();
  g.strokeColor = ringColor(id);
  g.lineWidth = 14;
  g.circle(0, 0, radius);
  g.stroke();
}

function spawnItemUseFlyer(
  fxRoot: Node,
  id: ItemId,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  onArrive: () => void,
  onDone: () => void,
): void {
  const n = takeItemFlyer(fxRoot);
  n.setSiblingIndex(fxRoot.children.length - 1);
  n.setPosition(sx, sy, 0);
  n.setScale(SCALE_USE_START);
  n.angle = 0;
  dressFlyer(n, artFrame(ITEM_ART[id]));
  n.getComponent(UITransform)?.setAnchorPoint(
    id === 'shovel' ? 0.22 : 0.5,
    id === 'hook' || id === 'shovel' ? 0.1 : 0.5,
  );
  let arrived = false;
  const arrive = (): void => {
    if (arrived) return;
    arrived = true;
    onArrive();
  };
  const finish = (): void => {
    arrive();
    recycleItemFlyer(n);
    onDone();
  };
  const keepSize = id === 'hook' || id === 'shovel';
  const fly = tween(n)
    .to(USE_FLY_SEC, { scale: keepSize ? SCALE_USE_START : SCALE_USE_MID }, {
      easing: 'cubicOut',
      onUpdate: (_t, ratio) => {
        if (!n.isValid) return;
        const r = ratio ?? 0;
        n.setPosition(
          sx + (ex - sx) * r,
          sy + (ey - sy) * r + Math.sin(r * Math.PI) * USE_ARC,
          0,
        );
      },
    })
    .call(() => {
      if (!n.isValid) {
        finish();
        return;
      }
      useImpactTween(n, id, ex, ey, arrive).call(finish).start();
    });
  fly.start();
}

function useImpactTween(n: Node, id: ItemId, x: number, y: number, onArrive: () => void): Tween<Node> {
  paintUseRing(n, id, 96);
  if (id === 'shuffle') {
    return tween(n)
      .to(0.2, { scale: new Vec3(1.28, 1.28, 1) }, {
        easing: 'sineOut',
        onUpdate: (_t, ratio) => {
          if (!n.isValid) return;
          n.angle = (ratio ?? 0) * 360;
        },
      })
      .call(() => {
        paintUseRing(n, id, 132);
        onArrive();
      })
      .to(0.16, { scale: new Vec3(1.55, 1.55, 1) }, {
        easing: 'quadOut',
        onUpdate: (_t, ratio) => fadeFlyer(n, 1 - (ratio ?? 0)),
      });
  }
  if (id === 'bomb') {
    return tween(n)
      .to(0.12, { scale: new Vec3(1.22, 1.22, 1) }, { easing: 'backOut' })
      .call(() => {
        paintUseRing(n, id, 148);
        onArrive();
      })
      .to(0.2, { scale: new Vec3(1.85, 1.85, 1) }, {
        easing: 'quadOut',
        onUpdate: (_t, ratio) => fadeFlyer(n, 1 - (ratio ?? 0)),
      });
  }
  if (id === 'hook') {
    const s = USE_START;
    n.setPosition(x, y, 0);
    return tween(n)
      .to(0.1, { scale: new Vec3(s * 1.16, s * 1.16, 1), angle: 6 }, { easing: 'sineOut' })
      .to(0.12, { angle: -10, scale: new Vec3(s * 1.08, s * 1.22, 1) }, { easing: 'quadIn' })
      .call(onArrive)
      .to(0.14, { scale: new Vec3(s * 0.45, s * 0.45, 1), angle: -4 }, {
        easing: 'quadIn',
        onUpdate: (_t, ratio) => fadeFlyer(n, 1 - (ratio ?? 0)),
      });
  }
  if (id === 'shovel') {
    const s = USE_START;
    n.setPosition(x, y, 0);
    return tween(n)
      .to(0.08, { angle: -28, scale: new Vec3(s * 1.12, s * 1.12, 1) }, { easing: 'sineOut' })
      .to(0.12, { angle: 18, scale: new Vec3(s * 1.06, s * 1.2, 1) }, { easing: 'quadIn' })
      .call(onArrive)
      .to(0.14, { scale: new Vec3(s * 0.42, s * 0.42, 1), angle: 6 }, {
        easing: 'quadIn',
        onUpdate: (_t, ratio) => fadeFlyer(n, 1 - (ratio ?? 0)),
      });
  }
  return tween(n)
    .to(0.08, { angle: -42, position: new Vec3(x, y + 22, 0), scale: new Vec3(1.12, 1.12, 1) }, { easing: 'sineOut' })
    .to(0.12, { angle: 16, position: new Vec3(x, y - 30, 0), scale: new Vec3(1.05, 1.2, 1) }, { easing: 'quadIn' })
    .call(onArrive)
    .to(0.14, { scale: new Vec3(0.3, 0.3, 1), angle: 8 }, {
      easing: 'quadIn',
      onUpdate: (_t, ratio) => fadeFlyer(n, 1 - (ratio ?? 0)),
    });
}

function fadeFlyer(n: Node, alpha: number): void {
  if (!n.isValid) return;
  const op = n.getComponent(UIOpacity);
  if (op) op.opacity = Math.round(255 * Math.max(0, Math.min(1, alpha)));
}
