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

const FLYER_NAME = 'FlyCoin';
const COIN_SIZE = 56;
const MAX_FLYERS = 8;
const STAGGER = 0.05;
const POP = 0.1;
const HOLD = 0.04;
const FLY_SEC = 0.42;
const ARC = 90;
const JITTER = 36;

const _tmp = new Vec3();
const SCALE_IN = new Vec3(0.2, 0.2, 1);
const SCALE_POP = new Vec3(1.15, 1.15, 1);
const SCALE_FLY = new Vec3(0.75, 0.75, 1);
const COIN_FALLBACK = new Color(255, 196, 44, 255);
const _pool: Node[] = [];

export function ensureCoinFxRoot(canvas: Node): Node {
  let fx = canvas.getChildByName('CoinFx');
  if (!fx?.isValid) {
    fx = new Node('CoinFx');
    fx.layer = Layers.Enum.UI_2D;
    canvas.addChild(fx);
    fx.addComponent(UITransform).setContentSize(0, 0);
  }
  fx.setSiblingIndex(canvas.children.length - 1);
  return fx;
}

export function worldToFxLocal(fxRoot: Node, world: Vec3, out: Vec3): Vec3 {
  const src = world === out ? _tmp.set(world) : world;
  const ut = fxRoot.getComponent(UITransform);
  if (ut) {
    ut.convertToNodeSpaceAR(src, out);
    return out;
  }
  fxRoot.inverseTransformPoint(out, src);
  return out;
}

export function clearCoinFlyers(fxRoot: Node | null): void {
  if (!fxRoot?.isValid) return;
  const kids = fxRoot.children;
  for (let i = kids.length - 1; i >= 0; i--) {
    const child = kids[i];
    if (child.name !== FLYER_NAME) continue;
    recycleFlyer(child);
  }
}

function takeFlyer(fxRoot: Node): Node {
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
  n.addComponent(UITransform).setContentSize(COIN_SIZE, COIN_SIZE);
  n.addComponent(Sprite).sizeMode = Sprite.SizeMode.CUSTOM;
  n.addComponent(Graphics);
  n.addComponent(UIOpacity).opacity = 255;
  _pool.push(n);
  return n;
}

function recycleFlyer(n: Node): void {
  Tween.stopAllByTarget(n);
  if (n.isValid) n.active = false;
}

function splitCredits(total: number, n: number, out: number[]): number[] {
  const count = Math.max(1, Math.floor(n));
  const sum = Math.max(0, Math.floor(total));
  const base = (sum / count) | 0;
  let rem = sum - base * count;
  out.length = 0;
  for (let i = 0; i < count; i++) {
    out.push(base + (rem > 0 ? 1 : 0));
    if (rem > 0) rem -= 1;
  }
  return out;
}

const _credits: number[] = [];

export function playCoinFlyBurst(opts: {
  fxRoot: Node;
  start: Vec3;
  end: Vec3;
  amount: number;
  frame: SpriteFrame | null;
  onCredit: (n: number) => void;
  onDone?: () => void;
}): void {
  const fx = opts.fxRoot;
  const amount = Math.max(0, Math.floor(opts.amount));
  if (!fx?.isValid || amount <= 0) {
    opts.onDone?.();
    return;
  }
  const flyerCount = Math.min(MAX_FLYERS, Math.max(1, amount));
  const credits = splitCredits(amount, flyerCount, _credits);
  let left = flyerCount;
  for (let i = 0; i < flyerCount; i++) {
    const sx = opts.start.x + (Math.random() - 0.5) * JITTER;
    const sy = opts.start.y + (Math.random() - 0.5) * JITTER;
    const ex = opts.end.x;
    const ey = opts.end.y;
    const credit = credits[i];
    const playSfx = i === 0;
    spawnFlyer(fx, sx, sy, ex, ey, credit, i * STAGGER, opts.frame, playSfx, opts.onCredit, () => {
      left -= 1;
      if (left <= 0) opts.onDone?.();
    });
  }
}

function spawnFlyer(
  fxRoot: Node,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  credit: number,
  delay: number,
  frame: SpriteFrame | null,
  playSfx: boolean,
  onCredit: (n: number) => void,
  onLand: () => void,
): void {
  const n = takeFlyer(fxRoot);
  n.setPosition(sx, sy, 0);
  n.setScale(SCALE_IN);
  const op = n.getComponent(UIOpacity);
  if (op) op.opacity = 255;
  const sp = n.getComponent(Sprite);
  const g = n.getComponent(Graphics);
  if (frame && sp) {
    sp.enabled = true;
    sp.spriteFrame = frame;
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
      g.fillColor = COIN_FALLBACK;
      g.circle(0, 0, COIN_SIZE * 0.5);
      g.fill();
    }
  }
  tween(n)
    .delay(delay)
    .to(POP, { scale: SCALE_POP }, { easing: 'backOut' })
    .delay(HOLD)
    .to(FLY_SEC, { scale: SCALE_FLY }, {
      easing: 'sineIn',
      onUpdate: (_t, ratio) => {
        if (!n.isValid) return;
        const r = ratio ?? 0;
        n.setPosition(
          sx + (ex - sx) * r,
          sy + (ey - sy) * r + Math.sin(r * Math.PI) * ARC,
          0,
        );
      },
    })
    .call(() => {
      if (playSfx) gameAudio()?.playGold();
      if (credit > 0) onCredit(credit);
      recycleFlyer(n);
      onLand();
    })
    .start();
}
