import {
  _decorator,
  Color,
  Component,
  EventTouch,
  Graphics,
  Layers,
  Node,
  Tween,
  UITransform,
  Vec3,
  Widget,
  tween,
} from 'cc';
import { uiVisibleSize } from '../game/ViewFit';
import { gameAudio } from '../audio/AudioService';

const { ccclass } = _decorator;

const DIM = new Color(28, 32, 48, 120);

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
    this._placeStack('RetryBtn');
    this._fillHit(this._card()?.getChildByName('RetryBtn'));
  }

  private _fillHit(node: Node | null | undefined): void {
    if (!node) return;
    const ut = node.getComponent(UITransform);
    if (!ut) return;
    let g = node.getComponent(Graphics);
    if (!g) g = node.addComponent(Graphics);
    g.clear();
    g.fillColor = new Color(255, 255, 255, 1);
    const w = ut.width;
    const h = ut.height;
    g.roundRect(-w * 0.5, -h * 0.5, w, h, Math.min(h * 0.5, 48));
    g.fill();
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
