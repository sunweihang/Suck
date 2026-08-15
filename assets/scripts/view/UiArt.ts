import {
  Color,
  Layers,
  Node,
  Sprite,
  SpriteFrame,
  UITransform,
  resources,
} from 'cc';

const KEYS = ['bg', 'board', 'chip', ...Array.from({ length: 10 }, (_, i) => `d${i}`)] as const;
type ArtKey = (typeof KEYS)[number];

function pathOf(key: ArtKey): string {
  if (key === 'bg') return 'ui/bg-play-q/spriteFrame';
  if (key === 'board') return 'ui/board-score-q/spriteFrame';
  if (key === 'chip') return 'ui/chip-q/spriteFrame';
  return `ui/digit-${key.slice(1)}/spriteFrame`;
}

const frames = new Map<string, SpriteFrame>();
let boot: Promise<void> | null = null;

export function preloadUiArt(): Promise<void> {
  if (boot) return boot;
  boot = new Promise((resolve) => {
    let left = KEYS.length;
    const done = (): void => {
      left -= 1;
      if (left <= 0) resolve();
    };
    for (const key of KEYS) {
      resources.load(pathOf(key), SpriteFrame, (err, sf) => {
        if (!err && sf) frames.set(key, sf);
        done();
      });
    }
  });
  return boot;
}

export function artFrame(key: ArtKey | `d${number}`): SpriteFrame | null {
  return frames.get(key) ?? null;
}

export function applyArtSprite(node: Node | null, key: ArtKey, w: number, h: number): boolean {
  if (!node) return false;
  const sf = frames.get(key);
  if (!sf) return false;
  let sp = node.getComponent(Sprite);
  if (!sp) sp = node.addComponent(Sprite);
  sp.spriteFrame = sf;
  sp.sizeMode = Sprite.SizeMode.CUSTOM;
  sp.type = Sprite.Type.SIMPLE;
  sp.color = Color.WHITE;
  node.getComponent(UITransform)?.setContentSize(w, h);
  return true;
}

export function paintQNumber(root: Node | null, value: number, digitH: number): void {
  if (!root) return;
  const text = String(Math.max(0, value | 0));
  const gap = digitH * 0.78;
  const start = -((text.length - 1) * gap) / 2;
  for (let i = 0; i < 4; i++) {
    const name = `Digit_${i}`;
    let n = root.getChildByName(name);
    if (i >= text.length) {
      if (n) n.active = false;
      continue;
    }
    if (!n) {
      n = new Node(name);
      root.addChild(n);
      n.layer = Layers.Enum.UI_2D;
      n.addComponent(UITransform).setContentSize(digitH, digitH);
    }
    n.active = true;
    n.setPosition(start + i * gap, 0, 0);
    applyArtSprite(n, `d${text[i]}` as ArtKey, digitH, digitH);
  }
}
