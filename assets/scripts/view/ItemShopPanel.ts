import {
  _decorator,
  BlockInputEvents,
  Color,
  Component,
  EventTouch,
  Graphics,
  Label,
  Node,
  Tween,
  UITransform,
  Vec3,
  Widget,
  tween,
} from 'cc';
import type { ItemId } from '../game/LevelCatalog';
import { itemGoldCost, slotGoldCost } from '../game/PlayerWallet';
import { uiVisibleSize } from '../game/ViewFit';
import { gameAudio } from '../audio/AudioService';
import { applyArtSpriteSoon } from './UiArt';

const { ccclass } = _decorator;

const DIM = new Color(28, 32, 48, 150);

const ITEM_ICON_KEY = {
  shuffle: 'icShuffle',
  hook: 'icHook',
  shovel: 'icShovel',
  bomb: 'icBomb',
} as const;

const ITEM_TITLE: Record<ItemId, string> = {
  shuffle: '洗牌',
  hook: '钩子',
  shovel: '铲子',
  bomb: '炸弹',
};

const ITEM_DESC: Record<ItemId, string> = {
  shuffle: '随机打乱备战区炮塔位置',
  hook: '选择后方炮塔直接上场',
  shovel: '将场上炮塔铲回备战区',
  bomb: '点击同色连通区域，炸掉整片方块',
};

export type ShopKind = ItemId | 'slot';

const BTN_W = 374;
const BTN_H = 145;
const BTN_GAP = 20;
const BUY_X = -Math.round((BTN_W + BTN_GAP) * 0.5);
const AD_X = Math.round((BTN_W + BTN_GAP) * 0.5);
const GOLD_ICON = 76;
const AD_ICON_W = 76;
const ACTION_TEXT_W = 150;
const ACTION_GAP = 10;

@ccclass('ItemShopPanel')
export class ItemShopPanel extends Component {
  private _wired = false;
  private _busy = false;
  private _kind: ShopKind = 'shuffle';
  private _stock = 0;
  private _onBuy: ((kind: ShopKind) => void) | null = null;
  private _onWatch: ((kind: ShopKind) => void) | null = null;
  private _onUse: ((kind: ShopKind) => void) | null = null;
  private _onClose: (() => void) | null = null;

  setup(opts: {
    onBuy: (kind: ShopKind) => void;
    onWatch: (kind: ShopKind) => void;
    onUse: (kind: ShopKind) => void;
    onClose: () => void;
  }): void {
    this._onBuy = opts.onBuy;
    this._onWatch = opts.onWatch;
    this._onUse = opts.onUse;
    this._onClose = opts.onClose;
    this._lockInput();
    this._bindEvents();
    this.layoutChrome();
  }

  show(kind: ShopKind, stock = 0): void {
    this._kind = kind;
    this._stock = kind === 'slot' ? 0 : Math.max(0, stock | 0);
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
    const icon = this._icon();
    const ut = icon?.getComponent(UITransform);
    if (icon && ut) applyArtSpriteSoon(icon, this._iconKey(), ut.width, ut.height);
    const close = this._closeBtn();
    if (close) applyArtSpriteSoon(close, 'settingsClose', 72, 72);
    this._syncCopy();
  }

  layoutChrome(): void {
    const vis = uiVisibleSize();
    this.node.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    this.node.getComponent(Widget)?.updateAlignment();
    const dim = this.node.getChildByName('Dim');
    dim?.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    dim?.getComponent(Widget)?.updateAlignment();
    this._fillDim(dim, vis.w, vis.h);
  }

  private _card(): Node | null {
    return this.node.getChildByName('Card');
  }

  private _icon(): Node | null {
    return this._card()?.getChildByName('Icon') ?? null;
  }

  private _closeBtn(): Node | null {
    return this._card()?.getChildByName('CloseBtn') ?? null;
  }

  private _iconKey(): 'icShuffle' | 'icHook' | 'icShovel' | 'icBomb' | 'lockSeal' {
    return this._kind === 'slot' ? 'lockSeal' : ITEM_ICON_KEY[this._kind];
  }

  private _goldCost(): number {
    return this._kind === 'slot' ? slotGoldCost() : itemGoldCost(this._kind);
  }

  private _hasStock(): boolean {
    return this._kind !== 'slot' && this._stock > 0;
  }

  private _syncCopy(): void {
    const card = this._card();
    const slot = this._kind === 'slot';
    const title = card?.getChildByName('Title')?.getComponent(Label);
    if (title) title.string = slot ? '坑位解锁' : ITEM_TITLE[this._kind];
    const sub = card?.getChildByName('Sub');
    if (sub) sub.active = false;
    const nameLab = card?.getChildByName('Name')?.getComponent(Label);
    if (nameLab) {
      nameLab.node.active = true;
      nameLab.overflow = Label.Overflow.CLAMP;
      nameLab.enableWrapText = true;
      nameLab.string = slot ? '解锁一个新的放置坑位' : ITEM_DESC[this._kind];
    }
    this._syncActions();
  }

  private _syncActions(): void {
    const owned = this._hasStock();
    const buy = this._card()?.getChildByName('BuyBtn');
    const ad = this._card()?.getChildByName('AdBtn');
    if (buy) buy.setPosition(owned ? 0 : BUY_X, buy.position.y, 0);
    if (ad) ad.active = !owned;
    this._layoutActionBtn('BuyBtn', 'GoldIcon', GOLD_ICON, GOLD_ICON, owned ? '使用' : `${this._goldCost()}`, owned);
    if (!owned) this._layoutActionBtn('AdBtn', 'AdIcon', AD_ICON_W, 52, '免费', false);
  }

  private _layoutActionBtn(
    btnName: string,
    iconName: string,
    iconW: number,
    iconH: number,
    text: string,
    plain: boolean,
  ): void {
    const btn = this._card()?.getChildByName(btnName);
    const content = btn?.getChildByName('Content');
    if (!btn || !content) return;
    const icon = content.getChildByName(iconName);
    const labN = content.getChildByName('Label');
    const lab = labN?.getComponent(Label);
    if (icon) icon.active = !plain;
    if (lab) lab.string = text;
    if (plain) {
      content.getComponent(UITransform)?.setContentSize(220, BTN_H - 8);
      content.setPosition(0, 2, 0);
      labN?.getComponent(UITransform)?.setContentSize(220, BTN_H - 16);
      labN?.setPosition(0, 0, 0);
      return;
    }
    const w = iconW + ACTION_GAP + ACTION_TEXT_W;
    content.getComponent(UITransform)?.setContentSize(w, BTN_H - 8);
    content.setPosition(8, 2, 0);
    icon?.getComponent(UITransform)?.setContentSize(iconW, iconH);
    icon?.setPosition(-w * 0.5 + iconW * 0.5, 0, 0);
    labN?.getComponent(UITransform)?.setContentSize(ACTION_TEXT_W, BTN_H - 16);
    labN?.setPosition(-w * 0.5 + iconW + ACTION_GAP + ACTION_TEXT_W * 0.5, 0, 0);
  }

  private _lockInput(): void {
    if (!this.node.getComponent(BlockInputEvents)) this.node.addComponent(BlockInputEvents);
    const dim = this.node.getChildByName('Dim');
    if (dim && !dim.getComponent(BlockInputEvents)) dim.addComponent(BlockInputEvents);
    const card = this._card();
    if (card && !card.getComponent(BlockInputEvents)) card.addComponent(BlockInputEvents);
  }

  private _bindEvents(): void {
    if (this._wired) return;
    this._wired = true;
    const dim = this.node.getChildByName('Dim');
    dim?.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      if (this._busy) return;
      this._onClose?.();
    }, this);
    this._card()?.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
    }, this);
    this._bindTap(this._card()?.getChildByName('BuyBtn'), () => {
      if (this._busy) return;
      if (this._hasStock()) this._onUse?.(this._kind);
      else this._onBuy?.(this._kind);
    });
    this._bindTap(this._card()?.getChildByName('AdBtn'), () => {
      if (this._busy || this._hasStock()) return;
      this._onWatch?.(this._kind);
    });
    this._bindTap(this._closeBtn(), () => {
      if (this._busy) return;
      this._onClose?.();
    });
  }

  private _bindTap(node: Node | null | undefined, onTap: () => void): void {
    if (!node) return;
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

  private _fillDim(node: Node | null, w: number, h: number): void {
    if (!node) return;
    let g = node.getComponent(Graphics);
    if (!g) g = node.addComponent(Graphics);
    g.clear();
    g.fillColor = DIM;
    g.rect(-w * 0.5, -h * 0.5, w, h);
    g.fill();
  }
}
