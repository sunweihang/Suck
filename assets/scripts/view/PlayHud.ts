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
  UIOpacity,
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
import { applyAdIcon, applyArtSpriteSoon, ensureBtnChrome, layoutHomeLevel, VOLCANO_BTN_H, VOLCANO_BTN_W } from './UiArt';
import { gameAudio } from '../audio/AudioService';
import { openGameCircle } from '../ads/GameCircleService';
import type { ItemHudState, ItemId } from '../battle/BattleDirector';
import { boostLeft } from '../game/Boost';
import { freeSpinLeft } from '../game/FreeSpin';
import { itemUnlocked } from '../game/LevelCatalog';
import type { GuideView } from '../game/TutorialGuide';

const { ccclass } = _decorator;

const PLAY_BADGE = 360;
const PLAY_DIGIT_H = 92;
const SETTINGS_CIRCLE = 160;
const SETTINGS_GEAR = 75;
const SIDE_ART = 108;
const SETTINGS_W = 187;
const SETTINGS_H = 224;
const SETTINGS_LAB_W = 160;
const SETTINGS_LAB_H = 53;
const SETTINGS_LAB_SIZE = 37;
const SETTINGS_ICON_Y = 32;
const SETTINGS_LAB_Y = -35;
const SETTINGS_INK = new Color(110, 104, 168, 255);
const SIDE_PITCH = SETTINGS_CIRCLE + 28;
const SPIN_W = 131;
const SPIN_H = 147;
const SPIN_ICON = 112;
const SPIN_ICON_Y = 19;
const SPIN_LAB_Y = -41;
const SPIN_LAB_W = 107;
const SPIN_LAB_H = 35;
const SPIN_LAB_SIZE = 25;
const SPIN_DOCK_GAP = 19;
const SPIN_AD_H = 35;
const SPIN_TIMER_W = 100;
const SPIN_TIMER_H = 31;
const SPIN_TIMER_SIZE = 23;
const SPIN_TIMER_INK = new Color(255, 255, 255, 255);
const SPIN_TIMER_OUTLINE = new Color(48, 32, 88, 255);
const ITEM_HIT = 192;
const ITEM_ICON = 168;
const ITEM_ICON_Y = 20;
const ITEM_GAP = 10;
const ITEM_PAD_X = 62;
const ITEM_BADGE = 54;
const ITEM_NAME_W = 180;
const ITEM_NAME_H = 38;
const ITEM_NAME_Y = -82;
const ITEM_NAME_SIZE = 32;
const ITEM_TRAY_H = PLAY_ITEM_BAR.trayH;
const CANCEL_W = VOLCANO_BTN_W;
const CANCEL_H = VOLCANO_BTN_H;
const CANCEL_GAP = 10;
const CANCEL_INK = new Color(255, 255, 255, 255);
const CANCEL_OUTLINE = new Color(88, 48, 16, 255);
const ITEM_IDS: readonly ItemId[] = ['shuffle', 'hook', 'shovel', 'bomb'];
const ITEM_ICON_KEY = {
  shuffle: 'icShuffle',
  hook: 'icHook',
  shovel: 'icShovel',
  bomb: 'icBomb',
} as const;
const ITEM_NAME: Record<ItemId, string> = {
  shuffle: '洗牌',
  hook: '机械爪',
  shovel: '铲子',
  bomb: '炸弹',
};
const BADGE_INK = new Color(255, 255, 255, 255);
const TIP_W = 820;
const TIP_H = 120;
const TIP_INK = Theme.playText;
const TIP_OUTLINE = Theme.playStroke;
const PICK_DIM = new Color(16, 10, 32, 108);
const PICK_TIP: Record<'hook' | 'shovel' | 'bomb', string> = {
  hook: '点击后方的炮塔',
  shovel: '点击场上的炮塔',
  bomb: '点击墙上的砖块，炸掉同色',
};
const _guidePos = new Vec3();

@ccclass('PlayHud')
export class PlayHud extends Component {
  private _built = false;
  private _level = 1;
  private _onHome: (() => void) | null = null;
  private _onNext: (() => void) | null = null;
  private _onSettings: (() => void) | null = null;
  private _onRank: (() => void) | null = null;
  private _onRevealGm: (() => void) | null = null;
  private _onItem: ((id: ItemId) => void) | null = null;
  private _onCancelPick: (() => void) | null = null;
  private _onFreeSpin: (() => void) | null = null;
  private _onBoost: (() => void) | null = null;
  private _onPickChrome: ((hidden: boolean) => void) | null = null;
  private _dockTopFromBottom: (() => number) | null = null;
  private _spinShown = -1;
  private _boostShown = -1;
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
    canShovel: false,
  };
  private _guide: GuideView | null = null;
  private _ugc = false;
  private _chromeOn = true;
  private _armedId: ItemId | null = null;
  private _pickShadeOn = false;
  private readonly _heldUnlock = new Set<ItemId>();

  setup(opts: {
    onHome: () => void;
    onNext?: () => void;
    onSettings?: () => void;
    onRank?: () => void;
    onRevealGm?: () => void;
    onItem?: (id: ItemId) => void;
    onCancelPick?: () => void;
    onFreeSpin?: () => void;
    onBoost?: () => void;
    onPickChrome?: (hidden: boolean) => void;
    dockTopFromBottom?: () => number;
  }): void {
    this._onHome = opts.onHome;
    this._onNext = opts.onNext ?? null;
    this._onSettings = opts.onSettings ?? null;
    this._onRank = opts.onRank ?? null;
    this._onRevealGm = opts.onRevealGm ?? null;
    this._onItem = opts.onItem ?? null;
    this._onCancelPick = opts.onCancelPick ?? null;
    this._onFreeSpin = opts.onFreeSpin ?? null;
    this._onBoost = opts.onBoost ?? null;
    this._onPickChrome = opts.onPickChrome ?? null;
    this._dockTopFromBottom = opts.dockTopFromBottom ?? null;
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
    this._bindSideBtns();
    this._bindSpinBtn();
    this._bindBoostBtn();
    this._bindScoreBoard();
    this._bindCancelPick();
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
    this._paintSpin(true);
  }

  hide(): void {
    this._guide = null;
    this._heldUnlock.clear();
    this._items.hookPick = false;
    this._items.shovelPick = false;
    this._items.bombPick = false;
    this._chromeOn = true;
    this.node.active = false;
    this._syncPlayChrome();
    this._setPickShade(false);
    this.hintHand?.hide();
  }

  applyArt(): void {
    this._ensureTree();
    layoutHomeLevel(this.node.getChildByName('ScoreBoard'), this._level, PLAY_BADGE, PLAY_DIGIT_H);
    this._paintSettings();
    this._paintSpin(true);
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
    const spin = this.node.getChildByName('SpinBtn');
    if (spin) spin.active = !on;
    const boost = this.node.getChildByName('BoostBtn');
    if (boost) boost.active = !on;
  }

  showCleared(_cleared: number, _hasNext: boolean): void {
    const win = this.node.getChildByName('WinLabel');
    if (win) win.active = false;
    const next = this.node.getChildByName('NextBtn');
    if (next) next.active = false;
    const tip = this.node.getChildByName('TipLab');
    if (tip) tip.active = false;
    this._items.hookPick = false;
    this._items.shovelPick = false;
    this._items.bombPick = false;
    this._syncTip();
    const powers = this.node.getChildByName('Powers');
    if (powers) powers.active = false;
    const cancel = this.node.getChildByName('CancelPick');
    if (cancel) cancel.active = false;
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
      board.active = !this._ugc && this._playChromeOn();
      board.setPosition(0, chromeY, 0);
    }
    this.node.getChildByName('TipLab')?.setPosition(0, chromeY - PLAY_BADGE * 0.5 - 68, 0);
    this._layoutPickDim(vis.w, vis.h);
    this._syncPlayChrome();
    this.node.getChildByName('WinLabel')?.setPosition(0, 80, 0);
    this.node.getChildByName('NextBtn')?.setPosition(0, -80, 0);
    const rightX = vis.w * 0.5 - SETTINGS_W * 0.5 - safe.right - pad;
    const settingsY = chromeY - GOLD_HUD.rootH - 88;
    this._layoutSideBtns(rightX, settingsY);
    this._layoutSpin(vis.w, vis.h, safe.left, safe.bottom, pad);
    this._layoutItems(vis.h, safe.bottom);
    this._layoutCancel(vis.h, safe.bottom);
    this._placeGuideHand();
  }

  update(): void {
    if (!this.node.active) return;
    if (this._pickFocus()) {
      this._syncPlayChrome();
      return;
    }
    if (!this._chromeOn) return;
    this._paintSpin(false);
    const vis = uiVisibleSize();
    const safe = uiSafeInsets();
    this._layoutSpin(vis.w, vis.h, safe.left, safe.bottom, GOLD_HUD.pad);
  }

  private _pickFocus(): boolean {
    return !this._ugc && this._pickArmed();
  }

  private _playChromeOn(): boolean {
    return this._chromeOn && !this._pickFocus();
  }

  setChromeVisible(on: boolean): void {
    if (this._chromeOn === on) {
      this._syncPlayChrome();
      return;
    }
    this._chromeOn = on;
    this._syncPlayChrome();
    if (!on || !this.node.active) return;
    this.layoutChrome();
    this._syncTip();
    this._paintItems();
    this._paintSpin(true);
  }

  private _syncTip(): void {
    this._syncPlayChrome();
    this._setPickShade(this._pickFocus());
  }

  private _syncPlayChrome(): void {
    const on = this._playChromeOn();
    const board = this.node.getChildByName('ScoreBoard');
    if (board) board.active = on && !this._ugc;
    for (const name of ['SettingsBtn', 'HomeBtn', 'ClubBtn', 'RankBtn'] as const) {
      const n = this.node.getChildByName(name);
      if (n) n.active = on && (name !== 'RankBtn' || !this._ugc);
    }
    const spin = this.node.getChildByName('SpinBtn');
    if (spin) spin.active = on && !this._ugc;
    const boost = this.node.getChildByName('BoostBtn');
    if (boost) boost.active = on && !this._ugc;
    const powers = this.node.getChildByName('Powers');
    if (powers) powers.active = on && this._visibleIds().length > 0;
    this._syncCancel();
    if (!on) this.hintHand?.hide();
    this._onPickChrome?.(!on && this.node.active);
  }

  private _paintTip(): void {
    const tip = this.node.getChildByName('TipLab');
    if (!tip) return;
    applyArtSpriteSoon(tip.getChildByName('Face') ?? tip, 'tipBase', TIP_W, TIP_H, true);
  }

  private _pickDim(): Node {
    const vis = uiVisibleSize();
    const n = this._mk('PickDim', vis.w, vis.h);
    n.setSiblingIndex(0);
    n.active = false;
    const fade = n.addComponent(UIOpacity);
    fade.opacity = 0;
    const ut = n.getComponent(UITransform);
    if (ut) ut.hitTest = () => false;
    const w = n.addComponent(Widget);
    w.isAlignTop = w.isAlignBottom = w.isAlignLeft = w.isAlignRight = true;
    w.top = w.bottom = w.left = w.right = 0;
    w.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    this._fillPickDim(n, vis.w, vis.h);
    return n;
  }

  private _layoutPickDim(viewW: number, viewH: number): void {
    const n = this.node.getChildByName('PickDim');
    if (!n) return;
    n.getComponent(UITransform)?.setContentSize(viewW, viewH);
    n.setSiblingIndex(0);
    this._fillPickDim(n, viewW, viewH);
  }

  private _fillPickDim(node: Node, w: number, h: number): void {
    let g = node.getComponent(Graphics);
    if (!g) g = node.addComponent(Graphics);
    g.clear();
    g.fillColor = PICK_DIM;
    g.rect(-w * 0.5, -h * 0.5, w, h);
    g.fill();
  }

  private _writePickTip(): void {
    const tip = this.node.getChildByName('TipLab');
    const lab = tip?.getChildByName('Lab')?.getComponent(Label);
    if (!lab) return;
    if (this._guide?.tip) {
      lab.string = this._guide.tip;
      return;
    }
    const id = this._items.hookPick ? 'hook'
      : this._items.shovelPick ? 'shovel'
        : this._items.bombPick ? 'bomb'
          : null;
    lab.string = id ? PICK_TIP[id] : PICK_TIP.bomb;
  }

  private _setPickShade(on: boolean): void {
    const dim = this.node.getChildByName('PickDim');
    const tip = this.node.getChildByName('TipLab');
    if (on === this._pickShadeOn) {
      if (on) this._writePickTip();
      return;
    }
    this._pickShadeOn = on;
    if (dim) Tween.stopAllByTarget(dim.getComponent(UIOpacity) ?? dim);
    if (tip) {
      Tween.stopAllByTarget(tip);
      Tween.stopAllByTarget(tip.getComponent(UIOpacity) ?? tip);
    }
    if (!on) {
      if (dim) {
        dim.active = false;
        const fade = dim.getComponent(UIOpacity);
        if (fade) fade.opacity = 0;
      }
      if (tip) {
        tip.active = false;
        tip.setScale(1, 1, 1);
        const fade = tip.getComponent(UIOpacity);
        if (fade) fade.opacity = 0;
      }
      this._syncCancel();
      return;
    }
    this._paintTip();
    this._writePickTip();
    if (dim) {
      dim.active = false;
      const fade = dim.getComponent(UIOpacity);
      if (fade) fade.opacity = 0;
    }
    if (tip) {
      tip.active = true;
      const fade = tip.getComponent(UIOpacity) ?? tip.addComponent(UIOpacity);
      fade.opacity = 0;
      tip.setScale(0.86, 0.86, 1);
      tween(fade).delay(0.22).to(0.2, { opacity: 255 }).start();
      tween(tip)
        .delay(0.22)
        .to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
        .start();
    }
    this._syncCancel();
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
    this._homeBtn();
    this._clubBtn();
    this._rankBtn();
    this._paintSettings();
    this._boostBtn();
    this._spinBtn();

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
    const tipUt = tip.getComponent(UITransform);
    if (tipUt) tipUt.hitTest = () => false;
    if (!tip.getComponent(UIOpacity)) tip.addComponent(UIOpacity);
    tip.active = false;

    const win = this._mk('WinLabel', 860, 96);
    win.active = false;
    this._lab(win, '墙体已拆完', 64, Theme.boardNum, 860, 96, true);

    const next = this._mk('NextBtn', 400, 108);
    next.active = false;
    paintQBtn(next.addComponent(Graphics), 400, 108, Theme.playFill, Theme.boardStroke);
    this._lab(next, '下一关', 44, Theme.playText, 400, 108, false);

    this._pickDim();
    this._itemBar();
    this._cancelBtn();

    const hand = this._mk('HintHand', 160, 220);
    hand.active = false;
    hand.addComponent(HintHand);
  }

  private _settingsBtn(): Node {
    const n = this._sideBtn('SettingsBtn', 'SettingsLabel', 'Gear', '设置');
    this._paintSideBtn('SettingsBtn', 'SettingsLabel', 'Gear', 'icHudGear', SIDE_ART);
    return n;
  }

  private _homeBtn(): Node {
    const n = this._sideBtn('HomeBtn', 'HomeLabel', 'Icon', '主界面');
    this._paintSideBtn('HomeBtn', 'HomeLabel', 'Icon', 'icHudHome', SIDE_ART);
    return n;
  }

  private _clubBtn(): Node {
    const n = this._sideBtn('ClubBtn', 'ClubLabel', 'Icon', '游戏圈');
    this._paintSideBtn('ClubBtn', 'ClubLabel', 'Icon', 'icHudClub', SIDE_ART);
    return n;
  }

  private _rankBtn(): Node {
    const n = this._sideBtn('RankBtn', 'RankLabel', 'Icon', '排行榜');
    this._paintSideBtn('RankBtn', 'RankLabel', 'Icon', 'icHudRank', SIDE_ART);
    return n;
  }

  private _sideBtn(name: string, labName: string, iconName: string, text: string): Node {
    let n = this.node.getChildByName(name);
    if (!n) {
      n = this._mk(name, SETTINGS_W, SETTINGS_H);
      this._mk('Bg', SETTINGS_CIRCLE, SETTINGS_CIRCLE, n);
      this._mk(iconName, SETTINGS_GEAR, SETTINGS_GEAR, n);
      const labN = this._mk(labName, SETTINGS_LAB_W, SETTINGS_LAB_H, n);
      this._lab(labN, text, SETTINGS_LAB_SIZE, SETTINGS_INK, SETTINGS_LAB_W, SETTINGS_LAB_H, false);
      const lab = labN.getComponent(Label);
      if (lab) {
        lab.outlineColor = Color.WHITE;
        lab.outlineWidth = 4;
        lab.overflow = Label.Overflow.SHRINK;
      }
    }
    this._syncSideBtn(n, labName, iconName, SETTINGS_GEAR);
    return n;
  }

  private _layoutSideBtns(rightX: number, settingsY: number): void {
    this._homeBtn();
    this._clubBtn();
    this._rankBtn();
    const rows: readonly [string, string, string, number][] = [
      ['SettingsBtn', 'SettingsLabel', 'Gear', SIDE_ART],
      ['HomeBtn', 'HomeLabel', 'Icon', SIDE_ART],
      ['ClubBtn', 'ClubLabel', 'Icon', SIDE_ART],
      ['RankBtn', 'RankLabel', 'Icon', SIDE_ART],
    ];
    rows.forEach(([name, lab, icon, size], i) => {
      const n = this.node.getChildByName(name);
      if (!n) return;
      n.active = this._playChromeOn() && (name !== 'RankBtn' || !this._ugc);
      this._syncSideBtn(n, lab, icon, size);
      n.setPosition(rightX, settingsY - i * SIDE_PITCH, 0);
    });
    this._bindSideBtns();
  }

  private _bindSideBtns(): void {
    this._bindTap(this.node.getChildByName('SettingsBtn'), () => this._onSettings?.());
    this._bindTap(this.node.getChildByName('HomeBtn'), () => this._onHome?.());
    this._bindTap(this.node.getChildByName('ClubBtn'), () => openGameCircle());
    this._bindTap(this.node.getChildByName('RankBtn'), () => this._onRank?.());
  }

  private _bindTap(node: Node | null | undefined, onTap: () => void): void {
    if (!node) return;
    node.off(Node.EventType.TOUCH_END);
    node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      gameAudio()?.playUiClick();
      onTap();
    }, this);
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
      lab.overflow = Label.Overflow.SHRINK;
    }
  }

  private _paintSettings(): void {
    this._paintSideBtn('SettingsBtn', 'SettingsLabel', 'Gear', 'icHudGear', SIDE_ART);
    this._paintSideBtn('HomeBtn', 'HomeLabel', 'Icon', 'icHudHome', SIDE_ART);
    this._paintSideBtn('ClubBtn', 'ClubLabel', 'Icon', 'icHudClub', SIDE_ART);
    this._paintSideBtn('RankBtn', 'RankLabel', 'Icon', 'icHudRank', SIDE_ART);
    this._paintSpin(true);
    this._paintItems();
  }

  private _paintSideBtn(
    name: string,
    labName: string,
    iconName: string,
    iconKey: 'icHudGear' | 'icHudHome' | 'icHudClub' | 'icHudRank',
    iconSize = SETTINGS_GEAR,
  ): void {
    const n = this.node.getChildByName(name);
    if (!n) return;
    this._syncSideBtn(n, labName, iconName, iconSize);
    applyArtSpriteSoon(n.getChildByName('Bg'), 'settingsBg', SETTINGS_CIRCLE, SETTINGS_CIRCLE);
    applyArtSpriteSoon(n.getChildByName(iconName), iconKey, iconSize, iconSize);
  }

  private _boostBtn(): Node {
    return this._adTimerBtn('BoostBtn', '加速', () => this._onBoost?.());
  }

  private _spinBtn(): Node {
    return this._adTimerBtn('SpinBtn', '自由旋转', () => this._onFreeSpin?.());
  }

  private _adTimerBtn(name: string, caption: string, tap: () => void): Node {
    const n = this._mk(name, SPIN_W, SPIN_H);
    const bg = this._mk('Bg', SETTINGS_CIRCLE, SETTINGS_CIRCLE, n);
    bg.active = false;
    this._mk('Icon', SPIN_ICON, SPIN_ICON, n);
    this._spinAd(n);
    const timer = this._mk('Timer', SPIN_TIMER_W, SPIN_TIMER_H, n);
    this._lab(timer, '00:00', SPIN_TIMER_SIZE, SPIN_TIMER_INK, SPIN_TIMER_W, SPIN_TIMER_H, false);
    const timerLab = timer.getComponent(Label);
    if (timerLab) {
      timerLab.outlineColor = SPIN_TIMER_OUTLINE;
      timerLab.outlineWidth = 3;
    }
    const labN = this._mk('Caption', SPIN_LAB_W, SPIN_LAB_H, n);
    this._lab(labN, caption, SPIN_LAB_SIZE, SETTINGS_INK, SPIN_LAB_W, SPIN_LAB_H, false);
    const lab = labN.getComponent(Label);
    if (lab) {
      lab.outlineColor = Color.WHITE;
      lab.outlineWidth = 3;
    }
    timer.active = false;
    this._syncSpinBtn(n);
    this._placeSpinExtras(n);
    this._bindAdTimer(n, tap);
    this._paintAdTimer(
      n,
      name === 'BoostBtn' ? 'icBoost' : 'icFreeSpin',
      0,
      true,
      name === 'BoostBtn' ? 'boost' : 'spin',
    );
    return n;
  }

  private _layoutSpin(viewW: number, viewH: number, safeLeft: number, safeBottom: number, pad: number): void {
    const spin = this.node.getChildByName('SpinBtn');
    const boost = this.node.getChildByName('BoostBtn');
    const leftX = -viewW * 0.5 + SPIN_W * 0.5 + safeLeft + Math.min(20, pad);
    const measured = this._dockTopFromBottom?.() ?? 0;
    const dockTop = measured > 0
      ? measured
      : itemTrayTopFromBottom(viewH, safeBottom) + 280;
    const textBottom = SPIN_LAB_Y - SPIN_LAB_H * 0.5;
    const spinY = -viewH * 0.5 + dockTop + SPIN_DOCK_GAP - textBottom;
    const on = !this._ugc && this._playChromeOn();
    if (spin) {
      spin.active = on;
      this._syncSpinBtn(spin);
      this._placeSpinExtras(spin);
      spin.setPosition(leftX, spinY, 0);
    }
    if (boost) {
      boost.active = on;
      this._syncSpinBtn(boost);
      this._placeSpinExtras(boost);
      boost.setPosition(leftX, spinY + SPIN_H, 0);
    }
  }

  private _syncSpinBtn(n: Node): void {
    n.getComponent(UITransform)?.setContentSize(SPIN_W, SPIN_H);
    const bg = n.getChildByName('Bg');
    if (bg) bg.active = false;
    const icon = n.getChildByName('Icon');
    icon?.getComponent(UITransform)?.setContentSize(SPIN_ICON, SPIN_ICON);
    icon?.setPosition(0, SPIN_ICON_Y, 0);
    const labN = n.getChildByName('Caption') ?? n.getChildByName('SpinLabel');
    labN?.getComponent(UITransform)?.setContentSize(SPIN_LAB_W, SPIN_LAB_H);
    labN?.setPosition(0, SPIN_LAB_Y, 0);
    const lab = labN?.getComponent(Label);
    if (lab) {
      lab.fontSize = SPIN_LAB_SIZE;
      lab.lineHeight = SPIN_LAB_SIZE;
      lab.outlineWidth = 3;
    }
  }

  private _bindSpinBtn(): void {
    const n = this.node.getChildByName('SpinBtn');
    if (n) this._bindAdTimer(n, () => this._onFreeSpin?.());
  }

  private _bindBoostBtn(): void {
    const n = this.node.getChildByName('BoostBtn');
    if (n) this._bindAdTimer(n, () => this._onBoost?.());
  }

  private _bindAdTimer(n: Node, tap: () => void): void {
    n.off(Node.EventType.TOUCH_START);
    n.off(Node.EventType.TOUCH_CANCEL);
    n.off(Node.EventType.TOUCH_END);
    n.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
      e.propagationStopped = true;
      n.setScale(0.92, 0.92, 1);
    }, this);
    n.on(Node.EventType.TOUCH_CANCEL, () => n.setScale(1, 1, 1), this);
    n.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      n.setScale(1, 1, 1);
      if (this._ugc) return;
      gameAudio()?.playUiClick();
      tap();
    }, this);
  }

  private _spinAd(n: Node): Node {
    const leftover = n.getChildByName('Plus');
    if (leftover) leftover.active = false;
    let ad = n.getChildByName('Ad');
    if (!ad) ad = this._mk('Ad', Math.round(SPIN_AD_H * 1.41), SPIN_AD_H, n);
    ad.setSiblingIndex(n.children.length - 1);
    return ad;
  }

  private _placeSpinExtras(n: Node): void {
    const ad = this._spinAd(n);
    applyAdIcon(ad, SPIN_AD_H);
    ad.setPosition(-SPIN_ICON * 0.40, SPIN_ICON_Y + SPIN_ICON * 0.36, 0);
    const timer = n.getChildByName('Timer');
    timer?.getComponent(UITransform)?.setContentSize(SPIN_TIMER_W, SPIN_TIMER_H);
    timer?.setPosition(0, SPIN_ICON_Y, 0);
  }

  private _paintSpin(force: boolean): void {
    this._paintAdTimer(
      this.node.getChildByName('SpinBtn'),
      'icFreeSpin',
      freeSpinLeft(),
      force,
      'spin',
    );
    this._paintAdTimer(
      this.node.getChildByName('BoostBtn'),
      'icBoost',
      boostLeft(),
      force,
      'boost',
    );
  }

  private _paintAdTimer(
    n: Node | null,
    icon: 'icFreeSpin' | 'icBoost',
    left: number,
    force: boolean,
    slot: 'spin' | 'boost',
  ): void {
    if (!n) return;
    n.active = !this._ugc && this._playChromeOn();
    if (!n.active) return;
    if (force) {
      this._syncSpinBtn(n);
      this._placeSpinExtras(n);
      applyArtSpriteSoon(n.getChildByName('Icon'), icon, SPIN_ICON, SPIN_ICON);
    }
    const shown = left > 0 ? Math.ceil(left) : 0;
    if (!force && shown === (slot === 'boost' ? this._boostShown : this._spinShown)) return;
    if (slot === 'boost') this._boostShown = shown;
    else this._spinShown = shown;
    const on = shown > 0;
    const ad = n.getChildByName('Ad');
    if (ad) ad.active = !on;
    const timer = n.getChildByName('Timer');
    if (timer) timer.active = on;
    const lab = timer?.getComponent(Label);
    if (lab && on) {
      const m = Math.floor(shown / 60);
      const s = shown % 60;
      lab.string = `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
  }

  setItems(state: ItemHudState): void {
    this._items = { ...state };
    this._syncTip();
    this._paintItems();
  }

  holdUnlock(id: ItemId): void {
    this._heldUnlock.add(id);
    this._syncTip();
    this._paintItems();
  }

  releaseUnlock(id: ItemId): void {
    if (!this._heldUnlock.delete(id)) return;
    this._syncTip();
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
      this._syncItemBtn(n, id, i);
    });
  }

  private _syncItemBtn(n: Node, id: ItemId, i: number): void {
    n.getComponent(UITransform)?.setContentSize(ITEM_HIT, ITEM_TRAY_H);
    const pos = this._itemPos(i);
    n.setPosition(pos.x, pos.y, 0);
    const icon = n.getChildByName('Icon');
    icon?.getComponent(UITransform)?.setContentSize(ITEM_ICON, ITEM_ICON);
    icon?.setPosition(0, ITEM_ICON_Y, 0);
    const badge = n.getChildByName('Badge');
    badge?.setPosition(ITEM_ICON * 0.36, ITEM_ICON_Y + ITEM_ICON * 0.40, 0);
    badge?.getChildByName('Lab')?.setPosition(0, 0, 0);
    this._ensureItemName(n, id);
  }

  private _ensureItemName(n: Node, id: ItemId): void {
    let labN = n.getChildByName('Name');
    if (!labN) {
      labN = this._mk('Name', ITEM_NAME_W, ITEM_NAME_H, n);
      this._lab(labN, ITEM_NAME[id], ITEM_NAME_SIZE, SETTINGS_INK, ITEM_NAME_W, ITEM_NAME_H, false);
    }
    labN.getComponent(UITransform)?.setContentSize(ITEM_NAME_W, ITEM_NAME_H);
    labN.setPosition(0, ITEM_NAME_Y, 0);
    const lab = labN.getComponent(Label);
    if (!lab) return;
    lab.string = ITEM_NAME[id];
    lab.fontSize = ITEM_NAME_SIZE;
    lab.lineHeight = ITEM_NAME_SIZE;
    lab.color = SETTINGS_INK;
    lab.outlineColor = Color.WHITE;
    lab.outlineWidth = 4;
    lab.overflow = Label.Overflow.SHRINK;
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
    const n = this._mk(`Item_${id}`, ITEM_HIT, ITEM_TRAY_H, root);
    const pos = this._itemPos(i);
    n.setPosition(pos.x, pos.y, 0);
    const icon = this._mk('Icon', ITEM_ICON, ITEM_ICON, n);
    icon.setPosition(0, ITEM_ICON_Y, 0);
    const badge = this._mk('Badge', ITEM_BADGE, ITEM_BADGE, n);
    badge.setPosition(ITEM_ICON * 0.36, ITEM_ICON_Y + ITEM_ICON * 0.40, 0);
    this._mk('Face', ITEM_BADGE, ITEM_BADGE, badge);
    this._lab(this._mk('Lab', ITEM_BADGE, ITEM_BADGE, badge), '+', 30, BADGE_INK, ITEM_BADGE, ITEM_BADGE, false);
    this._ensureItemName(n, id);
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
    root.active = visible.length > 0 && this._playChromeOn();
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
    root.active = visible.length > 0 && this._playChromeOn();
    if (!root.active) return;
    const tray = this._traySize();
    applyArtSpriteSoon(this._ensureTray(root, tray.w, tray.h), 'itemTray', tray.w, tray.h, true);
    this._ensureItemBtns(root);
    this._raiseItems(root);
    const nextArmed: ItemId | null =
      this._items.hookPick ? 'hook'
        : this._items.shovelPick ? 'shovel'
          : this._items.bombPick ? 'bomb'
            : null;
    for (const id of ITEM_IDS) {
      const n = root.getChildByName(`Item_${id}`);
      if (!n) continue;
      const i = visible.indexOf(id);
      n.active = i >= 0;
      if (i < 0) continue;
      this._syncItemBtn(n, id, i);
      const iconNode = n.getChildByName('Icon');
      applyArtSpriteSoon(iconNode, ITEM_ICON_KEY[id], ITEM_ICON, ITEM_ICON);
      const unlocked = this._itemOpen(id);
      const charges = this._items[id] ?? 0;
      const on = unlocked && charges > 0;
      const armed = unlocked && id === nextArmed;
      const leftover = n.getChildByName('Ring');
      if (leftover) leftover.active = false;
      if (armed !== (this._armedId === id)) this._pulseArmed(n, armed);
      const icon = iconNode?.getComponent(Sprite);
      if (icon) {
        icon.color = Color.WHITE;
        icon.grayscale = !unlocked || (id === 'shovel' && !this._items.canShovel);
      }
      this._paintItemBadge(n.getChildByName('Badge'), unlocked, on, charges);
    }
    this._armedId = nextArmed && this._itemOpen(nextArmed) ? nextArmed : null;
    this._syncCancel();
  }

  private _pickArmed(): boolean {
    return this._items.hookPick || this._items.shovelPick || this._items.bombPick;
  }

  private _cancelBtn(): Node {
    const n = this._mk('CancelPick', CANCEL_W, CANCEL_H);
    n.active = false;
    this._mk('Label', CANCEL_W - 24, CANCEL_H - 16, n);
    this._paintCancel();
    return n;
  }

  private _bindCancelPick(): void {
    const n = this.node.getChildByName('CancelPick');
    if (!n) return;
    n.off(Node.EventType.TOUCH_START);
    n.off(Node.EventType.TOUCH_END);
    n.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
      e.propagationStopped = true;
    }, this);
    n.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      if (!this._pickArmed()) return;
      gameAudio()?.playUiClick();
      this._onCancelPick?.();
    }, this);
  }

  private _layoutCancel(viewH: number, safeBottom: number): void {
    const n = this.node.getChildByName('CancelPick');
    if (!n) return;
    n.getComponent(UITransform)?.setContentSize(CANCEL_W, CANCEL_H);
    const trayTop = -viewH * 0.5 + itemTrayTopFromBottom(viewH, safeBottom);
    n.setPosition(0, trayTop + CANCEL_GAP + CANCEL_H * 0.5, 0);
    this._paintCancel();
  }

  private _syncCancel(): void {
    const n = this.node.getChildByName('CancelPick');
    if (!n) return;
    n.active = this._pickFocus() && this._pickShadeOn;
    if (n.active) this._paintCancel();
  }

  private _paintCancel(): void {
    const n = this.node.getChildByName('CancelPick');
    if (!n) return;
    ensureBtnChrome(n, CANCEL_W, CANCEL_H, Theme.playFill, Theme.playStroke, 'winAction');
    const labN = n.getChildByName('Label');
    if (!labN) return;
    labN.getComponent(UITransform)?.setContentSize(CANCEL_W - 24, CANCEL_H - 16);
    labN.setPosition(0, 4, 0);
    const lab = this._lab(labN, '取消', 48, CANCEL_INK, CANCEL_W - 24, CANCEL_H - 16, false);
    lab.outlineColor = CANCEL_OUTLINE;
    lab.outlineWidth = 5;
  }

  private _pulseArmed(n: Node, on: boolean): void {
    Tween.stopAllByTarget(n);
    if (!on) {
      n.setScale(1, 1, 1);
      return;
    }
    n.setScale(1.1, 1.1, 1);
    tween(n)
      .to(0.36, { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'sineInOut' })
      .to(0.36, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'sineInOut' })
      .union()
      .repeatForever()
      .start();
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
