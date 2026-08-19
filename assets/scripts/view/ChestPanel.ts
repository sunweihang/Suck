import {
  _decorator,
  Color,
  Component,
  EventTouch,
  Graphics,
  Label,
  Layers,
  Node,
  Tween,
  UITransform,
  Vec3,
  Widget,
  tween,
} from 'cc';
import type { ChestReward } from '../game/ChestLoot';
import type { ItemId } from '../game/LevelCatalog';
import { uiVisibleSize } from '../game/ViewFit';
import { gameAudio } from '../audio/AudioService';
import { applyArtSpriteSoon, ensureBtnChrome, VOLCANO_BTN_H, VOLCANO_BTN_W } from './UiArt';

const { ccclass } = _decorator;

const DIM = new Color(28, 32, 48, 150);
const TITLE_INK = new Color(74, 68, 128, 255);
const SUB_INK = new Color(110, 104, 168, 255);
const GOLD_INK = new Color(248, 225, 128, 255);
const GOLD_OUTLINE = new Color(74, 68, 128, 255);
const BTN_INK = new Color(255, 255, 255, 255);
const BTN_OUTLINE = new Color(74, 68, 128, 255);
const BTN_FILL = new Color(255, 226, 118, 255);
const CLAIM_OUTLINE = new Color(88, 48, 16, 255);
const WATCH_OUTLINE = new Color(20, 64, 32, 255);

const CARD_W = 860;
const CARD_H = 980;
const CHEST = 420;
const BTN_W = VOLCANO_BTN_W;
const BTN_H = VOLCANO_BTN_H;
const AD_ICON_W = 64;
const AD_ICON_H = 44;
const REWARD_ICON = 88;
const ITEM_ICON_KEY = {
  shuffle: 'icShuffle',
  hook: 'icHook',
  shovel: 'icShovel',
  bomb: 'icBomb',
} as const;

@ccclass('ChestPanel')
export class ChestPanel extends Component {
  private _built = false;
  private _opened = false;
  private _busy = false;
  private _reward: ChestReward | null = null;
  private _onWatch: (() => void) | null = null;
  private _onClaim: ((reward: ChestReward) => void) | null = null;

  setup(opts: { onWatch: () => void; onClaim: (reward: ChestReward) => void }): void {
    this._onWatch = opts.onWatch;
    this._onClaim = opts.onClaim;
    this._ensureTree();
    this._bindEvents();
    const dim = this.node.getChildByName('Dim') ?? this.node;
    dim.off(Node.EventType.TOUCH_END);
    dim.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
    }, this);
    this.layoutChrome();
  }

  show(): void {
    this._ensureTree();
    this._opened = false;
    this._busy = false;
    this._reward = null;
    this.node.active = true;
    this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);
    this._syncPhase();
    this.layoutChrome();
    this.applyArt();
    this._popIn();
  }

  reveal(reward: ChestReward): void {
    this._reward = reward;
    this._opened = true;
    this._busy = false;
    this._syncPhase();
    this.layoutChrome();
    this.applyArt();
    const art = this._card()?.getChildByName('ChestArt');
    if (art) {
      Tween.stopAllByTarget(art);
      art.setScale(0.86, 0.86, 1);
      tween(art)
        .to(0.28, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'backOut' })
        .to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
        .start();
    }
  }

  setBusy(on: boolean): void {
    this._busy = on;
  }

  hide(): void {
    Tween.stopAllByTarget(this._card());
    this.node.active = false;
    this._opened = false;
    this._busy = false;
    this._reward = null;
  }

  applyArt(): void {
    this._ensureTree();
    const card = this._card();
    applyArtSpriteSoon(card?.getChildByName('Frame') ?? null, 'settingsCard', CARD_W, CARD_H, true);
    applyArtSpriteSoon(card?.getChildByName('ChestArt') ?? null, 'chest', CHEST, CHEST);
    this._paintBtns();
    applyArtSpriteSoon(
      card?.getChildByName('WatchBtn')?.getChildByName('Content')?.getChildByName('AdIcon') ?? null,
      'icAd',
      AD_ICON_W,
      AD_ICON_H,
    );
    this._paintRewards();
  }

  layoutChrome(): void {
    this._ensureTree();
    const vis = uiVisibleSize();
    this.node.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    this.node.getComponent(Widget)?.updateAlignment();
    const dim = this.node.getChildByName('Dim');
    dim?.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    dim?.getComponent(Widget)?.updateAlignment();
    this._fillDim(dim, vis.w, vis.h);
    this._placeStack();
    this._paintBtns();
  }

  private _paintBtns(): void {
    const card = this._card();
    ensureBtnChrome(card?.getChildByName('WatchBtn'), BTN_W, BTN_H, BTN_FILL, WATCH_OUTLINE, 'winAction');
    ensureBtnChrome(card?.getChildByName('ClaimBtn'), BTN_W, BTN_H, BTN_FILL, CLAIM_OUTLINE, 'winDouble');
    const watchLab = card?.getChildByName('WatchBtn')?.getChildByName('Content')?.getChildByName('Label')?.getComponent(Label);
    if (watchLab) watchLab.outlineColor = WATCH_OUTLINE;
    const claimLab = card?.getChildByName('ClaimBtn')?.getChildByName('Label')?.getComponent(Label);
    if (claimLab) claimLab.outlineColor = CLAIM_OUTLINE;
  }

  private _card(): Node | null {
    return this.node.getChildByName('Card');
  }

  private _placeStack(): void {
    const card = this._card();
    if (!card) return;
    card.setPosition(0, 24, 0);
    const title = card.getChildByName('Title');
    const sub = card.getChildByName('Sub');
    const art = card.getChildByName('ChestArt');
    const rewards = card.getChildByName('Rewards');
    const watch = card.getChildByName('WatchBtn');
    const claim = card.getChildByName('ClaimBtn');
    title?.setPosition(0, CARD_H * 0.5 - 88, 0);
    sub?.setPosition(0, CARD_H * 0.5 - 156, 0);
    art?.setPosition(0, 70, 0);
    rewards?.setPosition(0, -220, 0);
    watch?.setPosition(0, -CARD_H * 0.5 + 110, 0);
    claim?.setPosition(0, -CARD_H * 0.5 + 110, 0);
  }

  private _syncPhase(): void {
    const card = this._card();
    if (!card) return;
    const title = card.getChildByName('Title')?.getComponent(Label);
    const sub = card.getChildByName('Sub')?.getComponent(Label);
    const watch = card.getChildByName('WatchBtn');
    const claim = card.getChildByName('ClaimBtn');
    const rewards = card.getChildByName('Rewards');
    if (this._opened) {
      if (title) title.string = '宝箱开启';
      if (sub) sub.string = '获得以下奖励';
      if (watch) watch.active = false;
      if (claim) claim.active = true;
      if (rewards) rewards.active = true;
    } else {
      if (title) title.string = '发现宝箱';
      if (sub) sub.string = '看完视频才能开启';
      if (watch) watch.active = true;
      if (claim) claim.active = false;
      if (rewards) rewards.active = false;
    }
  }

  private _paintRewards(): void {
    const row = this._card()?.getChildByName('Rewards');
    if (!row) return;
    const reward = this._reward;
    if (!reward) {
      row.active = false;
      return;
    }
    row.active = true;
    const gold = row.getChildByName('Gold');
    applyArtSpriteSoon(gold?.getChildByName('Icon') ?? null, 'goldIcon', 64, 64);
    const goldLab = gold?.getChildByName('Lab')?.getComponent(Label);
    if (goldLab) goldLab.string = `+${reward.gold}`;
    for (let i = 0; i < 2; i++) {
      const n = row.getChildByName(`Item_${i}`);
      const id = reward.items[i];
      if (!n) continue;
      n.active = !!id;
      if (!id) continue;
      applyArtSpriteSoon(n.getChildByName('Icon'), ITEM_ICON_KEY[id], REWARD_ICON, REWARD_ICON);
      const lab = n.getChildByName('Lab')?.getComponent(Label);
      if (lab) lab.string = '+1';
    }
    this._layoutRewards(row, reward);
  }

  private _layoutRewards(row: Node, reward: ChestReward): void {
    const cells = 1 + reward.items.length;
    const gap = 36;
    const cellW = 140;
    const total = cells * cellW + (cells - 1) * gap;
    let x = -total * 0.5 + cellW * 0.5;
    const gold = row.getChildByName('Gold');
    gold?.setPosition(x, 8, 0);
    x += cellW + gap;
    for (let i = 0; i < 2; i++) {
      const n = row.getChildByName(`Item_${i}`);
      if (!n?.active) continue;
      n.setPosition(x, 8, 0);
      x += cellW + gap;
    }
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

    const dim = this._mk('Dim', this.node, vis.w, vis.h);
    this._fillDim(dim, vis.w, vis.h);
    const dw = dim.addComponent(Widget);
    dw.isAlignTop = dw.isAlignBottom = dw.isAlignLeft = dw.isAlignRight = true;
    dw.top = dw.bottom = dw.left = dw.right = 0;
    dw.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;

    const card = this._mk('Card', this.node, CARD_W, CARD_H);
    this._mk('Frame', card, CARD_W, CARD_H);
    this._label(card, 'Title', '发现宝箱', 64, TITLE_INK, CARD_W - 160, 88);
    this._label(card, 'Sub', '看完视频才能开启', 36, SUB_INK, CARD_W - 180, 56);
    this._mk('ChestArt', card, CHEST, CHEST);
    this._ensureRewards(card);
    this._ensureWatch(card);
    this._ensureClaim(card);
  }

  private _ensureRewards(card: Node): void {
    const row = this._mk('Rewards', card, 640, 150);
    const gold = this._mk('Gold', row, 140, 140);
    this._mk('Icon', gold, 64, 64).setPosition(0, 22, 0);
    this._label(gold, 'Lab', '+50', 40, GOLD_INK, 140, 48, true).node.setPosition(0, -42, 0);
    for (let i = 0; i < 2; i++) {
      const n = this._mk(`Item_${i}`, row, 140, 140);
      this._mk('Icon', n, REWARD_ICON, REWARD_ICON).setPosition(0, 18, 0);
      this._label(n, 'Lab', '+1', 36, GOLD_INK, 120, 44, true).node.setPosition(0, -48, 0);
    }
    row.active = false;
  }

  private _ensureWatch(card: Node): void {
    const btn = this._mk('WatchBtn', card, BTN_W, BTN_H);
    const content = this._mk('Content', btn, 420, BTN_H - 8);
    this._mk('AdIcon', content, AD_ICON_W, AD_ICON_H);
    this._label(content, 'Label', '看视频开启', 48, BTN_INK, 260, 64);
    this._layoutWatch(content);
  }

  private _ensureClaim(card: Node): void {
    const btn = this._mk('ClaimBtn', card, BTN_W, BTN_H);
    this._label(btn, 'Label', '领取', 52, BTN_INK, 260, 68);
    btn.active = false;
  }

  private _layoutWatch(content: Node): void {
    const icon = content.getChildByName('AdIcon');
    const lab = content.getChildByName('Label');
    const textW = 260;
    const gap = 16;
    const w = AD_ICON_W + gap + textW;
    content.getComponent(UITransform)?.setContentSize(w, BTN_H - 8);
    content.setPosition(0, 3, 0);
    icon?.setPosition(-w * 0.5 + AD_ICON_W * 0.5, 0, 0);
    lab?.setPosition(-w * 0.5 + AD_ICON_W + gap + textW * 0.5, 0, 0);
  }

  private _bindEvents(): void {
    this._bindTap(this._card()?.getChildByName('WatchBtn'), () => {
      if (this._busy || this._opened) return;
      this._onWatch?.();
    });
    this._bindTap(this._card()?.getChildByName('ClaimBtn'), () => {
      if (!this._opened || !this._reward) return;
      this._onClaim?.(this._reward);
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

  private _fillDim(node: Node | null, w: number, h: number): void {
    if (!node) return;
    let g = node.getComponent(Graphics);
    if (!g) g = node.addComponent(Graphics);
    g.clear();
    g.fillColor = DIM;
    g.rect(-w * 0.5, -h * 0.5, w, h);
    g.fill();
  }

  private _label(
    parent: Node,
    name: string,
    text: string,
    size: number,
    color: Color,
    w: number,
    h: number,
    gold = false,
  ): Label {
    const n = parent.getChildByName(name) ?? this._mk(name, parent, w, h);
    let lab = n.getComponent(Label);
    if (!lab) lab = n.addComponent(Label);
    lab.string = text;
    lab.fontSize = size;
    lab.lineHeight = size + 8;
    lab.isBold = true;
    lab.color = color;
    lab.enableOutline = true;
    lab.outlineWidth = gold ? 5 : 0;
    lab.outlineColor = gold ? GOLD_OUTLINE : BTN_OUTLINE;
    if (!gold) lab.enableOutline = color === BTN_INK;
    if (color === BTN_INK) {
      lab.enableOutline = true;
      lab.outlineWidth = 4;
      lab.outlineColor = BTN_OUTLINE;
    }
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
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
