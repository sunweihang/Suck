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
  merge: 'icMerge',
  hook: 'icHook',
  shovel: 'icShovel',
} as const;

const ITEM_TITLE: Record<ItemId, string> = {
  shuffle: '洗牌',
  merge: '合并',
  hook: '钩子',
  shovel: '铲子',
};

export type ShopKind = ItemId | 'slot';

@ccclass('ItemShopPanel')
export class ItemShopPanel extends Component {
  private _wired = false;
  private _busy = false;
  private _kind: ShopKind = 'shuffle';
  private _onBuy: ((kind: ShopKind) => void) | null = null;
  private _onWatch: ((kind: ShopKind) => void) | null = null;
  private _onClose: (() => void) | null = null;

  setup(opts: {
    onBuy: (kind: ShopKind) => void;
    onWatch: (kind: ShopKind) => void;
    onClose: () => void;
  }): void {
    this._onBuy = opts.onBuy;
    this._onWatch = opts.onWatch;
    this._onClose = opts.onClose;
    this._lockInput();
    this._bindEvents();
    this.layoutChrome();
  }

  show(kind: ShopKind): void {
    this._kind = kind;
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

  private _iconKey(): 'icShuffle' | 'icMerge' | 'icHook' | 'icShovel' | 'lockSeal' {
    return this._kind === 'slot' ? 'lockSeal' : ITEM_ICON_KEY[this._kind];
  }

  private _goldCost(): number {
    return this._kind === 'slot' ? slotGoldCost() : itemGoldCost(this._kind);
  }

  private _syncCopy(): void {
    const card = this._card();
    const slot = this._kind === 'slot';
    const title = card?.getChildByName('Title')?.getComponent(Label);
    if (title) title.string = slot ? '坑位解锁' : '道具获取';
    const sub = card?.getChildByName('Sub');
    if (sub) sub.active = false;
    const nameLab = card?.getChildByName('Name')?.getComponent(Label);
    if (nameLab) {
      nameLab.node.active = true;
      nameLab.string = slot ? '坑位' : ITEM_TITLE[this._kind];
    }
    const buyLab = card?.getChildByName('BuyBtn')?.getChildByName('Content')?.getChildByName('Label')?.getComponent(Label);
    if (buyLab) buyLab.string = `${this._goldCost()}`;
    const adLab = card?.getChildByName('AdBtn')?.getChildByName('Content')?.getChildByName('Label')?.getComponent(Label);
    if (adLab) adLab.string = '免费';
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
      this._onBuy?.(this._kind);
    });
    this._bindTap(this._card()?.getChildByName('AdBtn'), () => {
      if (this._busy) return;
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
