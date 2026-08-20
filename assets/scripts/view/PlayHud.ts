import {
  _decorator,
  Color,
  Component,
  EventTouch,
  Graphics,
  Label,
  Layers,
  Node,
  Sprite,
  Tween,
  UITransform,
  Vec3,
  Widget,
  tween,
} from 'cc';
import { HintHand } from '../battle/HintHand';
import { Theme } from '../game/Theme';
import { PLAY_ITEM_BAR, itemTrayTopFromBottom, uiSafeInsets, uiVisibleSize } from '../game/ViewFit';
import { fitBox, paintQBtn, styleQCaption, styleQNum } from './QChrome';
import { GOLD_HUD } from './GoldHud';
import { applyArtSprite, applyArtSpriteSoon, layoutHomeLevel } from './UiArt';
import { gameAudio } from '../audio/AudioService';
import type { ItemHudState, ItemId } from '../battle/BattleDirector';
import { itemUnlocked } from '../game/LevelCatalog';
import type { GuideView } from '../game/TutorialGuide';

const { ccclass } = _decorator;

const PLAY_BADGE = 360;
const PLAY_DIGIT_H = 92;
const SETTINGS_CIRCLE = 160;
const SETTINGS_GEAR = 75;
const SETTINGS_ICON = 107;
const SETTINGS_W = 187;
const SETTINGS_H = 224;
const SETTINGS_LAB_W = 160;
const SETTINGS_LAB_H = 53;
const SETTINGS_LAB_SIZE = 37;
const SETTINGS_ICON_Y = 32;
const SETTINGS_LAB_Y = -35;
const SETTINGS_STACK_GAP = 11;
const SETTINGS_INK = new Color(110, 104, 168, 255);
const ITEM_HIT = 192;
const ITEM_ICON = 168;
const ITEM_GAP = 10;
const ITEM_PAD_X = 62;
const ITEM_BADGE = 54;
const ITEM_TRAY_H = PLAY_ITEM_BAR.trayH;
const ITEM_IDS: readonly ItemId[] = ['shuffle', 'hook', 'shovel', 'bomb'];
const ITEM_ICON_KEY = {
  shuffle: 'icShuffle',
  hook: 'icHook',
  shovel: 'icShovel',
  bomb: 'icBomb',
} as const;
const BADGE_INK = new Color(255, 255, 255, 255);
const TIP_W = 820;
const TIP_H = 112;
const TIP_INK = new Color(28, 46, 102, 255);
const TIP_OUTLINE = new Color(255, 255, 255, 200);
const _guidePos = new Vec3();

@ccclass('PlayHud')
export class PlayHud extends Component {
  private _built = false;
  private _level = 1;
  private _onHome: (() => void) | null = null;
  private _onNext: (() => void) | null = null;
  private _onSettings: (() => void) | null = null;
  private _onRevealGm: (() => void) | null = null;
  private _onUgc: (() => void) | null = null;
  private _onItem: ((id: ItemId) => void) | null = null;
  private _gmTaps = 0;
  private _gmTapAt = 0;
  private _items: ItemHudState = {
    coins: 0,
    shuffle: 1,
    hook: 1,
    shovel: 1,
    bomb: 1,
    hookPick: false,
    shovelPick: false,
    bombPick: false,
  };
  private _guide: GuideView | null = null;
  private _ugc = false;
  private readonly _heldUnlock = new Set<ItemId>();

  setup(opts: {
    onHome: () => void;
    onNext?: () => void;
    onSettings?: () => void;
    onRevealGm?: () => void;
    onUgc?: () => void;
    onItem?: (id: ItemId) => void;
  }): void {
    this._onHome = opts.onHome;
    this._onNext = opts.onNext ?? null;
    this._onSettings = opts.onSettings ?? null;
    this._onRevealGm = opts.onRevealGm ?? null;
    this._onUgc = opts.onUgc ?? null;
    this._onItem = opts.onItem ?? null;
    this._ensureTree();
    const back = this.node.getChildByName('BackBtn');
    if (back) back.active = false;
    const next = this.node.getChildByName('NextBtn');
    next?.off(Node.EventType.TOUCH_END);
    next?.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      gameAudio()?.playUiClick();
      this._onNext?.();
    }, this);
    const settings = this.node.getChildByName('SettingsBtn');
    settings?.off(Node.EventType.TOUCH_END);
    settings?.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      gameAudio()?.playUiClick();
      this._onSettings?.();
    }, this);
    this._bindUgcBtn();
    this._bindScoreBoard();
    this.layoutChrome();
  }

  show(): void {
    const wasOff = !this.node.active;
    this.node.active = true;
    const next = this.node.getChildByName('NextBtn');
    if (next) next.active = false;
    this._syncTip();
    if (wasOff) this.layoutChrome();
    this._paintItems();
  }

  hide(): void {
    this._guide = null;
    this._heldUnlock.clear();
    this.hintHand?.hide();
    this.node.active = false;
  }

  applyArt(): void {
    this._ensureTree();
    layoutHomeLevel(this.node.getChildByName('ScoreBoard'), this._level, PLAY_BADGE, PLAY_DIGIT_H);
    this._paintSettings();
    this._paintUgc();
    this._paintTip();
  }

  setLevel(n: number): void {
    this._level = n;
    layoutHomeLevel(this.node.getChildByName('ScoreBoard'), n, PLAY_BADGE, PLAY_DIGIT_H);
    this._syncTip();
    this._paintItems();
    this.layoutChrome();
  }

  setUgc(on: boolean): void {
    this._ugc = on;
    const board = this.node.getChildByName('ScoreBoard');
    if (board) board.active = !on;
    const ugc = this.node.getChildByName('UgcBtn');
    if (ugc) ugc.active = !on;
  }

  showCleared(_cleared: number, _hasNext: boolean): void {
    const win = this.node.getChildByName('WinLabel');
    if (win) win.active = false;
    const next = this.node.getChildByName('NextBtn');
    if (next) next.active = false;
    const tip = this.node.getChildByName('TipLab');
    if (tip) tip.active = false;
    const powers = this.node.getChildByName('Powers');
    if (powers) powers.active = false;
    const ugc = this.node.getChildByName('UgcBtn');
    if (ugc) ugc.active = false;
    this._guide = null;
    this.hintHand?.hide();
  }

  setGuide(guide: GuideView | null): void {
    const next = guide?.id === this._guide?.id
      && guide?.phase === this._guide?.phase
      && guide?.tip === this._guide?.tip
      ? this._guide
      : guide;
    const changed = next !== this._guide;
    this._guide = next;
    this._syncTip();
    this._placeGuideHand();
    if (changed && this._guide?.phase === 'icon' && this._guide.item) {
      this.pulseItem(this._guide.item);
    }
  }

  get hintHand(): HintHand | null {
    return this.node.getChildByName('HintHand')?.getComponent(HintHand) ?? null;
  }

  get winLabel(): Label | null {
    return this.node.getChildByName('WinLabel')?.getComponent(Label) ?? null;
  }

  get powerRoot(): Node | null {
    return this.node.getChildByName('Powers');
  }

  layoutChrome(): void {
    this._ensureTree();
    const vis = uiVisibleSize();
    const safe = uiSafeInsets();
    const pad = GOLD_HUD.pad;
    const chromeY = vis.h * 0.5 - GOLD_HUD.rootH * 0.5 - safe.top - pad;
    const back = this.node.getChildByName('BackBtn');
    if (back) back.active = false;
    const board = this.node.getChildByName('ScoreBoard');
    if (board) {
      board.active = !this._ugc;
      board.setPosition(0, chromeY, 0);
    }
    this.node.getChildByName('TipLab')?.setPosition(0, chromeY - PLAY_BADGE * 0.5 - 68, 0);
    this.node.getChildByName('WinLabel')?.setPosition(0, 80, 0);
    this.node.getChildByName('NextBtn')?.setPosition(0, -80, 0);
    const rightX = vis.w * 0.5 - SETTINGS_W * 0.5 - safe.right - pad;
    const ugcY = chromeY - GOLD_HUD.rootH - 88;
    const ugc = this.node.getChildByName('UgcBtn');
    if (ugc) {
      ugc.active = !this._ugc;
      this._syncSideBtn(ugc, 'UgcLabel', 'Icon', SETTINGS_ICON);
      ugc.setPosition(rightX, ugcY, 0);
    }
    const settings = this.node.getChildByName('SettingsBtn');
    if (settings) {
      settings.active = true;
      this._syncSideBtn(settings, 'SettingsLabel', 'Gear', SETTINGS_GEAR);
      settings.setPosition(rightX, ugc?.active ? ugcY - SETTINGS_H - SETTINGS_STACK_GAP : ugcY, 0);
    }
    this._layoutItems(vis.h, safe.bottom);
    this._placeGuideHand();
  }

  private _syncTip(): void {
    const tip = this.node.getChildByName('TipLab');
    if (tip) tip.active = false;
  }

  private _paintTip(): void {
    const tip = this.node.getChildByName('TipLab');
    if (!tip) return;
    applyArtSpriteSoon(tip.getChildByName('Face') ?? tip, 'tipBase', TIP_W, TIP_H, true);
  }

  private _placeGuideHand(): void {
    const hand = this.hintHand;
    const item = this._guide?.phase === 'icon' ? this._guide.item : null;
    if (!hand || !item) {
      hand?.hide();
      return;
    }
    if (!this.itemIconWorldPos(item, _guidePos)) {
      hand.hide();
      return;
    }
    hand.placeUi(_guidePos, _guidePos);
  }

  private _ensureTree(): void {
    if (this._built) return;
    this._built = true;
    this.node.layer = Layers.Enum.UI_2D;
    const vis = uiVisibleSize();
    let ut = this.node.getComponent(UITransform);
    if (!ut) ut = this.node.addComponent(UITransform);
    ut.setContentSize(vis.w, vis.h);
    let widget = this.node.getComponent(Widget);
    if (!widget) widget = this.node.addComponent(Widget);
    widget.isAlignTop = widget.isAlignBottom = widget.isAlignLeft = widget.isAlignRight = true;
    widget.top = widget.bottom = widget.left = widget.right = 0;
    widget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;

    this._scoreBoard();
    this._settingsBtn();
    this._ugcBtn();

    const tip = this._mk('TipLab', TIP_W, TIP_H);
    this._mk('Face', TIP_W, TIP_H, tip);
    const labN = this._mk('Lab', TIP_W - 80, TIP_H - 28, tip);
    this._lab(labN, '', 40, TIP_INK, TIP_W - 80, TIP_H - 28, false);
    const tipLab = labN.getComponent(Label);
    if (tipLab) {
      tipLab.overflow = Label.Overflow.SHRINK;
      tipLab.outlineColor = TIP_OUTLINE;
      tipLab.outlineWidth = 3;
    }
    tip.active = false;

    const win = this._mk('WinLabel', 860, 96);
    win.active = false;
    this._lab(win, '墙体已拆完', 64, Theme.boardNum, 860, 96, true);

    const next = this._mk('NextBtn', 400, 108);
    next.active = false;
    paintQBtn(next.addComponent(Graphics), 400, 108, Theme.playFill, Theme.boardStroke);
    this._lab(next, '下一关', 44, Theme.playText, 400, 108, false);

    this._itemBar();

    const hand = this._mk('HintHand', 160, 220);
    hand.active = false;
    hand.addComponent(HintHand);
  }

  private _settingsBtn(): Node {
    const n = this._mk('SettingsBtn', SETTINGS_W, SETTINGS_H);
    this._mk('Bg', SETTINGS_CIRCLE, SETTINGS_CIRCLE, n);
    this._mk('Gear', SETTINGS_GEAR, SETTINGS_GEAR, n);
    const labN = this._mk('SettingsLabel', SETTINGS_LAB_W, SETTINGS_LAB_H, n);
    this._lab(labN, '设置', SETTINGS_LAB_SIZE, SETTINGS_INK, SETTINGS_LAB_W, SETTINGS_LAB_H, false);
    const lab = labN.getComponent(Label);
    if (lab) {
      lab.outlineColor = Color.WHITE;
      lab.outlineWidth = 4;
    }
    this._syncSideBtn(n, 'SettingsLabel', 'Gear', SETTINGS_GEAR);
    this._paintSettings();
    return n;
  }

  private _ugcBtn(): Node {
    const n = this._mk('UgcBtn', SETTINGS_W, SETTINGS_H);
    this._mk('Bg', SETTINGS_CIRCLE, SETTINGS_CIRCLE, n);
    this._mk('Icon', SETTINGS_ICON, SETTINGS_ICON, n);
    const labN = this._mk('UgcLabel', SETTINGS_LAB_W, SETTINGS_LAB_H, n);
    this._lab(labN, '创作', SETTINGS_LAB_SIZE, SETTINGS_INK, SETTINGS_LAB_W, SETTINGS_LAB_H, false);
    const lab = labN.getComponent(Label);
    if (lab) {
      lab.outlineColor = Color.WHITE;
      lab.outlineWidth = 4;
    }
    this._syncSideBtn(n, 'UgcLabel', 'Icon', SETTINGS_ICON);
    this._paintUgc();
    return n;
  }

  private _syncSideBtn(n: Node, labName: string, iconName: string, iconSize: number): void {
    n.getComponent(UITransform)?.setContentSize(SETTINGS_W, SETTINGS_H);
    const bg = n.getChildByName('Bg');
    bg?.getComponent(UITransform)?.setContentSize(SETTINGS_CIRCLE, SETTINGS_CIRCLE);
    bg?.setPosition(0, SETTINGS_ICON_Y, 0);
    const icon = n.getChildByName(iconName);
    icon?.getComponent(UITransform)?.setContentSize(iconSize, iconSize);
    icon?.setPosition(0, SETTINGS_ICON_Y, 0);
    const labN = n.getChildByName(labName);
    labN?.getComponent(UITransform)?.setContentSize(SETTINGS_LAB_W, SETTINGS_LAB_H);
    labN?.setPosition(0, SETTINGS_LAB_Y, 0);
    const lab = labN?.getComponent(Label);
    if (lab) {
      lab.fontSize = SETTINGS_LAB_SIZE;
      lab.lineHeight = SETTINGS_LAB_SIZE;
      lab.outlineWidth = 4;
    }
  }

  private _bindUgcBtn(): void {
    const n = this.node.getChildByName('UgcBtn');
    n?.off(Node.EventType.TOUCH_START);
    n?.off(Node.EventType.TOUCH_END);
    n?.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
      e.propagationStopped = true;
    }, this);
    n?.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      gameAudio()?.playUiClick();
      this._onUgc?.();
    }, this);
  }

  private _paintUgc(): void {
    const n = this.node.getChildByName('UgcBtn');
    if (!n) return;
    this._syncSideBtn(n, 'UgcLabel', 'Icon', SETTINGS_ICON);
    applyArtSpriteSoon(n.getChildByName('Bg'), 'settingsBg', SETTINGS_CIRCLE, SETTINGS_CIRCLE);
    const icon = n.getChildByName('Icon');
    if (!icon) return;
    icon.active = true;
    let art = icon.getChildByName('Art');
    if (!art) art = this._mk('Art', SETTINGS_ICON, SETTINGS_ICON, icon);
    art.getComponent(UITransform)?.setContentSize(SETTINGS_ICON, SETTINGS_ICON);
    const glyph = icon.getChildByName('Glyph') ?? this._mk('Glyph', SETTINGS_ICON, SETTINGS_ICON, icon);
    glyph.getComponent(UITransform)?.setContentSize(SETTINGS_ICON, SETTINGS_ICON);
    if (applyArtSprite(art, 'ugcBtn', SETTINGS_ICON, SETTINGS_ICON)) {
      glyph.active = false;
      return;
    }
    glyph.active = true;
    this._paintUgcBricks(glyph);
    applyArtSpriteSoon(art, 'ugcBtn', SETTINGS_ICON, SETTINGS_ICON, false, () => {
      if (glyph.isValid) glyph.active = false;
    });
  }

  private _paintUgcBricks(icon: Node): void {
    let g = icon.getComponent(Graphics);
    if (!g) g = icon.addComponent(Graphics);
    g.enabled = true;
    g.clear();
    const bricks: Array<readonly [number, number, Color]> = [
      [-27, 16, Theme.cyan],
      [13, 19, Theme.pink],
      [-8, -19, Theme.lime],
    ];
    for (const [x, y, fill] of bricks) {
      g.fillColor = new Color(48, 32, 24, 70);
      g.roundRect(x + 4, y - 7, 43, 32, 9);
      g.fill();
      g.fillColor = fill;
      g.roundRect(x, y, 43, 32, 9);
      g.fill();
      g.fillColor = new Color(255, 255, 255, 90);
      g.roundRect(x + 5, y + 19, 29, 8, 4);
      g.fill();
    }
  }

  private _paintSettings(): void {
    const n = this.node.getChildByName('SettingsBtn');
    if (!n) return;
    this._syncSideBtn(n, 'SettingsLabel', 'Gear', SETTINGS_GEAR);
    applyArtSprite(n.getChildByName('Bg'), 'settingsBg', SETTINGS_CIRCLE, SETTINGS_CIRCLE);
    applyArtSprite(n.getChildByName('Gear'), 'settingsGear', SETTINGS_GEAR, SETTINGS_GEAR);
    this._paintItems();
  }

  setItems(state: ItemHudState): void {
    this._items = { ...state };
    this._paintItems();
  }

  holdUnlock(id: ItemId): void {
    this._heldUnlock.add(id);
    this._paintItems();
  }

  releaseUnlock(id: ItemId): void {
    if (!this._heldUnlock.delete(id)) return;
    this._paintItems();
  }

  private _itemOpen(id: ItemId): boolean {
    if (this._heldUnlock.has(id)) return false;
    return itemUnlocked(id, this._level);
  }

  itemIconWorldPos(id: ItemId, out: Vec3): boolean {
    const n = this.node.getChildByName('Powers')?.getChildByName(`Item_${id}`);
    if (!n?.isValid || !n.active) return false;
    const icon = n.getChildByName('Icon');
    const anchor = icon?.isValid ? icon : n;
    const wasActive = icon?.isValid ? icon.active : true;
    if (icon?.isValid) icon.active = true;
    anchor.getWorldPosition(out);
    if (icon?.isValid) icon.active = wasActive;
    return true;
  }

  pulseItem(id: ItemId): void {
    if (this._heldUnlock.has(id)) return;
    const n = this.node.getChildByName('Powers')?.getChildByName(`Item_${id}`);
    if (!n?.isValid) return;
    Tween.stopAllByTarget(n);
    n.setScale(1, 1, 1);
    tween(n)
      .to(0.12, { scale: new Vec3(1.14, 1.14, 1) }, { easing: 'sineOut' })
      .to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();
  }

  private _visibleIds(): ItemId[] {
    return ITEM_IDS.slice();
  }

  private _itemSpan(): number {
    const n = this._visibleIds().length;
    if (n <= 0) return 0;
    return n * ITEM_HIT + Math.max(0, n - 1) * ITEM_GAP;
  }

  private _traySize(): { w: number; h: number } {
    return { w: this._itemSpan() + ITEM_PAD_X * 2, h: ITEM_TRAY_H };
  }

  private _itemPos(i: number): { x: number; y: number } {
    const span = this._itemSpan();
    return { x: -span * 0.5 + ITEM_HIT * 0.5 + i * (ITEM_HIT + ITEM_GAP), y: 0 };
  }

  private _itemBar(): Node {
    const tray = this._traySize();
    const root = this._mk('Powers', tray.w, tray.h);
    root.active = true;
    this._ensureTray(root, tray.w, tray.h);
    this._ensureItemBtns(root);
    this._raiseItems(root);
    this._paintItems();
    return root;
  }

  private _ensureItemBtns(root: Node): void {
    ITEM_IDS.forEach((id, i) => {
      const n = root.getChildByName(`Item_${id}`) ?? this._itemBtn(root, id, i);
      this._syncItemBtn(n, i);
    });
  }

  private _syncItemBtn(n: Node, i: number): void {
    n.getComponent(UITransform)?.setContentSize(ITEM_HIT, ITEM_HIT);
    const pos = this._itemPos(i);
    n.setPosition(pos.x, pos.y, 0);
    n.getChildByName('Icon')?.getComponent(UITransform)?.setContentSize(ITEM_ICON, ITEM_ICON);
    const badge = n.getChildByName('Badge');
    badge?.setPosition(ITEM_ICON * 0.36, ITEM_ICON * 0.40, 0);
    badge?.getChildByName('Lab')?.setPosition(0, 0, 0);
  }

  private _ensureTray(root: Node, w: number, h: number): Node {
    let tray = root.getChildByName('Tray');
    if (!tray) tray = this._mk('Tray', w, h, root);
    tray.getComponent(UITransform)?.setContentSize(w, h);
    tray.setSiblingIndex(0);
    return tray;
  }

  private _raiseItems(root: Node): void {
    for (const id of ITEM_IDS) {
      const n = root.getChildByName(`Item_${id}`);
      if (n) n.setSiblingIndex(root.children.length - 1);
    }
  }

  private _itemBtn(root: Node, id: ItemId, i: number): Node {
    const n = this._mk(`Item_${id}`, ITEM_HIT, ITEM_HIT, root);
    const pos = this._itemPos(i);
    n.setPosition(pos.x, pos.y, 0);
    this._mk('Icon', ITEM_ICON, ITEM_ICON, n);
    const badge = this._mk('Badge', ITEM_BADGE, ITEM_BADGE, n);
    badge.setPosition(ITEM_ICON * 0.36, ITEM_ICON * 0.40, 0);
    this._mk('Face', ITEM_BADGE, ITEM_BADGE, badge);
    this._lab(this._mk('Lab', ITEM_BADGE, ITEM_BADGE, badge), '+', 30, BADGE_INK, ITEM_BADGE, ITEM_BADGE, false);
    n.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
      e.propagationStopped = true;
    }, this);
    n.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      if (!this._itemOpen(id)) return;
      if (this._guide) {
        const want = this._guide.phase === 'icon' || this._guide.phase === 'target'
          ? this._guide.item
          : null;
        if (want !== id) return;
      }
      gameAudio()?.playUiClick();
      this._onItem?.(id);
    }, this);
    return n;
  }

  private _layoutItems(viewH: number, safeBottom: number): void {
    const root = this.node.getChildByName('Powers');
    if (!root) return;
    const visible = this._visibleIds();
    root.active = visible.length > 0;
    if (!root.active) return;
    const tray = this._traySize();
    root.getComponent(UITransform)?.setContentSize(tray.w, tray.h);
    this._ensureTray(root, tray.w, tray.h);
    this._ensureItemBtns(root);
    this._raiseItems(root);
    root.setPosition(0, -viewH * 0.5 + itemTrayTopFromBottom(viewH, safeBottom) - tray.h * 0.5, 0);
  }

  private _paintItems(): void {
    const root = this.node.getChildByName('Powers');
    if (!root) return;
    const visible = this._visibleIds();
    root.active = visible.length > 0;
    if (!root.active) return;
    const tray = this._traySize();
    applyArtSpriteSoon(this._ensureTray(root, tray.w, tray.h), 'itemTray', tray.w, tray.h, true);
    this._ensureItemBtns(root);
    this._raiseItems(root);
    for (const id of ITEM_IDS) {
      const n = root.getChildByName(`Item_${id}`);
      if (!n) continue;
      const i = visible.indexOf(id);
      n.active = i >= 0;
      if (i < 0) continue;
      this._syncItemBtn(n, i);
      const iconNode = n.getChildByName('Icon');
      applyArtSpriteSoon(iconNode, ITEM_ICON_KEY[id], ITEM_ICON, ITEM_ICON);
      const unlocked = this._itemOpen(id);
      const charges = this._items[id] ?? 0;
      const on = unlocked && charges > 0;
      const armed = unlocked && (
        (id === 'hook' && this._items.hookPick)
        || (id === 'shovel' && this._items.shovelPick)
        || (id === 'bomb' && this._items.bombPick)
      );
      n.setScale(armed ? 1.08 : 1, armed ? 1.08 : 1, 1);
      this._paintItemRing(n.getChildByName('Ring'), armed);
      const icon = iconNode?.getComponent(Sprite);
      if (icon) {
        icon.color = Color.WHITE;
        icon.grayscale = !unlocked;
      }
      this._paintItemBadge(n.getChildByName('Badge'), unlocked, on, charges);
    }
  }

  private _paintItemRing(ring: Node | null, on: boolean): void {
    if (!ring) return;
    ring.active = on;
    const g = ring.getComponent(Graphics);
    if (!g || !on) return;
    g.clear();
    g.strokeColor = new Color(255, 232, 120, 230);
    g.lineWidth = 7;
    g.circle(0, 0, ITEM_ICON * 0.58);
    g.stroke();
  }

  private _paintItemBadge(badge: Node | null, unlocked: boolean, on: boolean, charges = 0): void {
    if (!badge) return;
    badge.active = unlocked;
    if (!unlocked) return;
    const g = badge.getComponent(Graphics);
    if (g) {
      g.clear();
      g.enabled = false;
    }
    applyArtSpriteSoon(badge.getChildByName('Face') ?? badge, 'itemBadge', ITEM_BADGE, ITEM_BADGE);
    const coin = badge.getChildByName('Coin');
    if (coin) coin.active = false;
    const lab = badge.getChildByName('Lab')?.getComponent(Label);
    if (lab) {
      lab.string = on ? String(charges) : '+';
      lab.fontSize = on ? 26 : 32;
      lab.lineHeight = on ? 32 : 36;
      lab.overflow = Label.Overflow.SHRINK;
      lab.color = BADGE_INK;
      lab.outlineColor = new Color(160, 40, 72, 255);
      lab.outlineWidth = 3;
      lab.node.setPosition(0, 1, 0);
    }
  }

  private _scoreBoard(): Node {
    const board = this._mk('ScoreBoard', PLAY_BADGE, PLAY_BADGE);
    this._mk('Board', PLAY_BADGE, PLAY_BADGE, board);
    this._mk('Title', Math.round(PLAY_BADGE * 0.78), Math.round(PLAY_BADGE * 0.52), board);
    layoutHomeLevel(board, this._level, PLAY_BADGE, PLAY_DIGIT_H);
    this._bindScoreBoard();
    return board;
  }

  private _bindScoreBoard(): void {
    const board = this.node.getChildByName('ScoreBoard');
    if (!board) return;
    board.off(Node.EventType.TOUCH_END);
    board.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      this._tapScoreBoard();
    }, this);
  }

  private _tapScoreBoard(): void {
    const now = Date.now();
    if (now - this._gmTapAt > 2000) this._gmTaps = 0;
    this._gmTapAt = now;
    this._gmTaps += 1;
    if (this._gmTaps < 5) return;
    this._gmTaps = 0;
    gameAudio()?.playUiClick();
    this._onRevealGm?.();
  }

  private _mk(name: string, w: number, h: number, parent: Node = this.node): Node {
    const n = new Node(name);
    parent.addChild(n);
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform).setContentSize(w, h);
    return n;
  }

  private _lab(
    node: Node,
    text: string,
    size: number,
    color: Color,
    w: number,
    h: number,
    big: boolean,
  ): Label {
    let lab = node.getComponent(Label);
    if (!lab) lab = node.addComponent(Label);
    lab.string = text;
    if (big) styleQNum(lab, size, color);
    else styleQCaption(lab, size, color);
    fitBox(node, w, h);
    return lab;
  }
}
