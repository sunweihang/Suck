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

@ccclass('SettingsPanel')
export class SettingsPanel extends Component {
  private _built = false;
  private _onClose: (() => void) | null = null;

  setup(opts: { onClose: () => void }): void {
    this._onClose = opts.onClose;
    this._ensureTree();
    this.layoutChrome();
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
    const dim = this.node.getChildByName('Dim');
    dim?.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    this._fill(dim, Theme.veil);
    this.node.getChildByName('Card')?.setPosition(0, 40, 0);
    const safe = uiSafeInsets();
    this.node.getChildByName('CloseBtn')?.setPosition(
      vis.w * 0.5 - safe.right - 88,
      vis.h * 0.5 - safe.top - 88,
      0,
    );
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
    const card = this._mk('Card', this.node, 860, 720);
    card.addComponent(Graphics);
    this._fill(card, Theme.panel);
    this._label(card, 'Title', 'SETTINGS', 56, Theme.title, 0, 260, 700, 80);
    this._label(card, 'Body', '拖章鱼到墙前平台开始拆墙\n同色合成，只吸本色小块', 32, Theme.subtitle, 0, 40, 760, 160);
    const close = this._mk('CloseBtn', this.node, 112, 112);
    close.addComponent(Graphics);
    this._fill(close, Theme.settingsFill, 22);
    this._label(close, 'Label', 'BACK', 28, Theme.settingsText, 0, 0, 112, 112);
    close.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      this._onClose?.();
    }, this);
  }

  private _mk(name: string, parent: Node, w: number, h: number): Node {
    const n = new Node(name);
    parent.addChild(n);
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform).setContentSize(w, h);
    return n;
  }

  private _fill(node: Node | null, color: Color, radius = 0): void {
    if (!node) return;
    const g = node.getComponent(Graphics);
    const ut = node.getComponent(UITransform);
    if (!g || !ut) return;
    const w = ut.contentSize.width;
    const h = ut.contentSize.height;
    g.clear();
    g.fillColor = color;
    if (radius > 0) g.roundRect(-w * 0.5, -h * 0.5, w, h, radius);
    else g.rect(-w * 0.5, -h * 0.5, w, h);
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
  ): Label {
    const n = this._mk(name, parent, w, h);
    n.setPosition(x, y, 0);
    const lab = n.addComponent(Label);
    lab.string = text;
    lab.fontSize = size;
    lab.lineHeight = size + 10;
    lab.isBold = true;
    lab.color = color;
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    return lab;
  }
}
