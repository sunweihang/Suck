import {
  Color,
  Graphics,
  ImageAsset,
  Label,
  Layers,
  Node,
  Sprite,
  SpriteFrame,
  Texture2D,
  UITransform,
  resources,
} from 'cc';
import { levelBadgeText } from '../game/LevelCatalog';
import { paintLevelBadge, styleLevelBadge } from './QChrome';

const KEYS = [
  'bg',
  'home',
  'play',
  'board',
  'chip',
  'badge',
  'prefix',
  ...Array.from({ length: 10 }, (_, i) => `d${i}`),
  ...Array.from({ length: 10 }, (_, i) => `lv${i}`),
] as const;
type ArtKey = (typeof KEYS)[number];

function pathOf(key: ArtKey): string {
  if (key === 'bg') return 'ui/bg-play-q/spriteFrame';
  if (key === 'home') return 'ui/bg-home/spriteFrame';
  if (key === 'play') return 'ui/btn-play/spriteFrame';
  if (key === 'board') return 'ui/board-score-q/spriteFrame';
  if (key === 'chip') return 'ui/chip-q/spriteFrame';
  if (key === 'badge') return 'ui/level-badge/spriteFrame';
  if (key === 'prefix') return 'ui/lv-prefix/spriteFrame';
  if (key.startsWith('lv')) return `ui/lv-${key.slice(2)}/spriteFrame`;
  return `ui/digit-${key.slice(1)}/spriteFrame`;
}

const frames = new Map<string, SpriteFrame>();
let boot: Promise<void> | null = null;

function frameFromImage(img: ImageAsset): SpriteFrame {
  const tex = new Texture2D();
  tex.image = img;
  const sf = new SpriteFrame();
  sf.texture = tex;
  return sf;
}

function loadKey(key: ArtKey, done: () => void): void {
  resources.load(pathOf(key), SpriteFrame, (err, sf) => {
    if (!err && sf?.texture) {
      frames.set(key, sf);
      done();
      return;
    }
    if (key !== 'bg' && key !== 'home' && key !== 'play') {
      done();
      return;
    }
    const imgPath = key === 'home' ? 'ui/bg-home' : key === 'play' ? 'ui/btn-play' : 'ui/bg-play-q';
    resources.load(imgPath, ImageAsset, (e2, img) => {
      if (!e2 && img) frames.set(key, frameFromImage(img));
      done();
    });
  });
}

export function preloadUiArt(): Promise<void> {
  if (boot) return boot;
  boot = new Promise((resolve) => {
    let left = KEYS.length;
    const done = (): void => {
      left -= 1;
      if (left <= 0) resolve();
    };
    for (const key of KEYS) loadKey(key, done);
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

export function layoutLevelBadge(
  board: Node | null,
  level: number,
  w: number,
  h: number,
  glyphH: number,
): void {
  if (!board) return;
  board.getComponent(UITransform)?.setContentSize(w, h);
  applyLevelBadge(board.getChildByName('Board'), w, h);
  const cover = board.getChildByName('Cover');
  if (cover) cover.active = false;
  const title = board.getChildByName('Title');
  if (title) {
    title.active = true;
    title.setPosition(0, 2, 0);
    title.getComponent(UITransform)?.setContentSize(Math.round(w * 0.88), Math.round(h * 0.78));
  }
  paintLevelTitle(title, level, glyphH);
}

export function applyLevelBadge(node: Node | null, w: number, h: number): boolean {
  if (!node) return false;
  node.getComponent(UITransform)?.setContentSize(w, h);
  const painted = applyArtSprite(node, 'badge', w, h);
  const g = node.getComponent(Graphics);
  if (painted) {
    if (g) {
      g.clear();
      g.enabled = false;
    }
    return true;
  }
  if (!g) node.addComponent(Graphics);
  const gfx = node.getComponent(Graphics);
  if (gfx) {
    gfx.enabled = true;
    paintLevelBadge(gfx, w, h);
  }
  return false;
}

function glyphNode(root: Node, i: number, w: number, h: number): Node {
  const name = `G_${i}`;
  let n = root.getChildByName(name);
  if (!n) {
    n = new Node(name);
    root.addChild(n);
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform);
  }
  n.active = true;
  n.getComponent(UITransform)?.setContentSize(w, h);
  return n;
}

export function paintLevelTitle(root: Node | null, level: number, glyphH: number): void {
  if (!root) return;
  const fallback = root.getChildByName('Fallback');
  if (fallback) fallback.active = false;
  const digits = String(Math.max(0, level | 0)).padStart(2, '0');
  const prefixSf = frames.get('prefix');
  const digitSfs = [...digits].map((ch) => frames.get(`lv${ch}`));
  const ready = !!prefixSf && digitSfs.every(Boolean);
  if (!ready) {
    for (let i = 0; i < 8; i++) {
      const n = root.getChildByName(`G_${i}`);
      if (n) n.active = false;
    }
    let labN = root.getChildByName('Fallback');
    if (!labN) {
      labN = new Node('Fallback');
      root.addChild(labN);
      labN.layer = Layers.Enum.UI_2D;
      labN.addComponent(UITransform);
      labN.addComponent(Label);
    }
    labN.active = true;
    const ut = root.getComponent(UITransform);
    labN.getComponent(UITransform)?.setContentSize(ut?.contentSize.width ?? 160, glyphH);
    const lab = labN.getComponent(Label);
    if (lab) {
      lab.string = levelBadgeText(level);
      styleLevelBadge(lab, Math.max(36, glyphH));
    }
    return;
  }

  const prefixH = glyphH * 1.12;
  const prefixRatio = (prefixSf.originalSize.width || 440) / Math.max(1, prefixSf.originalSize.height || 208);
  const prefixW = prefixH * prefixRatio;
  const digitW = glyphH * 0.78;
  const gap = glyphH * 0.06;
  const wordGap = glyphH * 0.14;
  const total = prefixW + wordGap + digits.length * digitW + (digits.length - 1) * gap;
  let x = -total * 0.5 + prefixW * 0.5;
  const prefix = glyphNode(root, 0, prefixW, prefixH);
  prefix.setPosition(x, 1, 0);
  applyArtSprite(prefix, 'prefix', prefixW, prefixH);
  x += prefixW * 0.5 + wordGap + digitW * 0.5;
  for (let i = 0; i < digits.length; i++) {
    const n = glyphNode(root, i + 1, digitW, glyphH);
    n.setPosition(x, 0, 0);
    applyArtSprite(n, `lv${digits[i]}` as ArtKey, digitW, glyphH);
    x += digitW + gap;
  }
  for (let i = digits.length + 1; i < 8; i++) {
    const n = root.getChildByName(`G_${i}`);
    if (n) n.active = false;
  }
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
