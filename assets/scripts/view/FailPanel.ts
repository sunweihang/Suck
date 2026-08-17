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
  SpriteFrame,
  Tween,
  UITransform,
  Vec3,
  Widget,
  tween,
} from 'cc';
import { uiVisibleSize } from '../game/ViewFit';
import { gameAudio } from '../audio/AudioService';
import { applyArtSpriteSoon, ensureBtnChrome, VOLCANO_BTN_H, VOLCANO_BTN_W } from './UiArt';

const { ccclass } = _decorator;

const DIM = new Color(28, 32, 48, 120);
const BTN_INK = new Color(255, 255, 255, 255);
const RETRY_OUTLINE = new Color(20, 64, 32, 255);
const DOUBLE_OUTLINE = new Color(88, 48, 16, 255);
const RETRY_FILL = new Color(80, 180, 90, 255);
const DOUBLE_FILL = new Color(253, 188, 46, 255);
const GOLD_INK = new Color(248, 225, 128, 255);
const GOLD_OUTLINE = new Color(74, 68, 128, 255);
const BTN_W = VOLCANO_BTN_W;
const BTN_H = VOLCANO_BTN_H;
const BTN_GAP = 24;
const AD_ICON_W = 52;
const AD_ICON_H = 36;
const BTN_FONT = 40;
const GOLD_ICON = 72;
const GOLD_LAB_W = 160;
const GOLD_GAP = 12;
const GOLD_FONT = 56;
const CARD_W = 860;
const CARD_H = 1070;

@ccclass('FailPanel')
export class FailPanel extends Component {
  private _built = false;
  private _onRetry: (() => void) | null = null;
  private _onDouble: (() => void) | null = null;
  private _gold = 0;
  private _canDouble = true;
  private _locked = false;

  setup(opts: { onRetry: () => void; onDouble?: () => void }): void {
    this._onRetry = opts.onRetry;
    this._onDouble = opts.onDouble ?? null;
    this._ensureTree();
    this._bindEvents();
    const dim = this.node.getChildByName('Dim') ?? this.node;
    dim.off(Node.EventType.TOUCH_END);
    dim.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
    }, this);
    this.layoutChrome();
  }

  show(opts?: { gold?: number; canDouble?: boolean }): void {
    this._ensureTree();
    this._gold = Math.max(0, Math.floor(opts?.gold ?? 0));
    this._canDouble = opts?.canDouble !== false && this._gold > 0;
    this._locked = false;
    this.node.active = true;
    const retry = this._card()?.getChildByName('RetryBtn');
    if (retry) retry.active = true;
    this._syncDouble();
    this._syncGold();
    this.layoutChrome();
    this._popIn();
  }

  setDoubleVisible(visible: boolean): void {
    this._canDouble = visible;
    this._syncDouble();
    this.layoutChrome();
  }

  lock(): void {
    this._locked = true;
  }

  hide(): void {
    Tween.stopAllByTarget(this._card());
    this.node.active = false;
    this._locked = false;
  }

  goldStartWorld(out: Vec3): Vec3 {
    const icon = this._goldIcon();
    if (icon?.isValid) {
      icon.getWorldPosition(out);
      return out;
    }
    this.node.getWorldPosition(out);
    return out;
  }

  goldIconFrame(): SpriteFrame | null {
    return this._goldIcon()?.getComponent(Sprite)?.spriteFrame ?? null;
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
    this._placeRow();
    this._paintBtns();
    this._paintFrame();
  }

  private _card(): Node | null {
    return this.node.getChildByName('Card');
  }

  private _goldIcon(): Node | null {
    const gold = this._card()?.getChildByName('GoldReward');
    if (gold) gold.active = true;
    return gold?.getChildByName('GoldIcon') ?? gold ?? null;
  }

  private _placeRow(): void {
    const card = this._card();
    if (!card) return;
    const cardH = card.getComponent(UITransform)?.height ?? 0;
    this._layoutGold();
    const double = card.getChildByName('DoubleBtn');
    const retry = card.getChildByName('RetryBtn');
    const count = (double?.active ? 1 : 0) + (retry?.active ? 1 : 0);
    const span = count * BTN_W + Math.max(0, count - 1) * BTN_GAP;
    const below = BTN_H + 28;
    card.setPosition(0, below * 0.5, 0);
    const y = -cardH * 0.5 - 16 - BTN_H * 0.5;
    let x = -span * 0.5 + BTN_W * 0.5;
    if (double?.active) {
      this._sizeBtn(double);
      double.setPosition(x, y, 0);
      x += BTN_W + BTN_GAP;
    }
    if (retry) {
      this._sizeBtn(retry);
      retry.setPosition(x, y, 0);
    }
    this._layoutDoubleContent();
    this._layoutRetryLabel();
  }

  private _sizeBtn(node: Node): void {
    node.getComponent(UITransform)?.setContentSize(BTN_W, BTN_H);
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
    this._ensureBtns();
  }

  private _ensureBtns(): void {
    const card = this._card();
    if (!card) return;
    this._ensureGold();
    if (!card.getChildByName('DoubleBtn')) {
      const btn = this._mk('DoubleBtn', card, BTN_W, BTN_H);
      const content = this._mk('Content', btn, 280, BTN_H - 8);
      this._mk('AdIcon', content, AD_ICON_W, AD_ICON_H);
      this._styleLabel(this._mk('Label', content, 200, BTN_H - 16), '双倍领取', DOUBLE_OUTLINE);
    }
    const retry = card.getChildByName('RetryBtn') ?? this._mk('RetryBtn', card, BTN_W, BTN_H);
    if (!retry.getChildByName('Label')) {
      this._styleLabel(this._mk('Label', retry, BTN_W - 24, BTN_H - 16), '再试一次', RETRY_OUTLINE);
    }
    this._layoutDoubleContent();
    this._layoutRetryLabel();
  }

  private _styleLabel(node: Node, text: string, outline = RETRY_OUTLINE): Label {
    const lab = node.getComponent(Label) ?? node.addComponent(Label);
    lab.string = text;
    lab.fontSize = BTN_FONT;
    lab.lineHeight = BTN_FONT + 8;
    lab.isBold = true;
    lab.color = BTN_INK;
    lab.enableOutline = true;
    lab.outlineWidth = 4;
    lab.outlineColor = outline;
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    lab.overflow = Label.Overflow.SHRINK;
    lab.useSystemFont = true;
    lab.fontFamily = 'PingFang SC';
    return lab;
  }

  private _layoutDoubleContent(): void {
    const btn = this._card()?.getChildByName('DoubleBtn');
    const content = btn?.getChildByName('Content');
    if (!btn || !content) return;
    const icon = content.getChildByName('AdIcon');
    const lab = content.getChildByName('Label');
    const textW = 200;
    const gap = 10;
    const w = AD_ICON_W + gap + textW;
    content.getComponent(UITransform)?.setContentSize(w, BTN_H - 8);
    content.setPosition(0, 2, 0);
    icon?.setPosition(-w * 0.5 + AD_ICON_W * 0.5, 0, 0);
    lab?.setPosition(-w * 0.5 + AD_ICON_W + gap + textW * 0.5, 0, 0);
  }

  private _layoutRetryLabel(): void {
    const retry = this._card()?.getChildByName('RetryBtn');
    const lab = retry?.getChildByName('Label');
    if (!lab) return;
    lab.getComponent(UITransform)?.setContentSize(BTN_W - 24, BTN_H - 16);
    lab.setPosition(0, 2, 0);
  }

  private _bareBtn(node: Node | null | undefined): void {
    if (!node) return;
    const sp = node.getComponent(Sprite);
    if (sp) {
      sp.spriteFrame = null;
      sp.enabled = false;
    }
    const g = node.getComponent(Graphics);
    if (g) {
      g.clear();
      g.enabled = false;
    }
  }

  private _paintFrame(): void {
    const card = this._card();
    if (!card) return;
    card.getComponent(UITransform)?.setContentSize(CARD_W, CARD_H);
    applyArtSpriteSoon(card.getChildByName('Frame'), 'failPanel', CARD_W, CARD_H);
  }

  private _paintBtns(): void {
    const card = this._card();
    const double = card?.getChildByName('DoubleBtn') ?? null;
    const retry = card?.getChildByName('RetryBtn') ?? null;
    this._bareBtn(double);
    this._bareBtn(retry);
    ensureBtnChrome(double, BTN_W, BTN_H, DOUBLE_FILL, DOUBLE_OUTLINE, 'winDouble');
    ensureBtnChrome(retry, BTN_W, BTN_H, RETRY_FILL, RETRY_OUTLINE, 'winAction');
    const dLab = card?.getChildByName('DoubleBtn')?.getChildByName('Content')?.getChildByName('Label');
    const rLab = card?.getChildByName('RetryBtn')?.getChildByName('Label');
    if (dLab) this._styleLabel(dLab, '双倍领取', DOUBLE_OUTLINE);
    if (rLab) this._styleLabel(rLab, '再试一次', RETRY_OUTLINE);
    applyArtSpriteSoon(
      card?.getChildByName('DoubleBtn')?.getChildByName('Content')?.getChildByName('AdIcon') ?? null,
      'icAd',
      AD_ICON_W,
      AD_ICON_H,
    );
    this._syncGold();
  }

  private _ensureGold(): void {
    const card = this._card();
    if (!card) return;
    let gold = card.getChildByName('GoldReward');
    if (!gold) {
      const w = GOLD_ICON + GOLD_GAP + GOLD_LAB_W;
      gold = this._mk('GoldReward', card, w, GOLD_ICON + 8);
      this._mk('GoldIcon', gold, GOLD_ICON, GOLD_ICON);
      this._mk('GoldLabel', gold, GOLD_LAB_W, GOLD_ICON + 8);
    }
    this._syncGold();
  }

  private _syncGold(): void {
    const gold = this._card()?.getChildByName('GoldReward');
    if (!gold) return;
    gold.active = this._gold > 0;
    const lab = gold.getChildByName('GoldLabel');
    if (lab) this._styleGoldLabel(lab, `+${this._gold}`);
    applyArtSpriteSoon(gold.getChildByName('GoldIcon'), 'goldIcon', GOLD_ICON, GOLD_ICON);
  }

  private _styleGoldLabel(node: Node, text: string): Label {
    const lab = node.getComponent(Label) ?? node.addComponent(Label);
    lab.string = text;
    lab.fontSize = GOLD_FONT;
    lab.lineHeight = GOLD_FONT + 6;
    lab.isBold = true;
    lab.color = GOLD_INK;
    lab.enableOutline = true;
    lab.outlineWidth = 5;
    lab.outlineColor = GOLD_OUTLINE;
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    lab.overflow = Label.Overflow.NONE;
    lab.enableWrapText = false;
    lab.useSystemFont = true;
    lab.fontFamily = 'PingFang SC';
    return lab;
  }

  private _layoutGold(): void {
    const card = this._card();
    const gold = card?.getChildByName('GoldReward');
    if (!card || !gold) return;
    const cardH = card.getComponent(UITransform)?.height ?? 0;
    const w = GOLD_ICON + GOLD_GAP + GOLD_LAB_W;
    gold.getComponent(UITransform)?.setContentSize(w, GOLD_ICON + 8);
    gold.setPosition(0, -Math.round(cardH * 0.5) + 88, 0);
    gold.active = this._gold > 0;
    const icon = gold.getChildByName('GoldIcon');
    const lab = gold.getChildByName('GoldLabel');
    icon?.getComponent(UITransform)?.setContentSize(GOLD_ICON, GOLD_ICON);
    icon?.setPosition(-w * 0.5 + GOLD_ICON * 0.5, 0, 0);
    lab?.getComponent(UITransform)?.setContentSize(GOLD_LAB_W, GOLD_ICON + 8);
    lab?.setPosition(-w * 0.5 + GOLD_ICON + GOLD_GAP + GOLD_LAB_W * 0.5, 2, 0);
  }

  private _syncDouble(): void {
    const btn = this._card()?.getChildByName('DoubleBtn');
    if (btn) btn.active = this._canDouble;
  }

  private _bindEvents(): void {
    this._bindTap(this._card()?.getChildByName('RetryBtn'), () => {
      if (this._locked) return;
      this._onRetry?.();
    });
    this._bindTap(this._card()?.getChildByName('DoubleBtn'), () => {
      if (this._locked) return;
      this._onDouble?.();
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

  private _mk(name: string, parent: Node, w: number, h: number): Node {
    const n = new Node(name);
    parent.addChild(n);
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform).setContentSize(w, h);
    return n;
  }
}
