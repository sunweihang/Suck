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
  'homeBadge',
  'prefix',
  'settingsBg',
  'settingsGear',
  'settingsClose',
  'shareBtn',
  'clubBtn',
  'settingsCard',
  'settingsDim',
  'icMusic',
  'icSfx',
  'volumeTrack',
  'volumeFill',
  'sliderThumb',
  ...Array.from({ length: 10 }, (_, i) => `d${i}`),
  ...Array.from({ length: 10 }, (_, i) => `lv${i}`),
  ...Array.from({ length: 10 }, (_, i) => `lvh${i}`),
] as const;
type ArtKey = (typeof KEYS)[number];

function imagePathOf(key: ArtKey): string | null {
  if (key === 'bg') return 'ui/bg-play-q';
  if (key === 'home') return 'ui/bg-home';
  if (key === 'play') return 'ui/btn-play';
  if (key === 'settingsBg') return 'ui/btn-settings-bg';
  if (key === 'settingsGear') return 'ui/ic-gear';
  if (key === 'settingsClose') return 'ui/btn-close';
  if (key === 'shareBtn') return 'ui/btn-clear-next';
  if (key === 'clubBtn') return 'ui/btn-clear-reward';
  if (key === 'settingsCard') return 'ui/panel-clear';
  if (key === 'settingsDim') return 'ui/dim-clear';
  if (key === 'icMusic') return 'ui/ic-music';
  if (key === 'icSfx') return 'ui/ic-sfx';
  if (key === 'volumeTrack') return 'ui/volume-track';
  if (key === 'volumeFill') return 'ui/volume-fill';
  if (key === 'sliderThumb') return 'ui/slider-thumb';
  return null;
}

function pathOf(key: ArtKey): string {
  if (key === 'bg') return 'ui/bg-play-q/spriteFrame';
  if (key === 'home') return 'ui/bg-home/spriteFrame';
  if (key === 'play') return 'ui/btn-play/spriteFrame';
  if (key === 'board') return 'ui/board-score-q/spriteFrame';
  if (key === 'chip') return 'ui/chip-q/spriteFrame';
  if (key === 'badge') return 'ui/level-badge/spriteFrame';
  if (key === 'homeBadge') return 'ui/level-home/spriteFrame';
  if (key === 'prefix') return 'ui/lv-prefix/spriteFrame';
  if (key === 'settingsBg') return 'ui/btn-settings-bg/spriteFrame';
  if (key === 'settingsGear') return 'ui/ic-gear/spriteFrame';
  if (key === 'settingsClose') return 'ui/btn-close/spriteFrame';
  if (key === 'shareBtn') return 'ui/btn-clear-next/spriteFrame';
  if (key === 'clubBtn') return 'ui/btn-clear-reward/spriteFrame';
  if (key === 'settingsCard') return 'ui/panel-clear/spriteFrame';
  if (key === 'settingsDim') return 'ui/dim-clear/spriteFrame';
  if (key === 'icMusic') return 'ui/ic-music/spriteFrame';
  if (key === 'icSfx') return 'ui/ic-sfx/spriteFrame';
  if (key === 'volumeTrack') return 'ui/volume-track/spriteFrame';
  if (key === 'volumeFill') return 'ui/volume-fill/spriteFrame';
  if (key === 'sliderThumb') return 'ui/slider-thumb/spriteFrame';
  if (key.startsWith('lvh')) return `ui/lvh-${key.slice(3)}/spriteFrame`;
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
    const imgPath = imagePathOf(key);
    if (!imgPath) {
      done();
      return;
    }
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

function paintSprite(node: Node, sf: SpriteFrame, w: number, h: number, sliced: boolean, inset = 0): void {
  if (sliced && inset > 0) {
    sf.insetTop = Math.max(sf.insetTop, inset);
    sf.insetBottom = Math.max(sf.insetBottom, inset);
    sf.insetLeft = Math.max(sf.insetLeft, inset);
    sf.insetRight = Math.max(sf.insetRight, inset);
  }
  let sp = node.getComponent(Sprite);
  if (!sp) sp = node.addComponent(Sprite);
  sp.spriteFrame = sf;
  sp.sizeMode = Sprite.SizeMode.CUSTOM;
  sp.type = sliced ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
  sp.color = Color.WHITE;
  sp.enabled = true;
  node.getComponent(UITransform)?.setContentSize(w, h);
}

export function applyArtSprite(
  node: Node | null,
  key: ArtKey,
  w: number,
  h: number,
  sliced = false,
): boolean {
  if (!node) return false;
  const sf = frames.get(key);
  if (!sf) return false;
  paintSprite(node, sf, w, h, sliced, key === 'settingsCard' ? 128 : 0);
  return true;
}

/** Load on demand if preload missed the key (new settings chrome). */
export function applyArtSpriteSoon(
  node: Node | null,
  key: ArtKey,
  w: number,
  h: number,
  sliced = false,
): void {
  if (!node) return;
  if (applyArtSprite(node, key, w, h, sliced)) return;
  resources.load(pathOf(key), SpriteFrame, (err, sf) => {
    if (!err && sf?.texture && node.isValid) {
      frames.set(key, sf);
      paintSprite(node, sf, w, h, sliced, key === 'settingsCard' ? 128 : 0);
      return;
    }
    const imgPath = imagePathOf(key);
    if (!imgPath) return;
    resources.load(imgPath, ImageAsset, (e2, img) => {
      if (e2 || !img || !node.isValid) return;
      const made = frameFromImage(img);
      frames.set(key, made);
      paintSprite(node, made, w, h, sliced, key === 'settingsCard' ? 128 : 0);
    });
  });
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

export function layoutHomeLevel(board: Node | null, level: number, size: number, glyphH: number): void {
  if (!board) return;
  board.getComponent(UITransform)?.setContentSize(size, size);
  const face = board.getChildByName('Board');
  const word = frames.get('homeBadge');
  if (face && word) {
    const oh = Math.max(1, word.originalSize.height);
    const ow = Math.max(1, word.originalSize.width);
    const wh = Math.round(size * 0.22);
    const ww = Math.round(wh * (ow / oh));
    applyArtSprite(face, 'homeBadge', ww, wh);
    face.setPosition(0, -Math.round(size * 0.24), 0);
    face.active = true;
  } else if (face) {
    const sp = face.getComponent(Sprite);
    if (sp) {
      sp.spriteFrame = null;
      sp.enabled = false;
    }
    face.active = false;
  }
  const title = board.getChildByName('Title');
  if (!title) return;
  title.active = true;
  title.setPosition(0, Math.round(size * 0.10), 0);
  title.getComponent(UITransform)?.setContentSize(Math.round(size * 0.78), Math.round(size * 0.52));
  paintHomeLevelDigits(title, level, glyphH);
}

export function paintHomeLevelDigits(root: Node | null, level: number, glyphH: number): void {
  if (!root) return;
  const digits = [...String(Math.max(0, level | 0)).padStart(2, '0')];
  const digitSfs = digits.map((ch) => frames.get(`lvh${ch}`));
  const ready = digitSfs.every(Boolean);
  for (let i = 0; i < 8; i++) {
    const n = root.getChildByName(`G_${i}`);
    if (n) n.active = false;
  }
  const fallback = root.getChildByName('Fallback');
  if (fallback) fallback.active = false;
  if (!ready) return;

  const gap = glyphH * 0.04;
  const widths = digits.map((ch) => {
    const sf = frames.get(`lvh${ch}`);
    const ow = sf?.originalSize.width || 1;
    const oh = Math.max(1, sf?.originalSize.height || 1);
    return glyphH * (ow / oh);
  });
  const total = widths.reduce((s, w) => s + w, 0) + (digits.length - 1) * gap;
  let x = -total * 0.5;
  for (let i = 0; i < digits.length; i++) {
    const dw = widths[i];
    x += dw * 0.5;
    const n = glyphNode(root, i, dw, glyphH);
    n.setPosition(x, 0, 0);
    applyArtSprite(n, `lvh${digits[i]}` as ArtKey, dw, glyphH);
    x += dw * 0.5 + gap;
  }
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
