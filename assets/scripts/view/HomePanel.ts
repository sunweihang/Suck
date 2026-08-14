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

const { ccclass } = _decorator;

@ccclass('HomePanel')
export class HomePanel extends Component {
  private _built = false;
  private _onPlay: (() => void) | null = null;
  private _onSettings: (() => void) | null = null;

  setup(opts: { onPlay: () => void; onSettings: () => void }): void {
    this._onPlay = opts.onPlay;
    this._onSettings = opts.onSettings;
    this._ensureTree();
    this.layoutChrome();
    this.show();
  }

  show(): void {
    this.node.active = true;
    this.layoutChrome();
  }

  hide(): void {
    this.node.active = false;
  }

  layoutChrome(): void {
    this._ensureTree();
    const vis = uiVisibleSize();
    this.node.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    this.node.getComponent(Widget)?.updateAlignment();
    const content = this.node.getChildByName('Content');
    content?.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    const dim = content?.getChildByName('Dim');
    dim?.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    this._fill(dim, new Color(8, 18, 28, 150));
    const safe = uiSafeInsets();
    content?.getChildByName('Title')?.setPosition(0, vis.h * 0.18, 0);
    content?.getChildByName('PlayBtn')?.setPosition(0, -40, 0);
    content?.getChildByName('SettingsBtn')?.setPosition(
      vis.w * 0.5 - safe.right - 88,
      vis.h * 0.5 - safe.top - 88,
      0,
    );
    content?.getChildByName('Footer')?.setPosition(0, -vis.h * 0.5 + safe.bottom + 56, 0);
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

    const content = this._mk('Content', this.node, vis.w, vis.h);
    const dim = this._mk('Dim', content, vis.w, vis.h);
    dim.addComponent(Graphics);
    this._fill(dim, new Color(8, 18, 28, 150));
    this._label(content, 'Title', 'SUCK', 96, Theme.title, 720, 120);
    this._playBtn(content);
    this._btn(content, 'SettingsBtn', 112, 112, 22, Theme.settingsFill, Theme.subtitle, 'SET', 32, Theme.settingsText, () => this._onSettings?.());
    this._label(content, 'Footer', '拖拽合成  ·  只吸本色', 24, Theme.dim, 800, 40);
  }

  private _mk(name: string, parent: Node, w: number, h: number): Node {
    const n = new Node(name);
    parent.addChild(n);
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform).setContentSize(w, h);
    return n;
  }

  private _label(parent: Node, name: string, text: string, size: number, color: Color, w: number, h: number): Label {
    const n = this._mk(name, parent, w, h);
    const lab = n.addComponent(Label);
    lab.string = text;
    lab.fontSize = size;
    lab.lineHeight = size + 8;
    lab.isBold = true;
    lab.color = color;
    lab.enableOutline = true;
    lab.outlineWidth = 3;
    lab.outlineColor = new Color(8, 12, 20, 200);
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    return lab;
  }

  private _playBtn(parent: Node): Node {
    const w = 560;
    const h = 180;
    const n = this._btn(parent, 'PlayBtn', w, h, 40, Theme.playFill, Theme.playStroke, 'PLAY', 72, Theme.playText, () => this._onPlay?.());
    n.on(Node.EventType.TOUCH_START, () => n.setScale(0.96, 0.96, 1), this);
    n.on(Node.EventType.TOUCH_CANCEL, () => n.setScale(1, 1, 1), this);
    n.on(Node.EventType.TOUCH_END, () => n.setScale(1, 1, 1), this);
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

  private _btn(
    parent: Node,
    name: string,
    w: number,
    h: number,
    radius: number,
    fill: Color,
    stroke: Color,
    text: string,
    fontSize: number,
    textColor: Color,
    onTap: () => void,
  ): Node {
    const n = this._mk(name, parent, w, h);
    const g = n.addComponent(Graphics);
    g.fillColor = fill;
    g.roundRect(-w * 0.5, -h * 0.5, w, h, radius);
    g.fill();
    g.strokeColor = stroke;
    g.lineWidth = 4;
    g.roundRect(-w * 0.5, -h * 0.5, w, h, radius);
    g.stroke();
    const labN = this._mk('Label', n, w, h);
    const lab = labN.addComponent(Label);
    lab.string = text;
    lab.fontSize = fontSize;
    lab.isBold = true;
    lab.color = textColor;
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    n.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      onTap();
    }, this);
    return n;
  }
}
