import {
  _decorator,
  Color,
  Component,
  EventTouch,
  Graphics,
  Label,
  Layers,
  Node,
  UITransform,
  Widget,
} from 'cc';
import { Theme } from '../game/Theme';
import { uiSafeInsets, uiVisibleSize } from '../game/ViewFit';
import { paintQBoard, paintQBtn, styleQCaption, styleQNum } from './QChrome';
import { gameAudio } from '../audio/AudioService';

const { ccclass } = _decorator;

const CARD_W = 720;
const CARD_H = 560;
const BTN_W = 520;
const BTN_H = 120;
const TOGGLE_W = 110;
const TOGGLE_H = 72;

@ccclass('GmPanel')
export class GmPanel extends Component {
  private _built = false;
  private _open = false;
  private _onWin: (() => void) | null = null;
  private _onFail: (() => void) | null = null;

  setup(opts: { onWin: () => void; onFail: () => void }): void {
    this._onWin = opts.onWin;
    this._onFail = opts.onFail;
    this._ensureTree();
    this.collapse();
    this.layoutChrome();
  }

  collapse(): void {
    this._open = false;
    this._setOpen(false);
  }

  layoutChrome(): void {
    this._ensureTree();
    const vis = uiVisibleSize();
    const safe = uiSafeInsets();
    this.node.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    this.node.getComponent(Widget)?.updateAlignment();
    const dim = this.node.getChildByName('Dim');
    dim?.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    dim?.getComponent(Widget)?.updateAlignment();
    this._fill(dim, Theme.veil);
    this.node.getChildByName('Card')?.setPosition(0, 20, 0);
    this.node.getChildByName('Toggle')?.setPosition(
      -vis.w * 0.5 + safe.left + TOGGLE_W * 0.5 + 24,
      vis.h * 0.5 - safe.top - TOGGLE_H * 0.5 - 24,
      0,
    );
  }

  private _setOpen(on: boolean): void {
    const dim = this.node.getChildByName('Dim');
    const card = this.node.getChildByName('Card');
    if (dim) dim.active = on;
    if (card) card.active = on;
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
    dim.addComponent(Graphics);
    this._fill(dim, Theme.veil);
    const dimW = dim.addComponent(Widget);
    dimW.isAlignTop = dimW.isAlignBottom = dimW.isAlignLeft = dimW.isAlignRight = true;
    dimW.top = dimW.bottom = dimW.left = dimW.right = 0;
    dimW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    dim.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      this.collapse();
    }, this);

    const card = this._mk('Card', this.node, CARD_W, CARD_H);
    paintQBoard(card.addComponent(Graphics), CARD_W, CARD_H);
    card.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
    }, this);
    this._label(card, 'Title', 'GM', 52, Theme.boardNum, 0, 186, 400, 72, true);
    this._btn(card, 'WinBtn', Theme.playFill, '一键胜利', 0, 36, () => this._onWin?.());
    this._btn(card, 'FailBtn', Theme.red, '一键失败', 0, -116, () => this._onFail?.());

    const toggle = this._mk('Toggle', this.node, TOGGLE_W, TOGGLE_H);
    paintQBtn(toggle.addComponent(Graphics), TOGGLE_W, TOGGLE_H, Theme.settingsFill, Theme.boardStroke);
    this._label(toggle, 'Label', 'GM', 30, Theme.playText, 0, 0, TOGGLE_W, TOGGLE_H, false);
    toggle.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      gameAudio()?.playUiClick();
      this._open = !this._open;
      this._setOpen(this._open);
    }, this);
  }

  private _btn(
    parent: Node,
    name: string,
    fill: Color,
    text: string,
    x: number,
    y: number,
    onTap: () => void,
  ): Node {
    const n = this._mk(name, parent, BTN_W, BTN_H);
    n.setPosition(x, y, 0);
    paintQBtn(n.addComponent(Graphics), BTN_W, BTN_H, fill, Theme.boardStroke);
    this._label(n, 'Label', text, 40, Theme.playText, 0, 0, BTN_W, BTN_H, false);
    n.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      gameAudio()?.playUiClick();
      this.collapse();
      onTap();
    }, this);
    return n;
  }

  private _mk(name: string, parent: Node, w: number, h: number): Node {
    const n = new Node(name);
    parent.addChild(n);
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform).setContentSize(w, h);
    return n;
  }

  private _fill(node: Node | null, color: Color): void {
    if (!node) return;
    const g = node.getComponent(Graphics);
    const ut = node.getComponent(UITransform);
    if (!g || !ut) return;
    const w = ut.contentSize.width;
    const h = ut.contentSize.height;
    g.clear();
    g.fillColor = color;
    g.rect(-w * 0.5, -h * 0.5, w, h);
    g.fill();
  }

  private _label(
    parent: Node,
    name: string,
    text: string,
    size: number,
    color: Color,
    x: number,
    y: number,
    w: number,
    h: number,
    big: boolean,
  ): Label {
    const n = this._mk(name, parent, w, h);
    n.setPosition(x, y, 0);
    const lab = n.addComponent(Label);
    lab.string = text;
    if (big) styleQNum(lab, size, color);
    else styleQCaption(lab, size, color);
    return lab;
  }
}
