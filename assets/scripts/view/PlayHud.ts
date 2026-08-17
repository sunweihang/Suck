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
import { uiSafeInsets, uiVisibleSize } from '../game/ViewFit';
import { fitBox, paintQBtn, styleQCaption, styleQNum } from './QChrome';
import { GOLD_HUD } from './GoldHud';
import { applyArtSprite, applyArtSpriteSoon, layoutHomeLevel } from './UiArt';
import { gameAudio } from '../audio/AudioService';
import type { ItemHudState, ItemId } from '../battle/BattleDirector';
import { itemUnlocked } from '../game/LevelCatalog';

const { ccclass } = _decorator;

const PLAY_BADGE = 360;
const PLAY_DIGIT_H = 92;
const SETTINGS_CIRCLE = 120;
const SETTINGS_GEAR = 56;
const SETTINGS_W = 140;
const SETTINGS_H = 168;
const SETTINGS_INK = new Color(110, 104, 168, 255);
const ITEM_HIT = 192;
const ITEM_ICON = 168;
const ITEM_GAP = 10;
const ITEM_PAD_X = 62;
const ITEM_BADGE = 54;
const ITEM_TRAY_H = 220;
const ITEM_IDS: readonly ItemId[] = ['shuffle', 'merge', 'hook', 'shovel'];
const ITEM_ICON_KEY = {
  shuffle: 'icShuffle',
  merge: 'icMerge',
  hook: 'icHook',
  shovel: 'icShovel',
} as const;
const BADGE_INK = new Color(255, 255, 255, 255);

@ccclass('PlayHud')
export class PlayHud extends Component {
  private _built = false;
  private _level = 1;
  private _onHome: (() => void) | null = null;
  private _onNext: (() => void) | null = null;
  private _onSettings: (() => void) | null = null;
  private _onItem: ((id: ItemId) => void) | null = null;
  private _items: ItemHudState = {
    coins: 0,
    shuffle: 1,
    merge: 1,
    hook: 1,
    shovel: 1,
    hookPick: false,
    shovelPick: false,
  };

  setup(opts: {
    onHome: () => void;
    onNext?: () => void;
    onSettings?: () => void;
    onItem?: (id: ItemId) => void;
  }): void {
    this._onHome = opts.onHome;
    this._onNext = opts.onNext ?? null;
    this._onSettings = opts.onSettings ?? null;
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
    this.layoutChrome();
  }

  show(): void {
    this.node.active = true;
    const next = this.node.getChildByName('NextBtn');
    if (next) next.active = false;
    this._syncTip();
    this.layoutChrome();
    this._paintItems();
  }

  hide(): void {
    this.node.active = false;
  }

  applyArt(): void {
    this._ensureTree();
    layoutHomeLevel(this.node.getChildByName('ScoreBoard'), this._level, PLAY_BADGE, PLAY_DIGIT_H);
    this._paintSettings();
  }

  setLevel(n: number): void {
    this._level = n;
    layoutHomeLevel(this.node.getChildByName('ScoreBoard'), n, PLAY_BADGE, PLAY_DIGIT_H);
    this._syncTip();
    this._paintItems();
    this.layoutChrome();
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
    this.hintHand?.hide();
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
    this.node.getChildByName('ScoreBoard')?.setPosition(0, chromeY, 0);
    this.node.getChildByName('TipLab')?.setPosition(0, chromeY - PLAY_DIGIT_H - 16, 0);
    this.node.getChildByName('WinLabel')?.setPosition(0, 80, 0);
    this.node.getChildByName('NextBtn')?.setPosition(0, -80, 0);
    const settings = this.node.getChildByName('SettingsBtn');
    if (settings) {
      settings.active = true;
      settings.setPosition(
        -vis.w * 0.5 + SETTINGS_W * 0.5 + safe.left + pad,
        chromeY - 24,
        0,
      );
    }
    this._layoutItems(vis.h, safe.bottom);
  }

  private _syncTip(): void {
    const tip = this.node.getChildByName('TipLab');
    if (tip) tip.active = false;
    const hint = this.node.getChildByName('HintHand');
    if (hint) hint.active = false;
    this.hintHand?.hide();
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

    const tip = this._mk('TipLab', 880, 56);
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
    hand.addComponent(HintHand);
    hand.active = false;
  }

  private _settingsBtn(): Node {
    const n = this._mk('SettingsBtn', SETTINGS_W, SETTINGS_H);
    const bg = this._mk('Bg', SETTINGS_CIRCLE, SETTINGS_CIRCLE, n);
    bg.setPosition(0, 24, 0);
    const gear = this._mk('Gear', SETTINGS_GEAR, SETTINGS_GEAR, n);
    gear.setPosition(0, 24, 0);
    const labN = this._mk('SettingsLabel', 120, 40, n);
    labN.setPosition(0, -64, 0);
    this._lab(labN, '设置', 28, SETTINGS_INK, 120, 40, false);
    const lab = labN.getComponent(Label);
    if (lab) {
      lab.outlineColor = Color.WHITE;
      lab.outlineWidth = 3;
    }
    this._paintSettings();
    return n;
  }

  private _paintSettings(): void {
    const n = this.node.getChildByName('SettingsBtn');
    if (!n) return;
    applyArtSprite(n.getChildByName('Bg'), 'settingsBg', SETTINGS_CIRCLE, SETTINGS_CIRCLE);
    applyArtSprite(n.getChildByName('Gear'), 'settingsGear', SETTINGS_GEAR, SETTINGS_GEAR);
    this._paintItems();
  }

  setItems(state: ItemHudState): void {
    this._items = { ...state };
    this._paintItems();
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
    n.getChildByName('Ring')?.getComponent(UITransform)?.setContentSize(ITEM_HIT + 8, ITEM_HIT + 8);
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
    const ring = this._mk('Ring', ITEM_HIT + 8, ITEM_HIT + 8, n);
    ring.addComponent(Graphics);
    ring.active = false;
    const badge = this._mk('Badge', ITEM_BADGE, ITEM_BADGE, n);
    badge.setPosition(ITEM_ICON * 0.36, ITEM_ICON * 0.40, 0);
    this._mk('Face', ITEM_BADGE, ITEM_BADGE, badge);
    this._lab(this._mk('Lab', ITEM_BADGE, ITEM_BADGE, badge), '+', 30, BADGE_INK, ITEM_BADGE, ITEM_BADGE, false);
    n.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
      e.propagationStopped = true;
    }, this);
    n.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      if (!itemUnlocked(id, this._level)) return;
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
    root.setPosition(0, -viewH * 0.5 + safeBottom + tray.h * 0.5 + 16, 0);
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
      const unlocked = itemUnlocked(id, this._level);
      const charges = this._items[id] ?? 0;
      const on = unlocked && charges > 0;
      const armed = unlocked && ((id === 'hook' && this._items.hookPick) || (id === 'shovel' && this._items.shovelPick));
      n.setScale(armed ? 1.08 : 1, armed ? 1.08 : 1, 1);
      const icon = iconNode?.getComponent(Sprite);
      if (icon) {
        icon.color = Color.WHITE;
        icon.grayscale = !unlocked;
      }
      this._paintItemRing(n.getChildByName('Ring'), armed);
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
    return board;
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
