import {
  _decorator,
  BlockInputEvents,
  Color,
  Component,
  EventTouch,
  Label,
  Layers,
  Node,
  Tween,
  UITransform,
  Vec3,
  Widget,
  tween,
} from 'cc';
import { DAILY_ITEM_REWARDS } from '../game/DailyItemOffer';
import type { ItemId } from '../game/LevelCatalog';
import { uiVisibleSize } from '../game/ViewFit';
import { gameAudio } from '../audio/AudioService';
import { AD_MARK_H, applyAdIcon, applyArtSpriteSoon, ensureBtnChrome, VOLCANO_BTN_H, VOLCANO_BTN_W } from './UiArt';

const { ccclass } = _decorator;

const TITLE_INK = new Color(74, 68, 128, 255);
const HINT_INK = new Color(110, 104, 168, 255);
const BTN_INK = new Color(255, 255, 255, 255);
const BTN_OUTLINE = new Color(20, 64, 32, 255);
const BTN_FILL = new Color(88, 196, 96, 255);

const CARD_W = 860;
const CARD_H = 1000;
const CLOSE = 72;
const CLOSE_X = 340;
const ITEM_ICON = 168;
const BTN_W = VOLCANO_BTN_W;
const BTN_H = VOLCANO_BTN_H;
const AD_ICON_H = AD_MARK_H;

const ITEM_ICON_KEY = {
  shuffle: 'icShuffle',
  hook: 'icHook',
  shovel: 'icShovel',
  bomb: 'icBomb',
} as const;

const ITEM_LABEL: Record<ItemId, string> = {
  shuffle: '随机排',
  hook: '任意指',
  shovel: '铲子',
  bomb: '炸弹',
};

@ccclass('DailyItemPanel')
export class DailyItemPanel extends Component {
  private _built = false;
  private _busy = false;
  private _onWatch: (() => void) | null = null;
  private _onClose: (() => void) | null = null;

  setup(opts: { onWatch: () => void; onClose: () => void }): void {
    this._onWatch = opts.onWatch;
    this._onClose = opts.onClose;
    this._ensureTree();
    this._bindEvents();
    this.layoutChrome();
  }

  isOpen(): boolean {
    return this.node.active;
  }

  show(): void {
    this._ensureTree();
    this._busy = false;
    this.node.active = true;
    this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);
    this.layoutChrome();
    this.applyArt();
    this._popIn();
  }

  hide(): void {
    Tween.stopAllByTarget(this._card());
    this.node.active = false;
    this._busy = false;
  }

  setBusy(on: boolean): void {
    this._busy = on;
  }

  applyArt(): void {
    this._ensureTree();
    const vis = uiVisibleSize();
    applyArtSpriteSoon(this.node.getChildByName('Dim'), 'settingsDim', vis.w, vis.h);
    applyArtSpriteSoon(this._card()?.getChildByName('Frame') ?? null, 'panelMain', CARD_W, CARD_H, true);
    applyArtSpriteSoon(this._card()?.getChildByName('CloseBtn') ?? null, 'settingsClose', CLOSE, CLOSE);
    this._paintItems();
    this._paintClaim();
  }

  layoutChrome(): void {
    this._ensureTree();
    const vis = uiVisibleSize();
    this.node.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    this.node.getComponent(Widget)?.updateAlignment();
    const dim = this.node.getChildByName('Dim');
    dim?.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    dim?.getComponent(Widget)?.updateAlignment();
    this._placeStack();
    this._paintClaim();
  }

  private _card(): Node | null {
    return this.node.getChildByName('Card');
  }

  private _placeStack(): void {
    const card = this._card();
    if (!card) return;
    card.setPosition(0, 24, 0);
    card.getChildByName('Title')?.setPosition(0, CARD_H * 0.5 - 88, 0);
    card.getChildByName('CloseBtn')?.setPosition(CLOSE_X, CARD_H * 0.5 - 80, 0);
    card.getChildByName('Tray')?.setPosition(0, 40, 0);
    card.getChildByName('Hint')?.setPosition(0, -210, 0);
    this._layoutItems(card.getChildByName('Tray'));
    card.getChildByName('ClaimBtn')?.setPosition(0, -CARD_H * 0.5 + 130, 0);
    this._layoutClaim();
  }

  private _layoutItems(tray: Node | null): void {
    if (!tray) return;
    const gap = 260;
    for (let i = 0; i < DAILY_ITEM_REWARDS.length; i++) {
      const n = tray.getChildByName(`Item_${i}`);
      if (!n) continue;
      n.setPosition((i - 0.5) * gap, 0, 0);
      n.getChildByName('Icon')?.setPosition(0, 28, 0);
      n.getChildByName('Lab')?.setPosition(0, -96, 0);
    }
  }

  private _paintItems(): void {
    const tray = this._card()?.getChildByName('Tray');
    if (!tray) return;
    for (let i = 0; i < DAILY_ITEM_REWARDS.length; i++) {
      const id = DAILY_ITEM_REWARDS[i];
      const n = tray.getChildByName(`Item_${i}`);
      if (!n || !id) continue;
      applyArtSpriteSoon(n.getChildByName('Icon'), ITEM_ICON_KEY[id], ITEM_ICON, ITEM_ICON);
      const lab = n.getChildByName('Lab')?.getComponent(Label);
      if (lab) lab.string = ITEM_LABEL[id];
    }
  }

  private _paintClaim(): void {
    const btn = this._card()?.getChildByName('ClaimBtn');
    ensureBtnChrome(btn, BTN_W, BTN_H, BTN_FILL, BTN_OUTLINE, 'winAction');
    const lab = btn?.getChildByName('Content')?.getChildByName('Label')?.getComponent(Label);
    if (lab) lab.outlineColor = BTN_OUTLINE;
    applyAdIcon(btn?.getChildByName('Content')?.getChildByName('AdIcon') ?? null, AD_ICON_H);
    this._layoutClaim();
  }

  private _layoutClaim(): void {
    const content = this._card()?.getChildByName('ClaimBtn')?.getChildByName('Content');
    if (!content) return;
    const icon = content.getChildByName('AdIcon');
    const lab = content.getChildByName('Label');
    const textW = 180;
    const gap = 14;
    const iconW = applyAdIcon(icon, AD_ICON_H);
    const w = iconW + gap + textW;
    content.getComponent(UITransform)?.setContentSize(w, BTN_H - 8);
    content.setPosition(0, 3, 0);
    icon?.setPosition(-w * 0.5 + iconW * 0.5, 0, 0);
    lab?.setPosition(-w * 0.5 + iconW + gap + textW * 0.5, 0, 0);
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
    if (!this.node.getComponent(BlockInputEvents)) this.node.addComponent(BlockInputEvents);

    const dim = this._mk('Dim', this.node, vis.w, vis.h);
    const dw = dim.addComponent(Widget);
    dw.isAlignTop = dw.isAlignBottom = dw.isAlignLeft = dw.isAlignRight = true;
    dw.top = dw.bottom = dw.left = dw.right = 0;
    dw.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    if (!dim.getComponent(BlockInputEvents)) dim.addComponent(BlockInputEvents);

    const card = this._mk('Card', this.node, CARD_W, CARD_H);
    if (!card.getComponent(BlockInputEvents)) card.addComponent(BlockInputEvents);
    this._mk('Frame', card, CARD_W, CARD_H);
    this._label(card, 'Title', '每日道具', 64, TITLE_INK, CARD_W - 200, 88, false);
    this._mk('CloseBtn', card, CLOSE, CLOSE);
    const tray = this._mk('Tray', card, 640, 280);
    for (let i = 0; i < DAILY_ITEM_REWARDS.length; i++) {
      const id = DAILY_ITEM_REWARDS[i];
      const n = this._mk(`Item_${i}`, tray, 220, 260);
      this._mk('Icon', n, ITEM_ICON, ITEM_ICON);
      this._label(n, 'Lab', id ? ITEM_LABEL[id] : '', 36, TITLE_INK, 200, 48, false);
    }
    this._label(card, 'Hint', '(每日只能领取一次)', 30, HINT_INK, CARD_W - 120, 44, false);
    this._ensureClaim(card);
  }

  private _ensureClaim(card: Node): void {
    const btn = this._mk('ClaimBtn', card, BTN_W, BTN_H);
    const content = this._mk('Content', btn, 420, BTN_H - 8);
    this._mk('AdIcon', content, Math.round(AD_ICON_H * 1.41), AD_ICON_H);
    this._label(content, 'Label', '领取', 48, BTN_INK, 180, 64, true, BTN_OUTLINE);
    this._layoutClaim();
  }

  private _bindEvents(): void {
    const dim = this.node.getChildByName('Dim');
    dim?.off(Node.EventType.TOUCH_END);
    dim?.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
    }, this);
    this._card()?.off(Node.EventType.TOUCH_END);
    this._card()?.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
    }, this);
    this._bindTap(this._card()?.getChildByName('CloseBtn'), () => {
      if (this._busy) return;
      this._onClose?.();
    });
    this._bindTap(this._card()?.getChildByName('ClaimBtn'), () => {
      if (this._busy) return;
      this._onWatch?.();
    });
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

  private _popIn(): void {
    const card = this._card();
    if (!card) return;
    Tween.stopAllByTarget(card);
    card.setScale(0.86, 0.86, 1);
    tween(card)
      .to(0.28, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();
  }

  private _label(
    parent: Node,
    name: string,
    text: string,
    size: number,
    color: Color,
    w: number,
    h: number,
    outline = false,
    outlineColor: Color = TITLE_INK,
  ): Label {
    const n = parent.getChildByName(name) ?? this._mk(name, parent, w, h);
    let lab = n.getComponent(Label);
    if (!lab) lab = n.addComponent(Label);
    lab.string = text;
    lab.fontSize = size;
    lab.lineHeight = size + 8;
    lab.isBold = true;
    lab.color = color;
    lab.enableOutline = outline;
    lab.outlineWidth = outline ? 4 : 0;
    lab.outlineColor = outlineColor;
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    lab.overflow = Label.Overflow.SHRINK;
    lab.useSystemFont = true;
    lab.fontFamily = 'PingFang SC';
    return lab;
  }

  private _mk(name: string, parent: Node, w: number, h: number): Node {
    const n = new Node(name);
    parent.addChild(n);
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform).setContentSize(w, h);
    return n;
  }
}
