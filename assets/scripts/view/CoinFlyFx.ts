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
  for (const child of [...fxRoot.children]) {
    if (child.name !== FLYER_NAME) continue;
    Tween.stopAllByTarget(child);
    child.destroy();
  }
}

function splitCredits(total: number, n: number): number[] {
  const count = Math.max(1, Math.floor(n));
  const sum = Math.max(0, Math.floor(total));
  const base = Math.floor(sum / count);
  let rem = sum - base * count;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(base + (rem > 0 ? 1 : 0));
    if (rem > 0) rem -= 1;
  }
  return out;
}

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
  const credits = splitCredits(amount, flyerCount);
  let left = flyerCount;
  const oneLanded = (): void => {
    left -= 1;
    if (left <= 0) opts.onDone?.();
  };
  for (let i = 0; i < flyerCount; i++) {
    const start = new Vec3(
      opts.start.x + (Math.random() - 0.5) * JITTER,
      opts.start.y + (Math.random() - 0.5) * JITTER,
      0,
    );
    spawnFlyer(fx, start, opts.end.clone(), credits[i], i * STAGGER, opts.frame, i === 0, opts.onCredit, oneLanded);
  }
}

function spawnFlyer(
  fxRoot: Node,
  start: Vec3,
  end: Vec3,
  credit: number,
  delay: number,
  frame: SpriteFrame | null,
  playSfx: boolean,
  onCredit: (n: number) => void,
  onLand: () => void,
): void {
  const n = new Node(FLYER_NAME);
  n.layer = Layers.Enum.UI_2D;
  fxRoot.addChild(n);
  n.addComponent(UITransform).setContentSize(COIN_SIZE, COIN_SIZE);
  n.setPosition(start);
  n.setScale(0.2, 0.2, 1);
  if (frame) {
    const sp = n.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.spriteFrame = frame;
  } else {
    const g = n.addComponent(Graphics);
    g.fillColor = new Color(255, 196, 44, 255);
    g.circle(0, 0, COIN_SIZE * 0.5);
    g.fill();
  }
  n.addComponent(UIOpacity).opacity = 255;
  tween(n)
    .delay(delay)
    .to(POP, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'backOut' })
    .delay(HOLD)
    .to(FLY_SEC, { scale: new Vec3(0.75, 0.75, 1) }, {
      easing: 'sineIn',
      onUpdate: (_t, ratio) => {
        if (!n.isValid) return;
        const r = ratio ?? 0;
        n.setPosition(
          start.x + (end.x - start.x) * r,
          start.y + (end.y - start.y) * r + Math.sin(r * Math.PI) * ARC,
          0,
        );
      },
    })
    .call(() => {
      if (playSfx) gameAudio()?.playGold();
      if (credit > 0) onCredit(credit);
      if (n.isValid) n.destroy();
      onLand();
    })
    .start();
}
