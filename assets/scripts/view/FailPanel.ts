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
import { uiVisibleSize } from '../game/ViewFit';
import { gameAudio } from '../audio/AudioService';
import { ensureBtnChrome, VOLCANO_BTN_H, VOLCANO_BTN_W } from './UiArt';

const { ccclass } = _decorator;

const DIM = new Color(28, 32, 48, 120);
const RETRY_INK = new Color(255, 255, 255, 255);
const RETRY_OUTLINE = new Color(20, 64, 32, 255);
const RETRY_FILL = new Color(80, 180, 90, 255);

@ccclass('FailPanel')
export class FailPanel extends Component {
  private _built = false;
  private _onRetry: (() => void) | null = null;

  setup(opts: { onRetry: () => void }): void {
    this._onRetry = opts.onRetry;
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
    this.node.active = true;
    const retry = this._card()?.getChildByName('RetryBtn');
    if (retry) retry.active = true;
    this.layoutChrome();
    this._popIn();
  }

  hide(): void {
    Tween.stopAllByTarget(this._card());
    this.node.active = false;
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
    this._paintRetry();
    this._placeStack('RetryBtn');
  }

  private _paintRetry(): void {
    const btn = this._card()?.getChildByName('RetryBtn');
    if (!btn) return;
    const baked = btn.getComponent(Sprite);
    if (baked) {
      baked.spriteFrame = null;
      baked.enabled = false;
    }
    ensureBtnChrome(btn, VOLCANO_BTN_W, VOLCANO_BTN_H, RETRY_FILL, RETRY_OUTLINE, 'winAction');
    let labN = btn.getChildByName('Label');
    if (!labN) {
      labN = new Node('Label');
      btn.addChild(labN);
      labN.layer = Layers.Enum.UI_2D;
      labN.addComponent(UITransform);
    }
    labN.getComponent(UITransform)?.setContentSize(VOLCANO_BTN_W - 24, VOLCANO_BTN_H - 16);
    labN.setPosition(0, 2, 0);
    labN.setSiblingIndex(btn.children.length - 1);
    const lab = labN.getComponent(Label) ?? labN.addComponent(Label);
    lab.string = '再试一次';
    lab.fontSize = 40;
    lab.lineHeight = 48;
    lab.isBold = true;
    lab.color = RETRY_INK;
    lab.enableOutline = true;
    lab.outlineWidth = 4;
    lab.outlineColor = RETRY_OUTLINE;
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    lab.useSystemFont = true;
    lab.fontFamily = 'PingFang SC';
  }

  private _card(): Node | null {
    return this.node.getChildByName('Card');
  }

  private _placeStack(btnName: string): void {
    const card = this._card();
    if (!card) return;
    const btn = card.getChildByName(btnName);
    const btnH = btn?.getComponent(UITransform)?.height ?? 0;
    card.setPosition(0, (btnH + 20) * 0.5, 0);
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
  }

  private _bindEvents(): void {
    this._bindTap(this._card()?.getChildByName('RetryBtn'), () => this._onRetry?.());
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
}
