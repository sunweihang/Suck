import {
  AssetManager,
  Color,
  Graphics,
  Label,
  Layers,
  Mask,
  Node,
  Sprite,
  SpriteFrame,
  Texture2D,
  UITransform,
  assetManager,
  resources,
} from 'cc';
import { levelBadgeText } from '../game/LevelCatalog';
import { paintCapsuleBtn, paintLevelBadge, styleLevelBadge } from './QChrome';

/** Native pixel size of the volcano button PNGs. Do not stretch. */
export const VOLCANO_BTN_W = 374;
export const VOLCANO_BTN_H = 145;
/** Button ad-mark height. Width follows the sprite, never squash. */
export const AD_MARK_H = 78;

const KEYS = [
  'bg',
  'home',
  'play',
  'badge',
  'homeBadge',
  'prefix',
  'settingsBg',
  'settingsGear',
  'icHudHome',
  'icHudClub',
  'icHudGear',
  'icHudRank',
  'settingsClose',
  'ugcBtn',
  'shareBtn',
  'clubBtn',
  'settingsCard',
  'settingsDim',
  'icMusic',
  'icSfx',
  'icHaptic',
  'icHomeRow',
  'icSkip',
  'icReset',
  'volumeTrack',
  'volumeFill',
  'sliderThumb',
  'loadTrack',
  'loadFill',
  'loadKnob',
  'itemTray',
  'itemBadge',
  'icShuffle',
  'icHook',
  'icShovel',
  'icBomb',
  'icUgcAdd',
  'icUgcDown',
  'icUgcUp',
  'icUgcUndo',
  'icUgcErase',
  'icUgcDel',
  'icUgcVis',
  'icUgcEdit',
  'icUgcLoad',
  'icUgcExport',
  'icUgcNew',
  'icUgcRun',
  'icUgcExit',
  'goldIcon',
  'energyIcon',
  'goldBg',
  'icAd',
  'icAdCam',
  'icAdPlay',
  'icFreeSpin',
  'icBoost',
  'icLink',
  'iceOverlay',
  'winAction',
  'winDouble',
  'winHome',
  'winSkip',
  'chest',
  'itemGetPanel',
  'itemGetBox',
  'itemGetClose',
  'panelMain',
  'winPanel',
  'failPanel',
  'lockSeal',
  'tipBase',
  'rankItemBg',
  'rankNumBg',
  'rankGold',
  'rankSilver',
  'rankBronze',
  'rankAvatarPlate',
  'rankAvatar',
  'rankBg',
  ...Array.from({ length: 10 }, (_, i) => `d${i}`),
  ...Array.from({ length: 10 }, (_, i) => `lv${i}`),
  ...Array.from({ length: 10 }, (_, i) => `lvh${i}`),
] as const;
type ArtKey = (typeof KEYS)[number];

function pathOf(key: ArtKey): string {
  if (key === 'bg') return 'ui/bg-play-q/spriteFrame';
  if (key === 'home') return 'ui/bg-home/spriteFrame';
  if (key === 'play') return 'ui/btn-play/spriteFrame';
  if (key === 'badge') return 'ui/level-badge/spriteFrame';
  if (key === 'homeBadge') return 'ui/level-home/spriteFrame';
  if (key === 'prefix') return 'ui/lv-prefix/spriteFrame';
  if (key === 'settingsBg') return 'ui/btn-settings-bg/spriteFrame';
  if (key === 'settingsGear') return 'ui/ic-gear/spriteFrame';
  if (key === 'icHudHome') return 'ui/ic-hud-home/spriteFrame';
  if (key === 'icHudClub') return 'ui/ic-hud-club/spriteFrame';
  if (key === 'icHudGear') return 'ui/ic-hud-gear/spriteFrame';
  if (key === 'icHudRank') return 'ui/ic-hud-rank/spriteFrame';
  if (key === 'settingsClose') return 'ui/btn-close/spriteFrame';
  if (key === 'ugcBtn') return 'ui/btn-ugc/spriteFrame';
  if (key === 'shareBtn') return 'ui/btn-clear-next/spriteFrame';
  if (key === 'clubBtn') return 'ui/btn-clear-reward/spriteFrame';
  if (key === 'settingsCard') return 'ui/panel-clear/spriteFrame';
  if (key === 'settingsDim') return 'ui/dim-clear/spriteFrame';
  if (key === 'icMusic') return 'ui/ic-music/spriteFrame';
  if (key === 'icSfx') return 'ui/ic-sfx/spriteFrame';
  if (key === 'icHaptic') return 'ui/ic-haptic/spriteFrame';
  if (key === 'icHomeRow') return 'ui/ic-home-row/spriteFrame';
  if (key === 'icSkip') return 'ui/ic-skip/spriteFrame';
  if (key === 'icReset') return 'ui/ic-reset/spriteFrame';
  if (key === 'volumeTrack') return 'ui/volume-track/spriteFrame';
  if (key === 'volumeFill') return 'ui/volume-fill/spriteFrame';
  if (key === 'sliderThumb') return 'ui/slider-thumb/spriteFrame';
  if (key === 'loadTrack') return 'ui/load-track/spriteFrame';
  if (key === 'loadFill') return 'ui/load-fill/spriteFrame';
  if (key === 'loadKnob') return 'ui/load-knob/spriteFrame';
  if (key === 'itemTray') return 'ui/item-tray/spriteFrame';
  if (key === 'itemBadge') return 'ui/item-badge/spriteFrame';
  if (key === 'icShuffle') return 'ui/ic-item-shuffle/spriteFrame';
  if (key === 'icHook') return 'ui/ic-item-hook/spriteFrame';
  if (key === 'icShovel') return 'ui/ic-item-shovel/spriteFrame';
  if (key === 'icBomb') return 'ui/ic-item-bomb/spriteFrame';
  if (key === 'icUgcAdd') return 'ui/ic-ugc-layer-add/spriteFrame';
  if (key === 'icUgcDown') return 'ui/ic-ugc-layer-down/spriteFrame';
  if (key === 'icUgcUp') return 'ui/ic-ugc-layer-up/spriteFrame';
  if (key === 'icUgcUndo') return 'ui/ic-ugc-undo/spriteFrame';
  if (key === 'icUgcErase') return 'ui/ic-ugc-erase/spriteFrame';
  if (key === 'icUgcDel') return 'ui/ic-ugc-layer-del/spriteFrame';
  if (key === 'icUgcVis') return 'ui/ic-ugc-vis/spriteFrame';
  if (key === 'icUgcEdit') return 'ui/ic-ugc-edit/spriteFrame';
  if (key === 'icUgcLoad') return 'ui/ic-ugc-load/spriteFrame';
  if (key === 'icUgcExport') return 'ui/ic-ugc-export/spriteFrame';
  if (key === 'icUgcNew') return 'ui/ic-ugc-new/spriteFrame';
  if (key === 'icUgcRun') return 'ui/ic-ugc-run/spriteFrame';
  if (key === 'icUgcExit') return 'ui/ic-ugc-exit/spriteFrame';
  if (key === 'goldIcon') return 'ui/ui-gold-icon/spriteFrame';
  if (key === 'energyIcon') return 'ui/ui-energy-icon/spriteFrame';
  if (key === 'goldBg') return 'ui/ui-gold-bg/spriteFrame';
  if (key === 'icAd') return 'ui/ic-ad-play/spriteFrame';
  if (key === 'icAdCam') return 'ui/ic-ad-cam/spriteFrame';
  if (key === 'icAdPlay') return 'ui/ic-ad-play/spriteFrame';
  if (key === 'icFreeSpin') return 'ui/ic-free-spin/spriteFrame';
  if (key === 'icBoost') return 'ui/ic-boost/spriteFrame';
  if (key === 'icLink') return 'ui/ic-link/spriteFrame';
  if (key === 'iceOverlay') return 'ui/ice-overlay/spriteFrame';
  if (key === 'winAction') return 'ui/btn-win-action/spriteFrame';
  if (key === 'winDouble') return 'ui/btn-win-double/spriteFrame';
  if (key === 'winHome') return 'ui/btn-win-home/spriteFrame';
  if (key === 'winSkip') return 'ui/btn-win-skip/spriteFrame';
  if (key === 'chest') return 'ui/chest/spriteFrame';
  if (key === 'itemGetPanel') return 'ui/panel-item-get/spriteFrame';
  if (key === 'panelMain') return 'ui/panel-main/spriteFrame';
  if (key === 'winPanel') return 'ui/panel-win/spriteFrame';
  if (key === 'failPanel') return 'ui/panel-fail/spriteFrame';
  if (key === 'itemGetBox') return 'ui/item-get-box/spriteFrame';
  if (key === 'itemGetClose') return 'ui/btn-item-close/spriteFrame';
  if (key === 'lockSeal') return 'ui/lock-seal/spriteFrame';
  if (key === 'tipBase') return 'ui/tip-base/spriteFrame';
  if (key === 'rankItemBg') return 'ui/rank-item-bg/spriteFrame';
  if (key === 'rankNumBg') return 'ui/rank-num-bg/spriteFrame';
  if (key === 'rankGold') return 'ui/rank-gold/spriteFrame';
  if (key === 'rankSilver') return 'ui/rank-silver/spriteFrame';
  if (key === 'rankBronze') return 'ui/rank-bronze/spriteFrame';
  if (key === 'rankAvatarPlate') return 'ui/rank-avatar-plate/spriteFrame';
  if (key === 'rankAvatar') return 'ui/rank-avatar/spriteFrame';
  if (key === 'rankBg') return 'ui/rank-bg/spriteFrame';
  if (key.startsWith('lvh')) return `ui/lvh-${key.slice(3)}/spriteFrame`;
  if (key.startsWith('lv')) return `ui/lv-${key.slice(2)}/spriteFrame`;
  return `ui/digit-${key.slice(1)}/spriteFrame`;
}

const frames = new Map<string, SpriteFrame>();
const inflight = new Map<string, Promise<SpriteFrame | null>>();
const LVH_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
let boot: Promise<void> | null = null;
let homeArt: Promise<void> | null = null;
let homeOk = false;
let homeKeep: Promise<void> | null = null;
const pendingHome: { root: Node; level: number; glyphH: number }[] = [];

function sharpenUiTex(tex: Texture2D | null | undefined): void {
  if (!tex) return;
  tex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  tex.setMipFilter(Texture2D.Filter.NONE);
}

function resBundle(): AssetManager.Bundle | null {
  return assetManager.getBundle('resources');
}

function frameOk(sf: SpriteFrame | null | undefined): boolean {
  if (!sf) return false;
  const w = sf.rect?.width ?? 0;
  const h = sf.rect?.height ?? 0;
  return w >= 8 && h >= 8;
}

function stashFrame(key: string, sf: SpriteFrame | null | undefined): boolean {
  if (!sf || !frameOk(sf)) return false;
  if (sf.texture) sharpenUiTex(sf.texture as Texture2D);
  frames.set(key, sf);
  return true;
}

function loadPath(path: string, type: typeof SpriteFrame): Promise<unknown> {
  return new Promise((resolve) => {
    const bundle = resBundle();
    const done = (err: Error | null, asset: unknown): void => {
      resolve(!err && asset ? asset : null);
    };
    if (bundle) bundle.load(path, type as never, done);
    else resources.load(path, type as never, done);
  });
}

function loadArt(key: ArtKey): Promise<SpriteFrame | null> {
  const hit = frames.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = loadPath(pathOf(key), SpriteFrame).then((sf) => {
    inflight.delete(key);
    return stashFrame(key, sf as SpriteFrame | null) ? (sf as SpriteFrame) : null;
  });
  inflight.set(key, p);
  return p;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadArtRetry(key: ArtKey, tries = 8): Promise<SpriteFrame | null> {
  for (let i = 0; i < tries; i++) {
    const sf = await loadArt(key);
    if (sf) return sf;
    await wait(80 * (i + 1));
  }
  return null;
}

function missingLvh(): string[] {
  return LVH_DIGITS.filter((d) => !frames.get(`lvh${d}`));
}

async function loadOneLvh(digit: string): Promise<void> {
  await loadArtRetry(`lvh${digit}` as ArtKey);
}

function loadLvhDir(): Promise<void> {
  return new Promise((resolve) => {
    const done = (_err: Error | null, list: SpriteFrame[]): void => {
      for (const sf of list ?? []) {
        const m = /^lvh-(\d)$/.exec(sf.name || '');
        if (m) stashFrame(`lvh${m[1]}`, sf);
      }
      resolve();
    };
    const bundle = resBundle();
    if (bundle) bundle.loadDir('ui', SpriteFrame, done);
    else resources.loadDir('ui', SpriteFrame, done);
  });
}

async function loadMissingLvh(): Promise<void> {
  const need = missingLvh();
  if (!need.length) return;
  for (const d of need) await loadOneLvh(d);
  if (missingLvh().length) await loadLvhDir();
}

function flushHomeDigits(): void {
  for (let i = pendingHome.length - 1; i >= 0; i--) {
    const job = pendingHome[i];
    if (!job.root.isValid) {
      pendingHome.splice(i, 1);
      continue;
    }
    const digits = [...String(Math.max(0, job.level | 0)).padStart(2, '0')];
    if (!digits.every((ch) => frames.get(`lvh${ch}`))) continue;
    pendingHome.splice(i, 1);
    assembleHomeDigits(job.root, job.level, job.glyphH);
  }
}

async function keepHomeDigits(): Promise<void> {
  while (missingLvh().length) {
    await loadMissingLvh();
    if (!missingLvh().length) break;
    await wait(400);
  }
  homeOk = true;
  flushHomeDigits();
}

/** Block until 0–9 home digits are in memory. Keeps retrying in the background if boot times out. */
export function ensureHomeLevelArt(): Promise<void> {
  if (homeOk && !missingLvh().length) return Promise.resolve();
  if (homeArt) return homeArt;
  homeArt = (async () => {
    for (let i = 0; i < 30; i++) {
      await loadMissingLvh();
      if (!missingLvh().length) {
        homeOk = true;
        flushHomeDigits();
        return;
      }
      await wait(80 + i * 40);
    }
    if (!homeKeep) homeKeep = keepHomeDigits();
    await homeKeep;
  })().finally(() => {
    if (!homeOk) homeArt = null;
  });
  return homeArt;
}

const HOME_KEYS: ArtKey[] = ['winDouble', 'play', 'home', 'settingsGear', 'ugcBtn', 'shareBtn', 'clubBtn'];

export async function preloadHomeArt(): Promise<void> {
  await ensureHomeLevelArt();
  await Promise.all(HOME_KEYS.map((key) => loadArtRetry(key)));
}

export function preloadUiArt(): Promise<void> {
  if (boot) return boot;
  boot = (async () => {
    await ensureHomeLevelArt();
    const rest = KEYS.filter((k) => !k.startsWith('lvh'));
    let i = 0;
    const worker = async (): Promise<void> => {
      while (i < rest.length) {
        const key = rest[i];
        i += 1;
        await loadArtRetry(key);
      }
    };
    await Promise.all(Array.from({ length: 4 }, () => worker()));
  })();
  return boot;
}

export function artFrame(key: ArtKey | `d${number}`): SpriteFrame | null {
  return frames.get(key) ?? null;
}

function sliceInset(key: ArtKey): { t: number; b: number; l: number; r: number } | null {
  if (key === 'settingsCard') return { t: 128, b: 128, l: 128, r: 128 };
  if (key === 'panelMain') return { t: 280, b: 280, l: 280, r: 280 };
  if (key === 'itemTray') return { t: 72, b: 72, l: 120, r: 120 };
  if (key === 'goldBg') return { t: 0, b: 0, l: 20, r: 20 };
  if (key === 'volumeTrack') return { t: 0, b: 0, l: 32, r: 32 };
  if (key === 'volumeFill') return { t: 0, b: 0, l: 28, r: 28 };
  if (key === 'loadTrack') return { t: 0, b: 0, l: 32, r: 32 };
  if (key === 'loadFill') return { t: 0, b: 0, l: 20, r: 20 };
  if (key === 'tipBase') return { t: 8, b: 8, l: 60, r: 60 };
  return null;
}

function clearNodeGraphics(node: Node): void {
  const g = node.getComponent(Graphics);
  if (!g) return;
  g.clear();
  g.enabled = false;
}

/** Drop the capsule Mask — it shears the PNG end-caps. Alpha is already intact. */
function clearClipMask(node: Node): void {
  const mask = node.getComponent(Mask);
  if (mask) {
    mask.enabled = false;
    mask.destroy();
  }
  clearNodeGraphics(node);
}

function paintSprite(node: Node, sf: SpriteFrame, w: number, h: number, sliced: boolean, key?: ArtKey): void {
  const inset = key ? sliceInset(key) : null;
  if (sliced && inset) {
    sf.insetTop = Math.max(sf.insetTop, inset.t);
    sf.insetBottom = Math.max(sf.insetBottom, inset.b);
    sf.insetLeft = Math.max(sf.insetLeft, inset.l);
    sf.insetRight = Math.max(sf.insetRight, inset.r);
  }
  clearNodeGraphics(node);
  let sp = node.getComponent(Sprite);
  if (!sp) sp = node.addComponent(Sprite);
  sp.spriteFrame = sf;
  sp.color = Color.WHITE;
  sp.enabled = true;
  const rawBtn = key === 'settingsClose' || key === 'winAction' || key === 'winDouble' || key === 'winHome' || key === 'winSkip';
  if (rawBtn) {
    sp.sizeMode = Sprite.SizeMode.RAW;
    sp.type = Sprite.Type.SIMPLE;
    node.getComponent(UITransform)?.setContentSize(sf.rect.width, sf.rect.height);
    return;
  }
  sp.sizeMode = Sprite.SizeMode.CUSTOM;
  sp.type = sliced ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
  sharpenUiTex(sf.texture as Texture2D);
  node.getComponent(UITransform)?.setContentSize(w, h);
}

function mkUiChild(parent: Node, name: string, index: number, w: number, h: number): Node {
  let n = parent.getChildByName(name);
  if (!n) {
    n = new Node(name);
    parent.addChild(n);
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform);
  }
  n.setSiblingIndex(index);
  n.setPosition(0, 0, 0);
  n.getComponent(UITransform)?.setContentSize(w, h);
  return n;
}

function hideFaceGraphics(face: Node): void {
  const leftover = face.getComponent(Sprite);
  if (leftover) {
    leftover.spriteFrame = null;
    leftover.enabled = false;
  }
  const g = face.getComponent(Graphics);
  if (!g) return;
  g.clear();
  g.enabled = false;
}

function paintFaceCapsule(face: Node, w: number, h: number, fill: Color, stroke: Color): void {
  hideFaceGraphics(face);
  let g = face.getComponent(Graphics);
  if (!g) g = face.addComponent(Graphics);
  g.enabled = true;
  paintCapsuleBtn(g, w, h, fill, stroke);
}

/** PNG skin when present. Graphics capsule is fallback only — it has no AA. */
export function ensureBtnChrome(
  btn: Node | null | undefined,
  w: number,
  h: number,
  fill: Color,
  stroke: Color,
  artKey?: 'winDouble' | 'winAction' | 'winHome' | 'winSkip' | 'clubBtn' | 'shareBtn',
): void {
  if (!btn) return;
  const rootSp = btn.getComponent(Sprite);
  if (rootSp) {
    rootSp.spriteFrame = null;
    rootSp.enabled = false;
  }
  clearClipMask(btn);
  const rawBtn = artKey === 'winDouble' || artKey === 'winAction' || artKey === 'winHome' || artKey === 'winSkip';
  const bw = rawBtn ? VOLCANO_BTN_W : w;
  const bh = rawBtn ? VOLCANO_BTN_H : h;
  btn.getComponent(UITransform)?.setContentSize(bw, bh);
  const face = btn.getChildByName('Face');
  if (artKey) {
    if (face) {
      hideFaceGraphics(face);
      face.active = false;
    }
    const skin = mkUiChild(btn, 'Skin', 1, bw, bh);
    if (!applyArtSprite(skin, artKey, bw, bh)) applyArtSpriteSoon(skin, artKey, bw, bh);
  } else {
    const faceN = face ?? mkUiChild(btn, 'Face', 0, bw, bh);
    faceN.active = true;
    faceN.getComponent(UITransform)?.setContentSize(bw, bh);
    paintFaceCapsule(faceN, bw, bh, fill, stroke);
  }
  const content = btn.getChildByName('Content') ?? btn.getChildByName('Label');
  if (content) content.setSiblingIndex(btn.children.length - 1);
}

/** Invisible hit pad. Skip when a sprite already owns this node — Sprite+Graphics cannot share a node. */
export function fillInvisibleHit(node: Node | null | undefined): void {
  if (!node) return;
  const sp = node.getComponent(Sprite);
  if (sp?.enabled && sp.spriteFrame) {
    clearNodeGraphics(node);
    return;
  }
  const ut = node.getComponent(UITransform);
  if (!ut) return;
  let g = node.getComponent(Graphics);
  if (!g) g = node.addComponent(Graphics);
  g.enabled = true;
  g.clear();
  g.fillColor = new Color(255, 255, 255, 1);
  g.roundRect(-ut.width * 0.5, -ut.height * 0.5, ut.width, ut.height, Math.min(ut.height * 0.5, 48));
  g.fill();
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
  if (!sf || !frameOk(sf)) return false;
  paintSprite(node, sf, w, h, sliced, key);
  return true;
}

/** Paint the candy video-ad mark and size it to the sprite aspect. */
export function applyAdIcon(node: Node | null, h = AD_MARK_H): number {
  const fallback = Math.round(h * 1.41);
  if (!node) return fallback;
  const fit = (): number => {
    const sf = node.getComponent(Sprite)?.spriteFrame;
    const w = sf && sf.rect.height > 0 ? Math.round(h * sf.rect.width / sf.rect.height) : fallback;
    node.getComponent(UITransform)?.setContentSize(w, h);
    return w;
  };
  applyArtSpriteSoon(node, 'icAd', fallback, h, false, () => {
    fit();
  });
  return fit();
}

/** Load on demand if preload missed the key (new settings chrome). */
export function applyArtSpriteSoon(
  node: Node | null,
  key: ArtKey,
  w: number,
  h: number,
  sliced = false,
  onApplied?: () => void,
): void {
  if (!node) return;
  if (applyArtSprite(node, key, w, h, sliced)) {
    onApplied?.();
    return;
  }
  void loadArtRetry(key).then((sf) => {
    if (sf && node.isValid) {
      paintSprite(node, sf, w, h, sliced, key);
      onApplied?.();
    }
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
  if (face) face.active = false;
  const title = board.getChildByName('Title');
  if (!title) return;
  title.active = true;
  title.setPosition(0, 0, 0);
  title.getComponent(UITransform)?.setContentSize(Math.round(size * 0.78), Math.round(glyphH * 1.2));
  paintHomeLevelDigits(title, level, glyphH);
}

function assembleHomeDigits(root: Node, level: number, glyphH: number): void {
  const digits = [...String(Math.max(0, level | 0)).padStart(2, '0')];
  const fallback = root.getChildByName('Fallback');
  if (fallback) fallback.active = false;
  for (let i = 0; i < 8; i++) {
    const n = root.getChildByName(`G_${i}`);
    if (n) n.active = false;
  }
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

function paintLevelFallback(root: Node, text: string, glyphH: number): void {
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
    lab.string = text;
    styleLevelBadge(lab, Math.max(36, glyphH));
    lab.color = Color.WHITE;
    lab.outlineColor = new Color(72, 48, 140, 255);
    lab.outlineWidth = Math.max(4, Math.round(glyphH * 0.1));
  }
}

export function paintHomeLevelDigits(root: Node | null, level: number, glyphH: number): void {
  if (!root) return;
  const digits = [...String(Math.max(0, level | 0)).padStart(2, '0')];
  const ready = digits.every((ch) => !!frames.get(`lvh${ch}`));
  if (ready) {
    assembleHomeDigits(root, level, glyphH);
    return;
  }
  paintLevelFallback(root, digits.join(''), glyphH);
  const i = pendingHome.findIndex((job) => job.root === root);
  if (i >= 0) pendingHome[i] = { root, level, glyphH };
  else pendingHome.push({ root, level, glyphH });
  void ensureHomeLevelArt().then(flushHomeDigits);
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
    paintLevelFallback(root, levelBadgeText(level), glyphH);
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
