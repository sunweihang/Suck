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
} from 'cc';
import { Theme } from '../game/Theme';
import { uiSafeInsets, uiVisibleSize } from '../game/ViewFit';

const { ccclass } = _decorator;

@ccclass('PlayHud')
export class PlayHud extends Component {
  private _built = false;
  private _onHome: (() => void) | null = null;

  setup(opts: { onHome: () => void }): void {
    this._onHome = opts.onHome;
    this._ensureTree();
    const back = this.node.getChildByName('BackBtn');
    back?.off(Node.EventType.TOUCH_END);
    back?.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      this._onHome?.();
    }, this);
    this.layoutChrome();
  }

  show(): void {
    this.node.active = true;
    this.layoutChrome();
  }

  hide(): void {
    this.node.active = false;
  }

  get winLabel(): Label | null {
    return this.node.getChildByName('WinLabel')?.getComponent(Label) ?? null;
  }

  get powerRoot(): Node | null {
    return this.node.getChildByName('Powers');
  }

  layoutChrome(): void {
    this._ensureTree();
    const vis = uiVisibleSize();
    const safe = uiSafeInsets();
    this.node.getChildByName('BackBtn')?.setPosition(-vis.w * 0.5 + 120, vis.h * 0.5 - safe.top - 80, 0);
    this.node.getChildByName('Tip')?.setPosition(0, vis.h * 0.5 - safe.top - 80, 0);
    this.node.getChildByName('WinLabel')?.setPosition(0, 80, 0);
  }

  private _ensureTree(): void {
    if (this._built) return;
    this._built = true;
    this.node.layer = Layers.Enum.UI_2D;
    this.node.addComponent(UITransform).setContentSize(0, 0);

    const back = this._mk('BackBtn', 160, 80);
    const g = back.addComponent(Graphics);
    g.fillColor = Theme.settingsFill;
    g.roundRect(-80, -40, 160, 80, 18);
    g.fill();
    this._lab(back, 'HOME', 32, Theme.settingsText, 160, 80);

    const tip = this._mk('Tip', 720, 48);
    const tipUt = tip.getComponent(UITransform);
    if (tipUt) tipUt.hitTest = () => false;
    this._lab(tip, '拖到墙前平台  ·  同色合成', 28, Theme.subtitle, 720, 48);

    const win = this._mk('WinLabel', 800, 80);
    win.active = false;
    this._lab(win, '墙体已拆完', 56, Theme.title, 800, 80);

    this._mk('Powers', 0, 0).active = false;
  }

  private _mk(name: string, w: number, h: number, parent: Node = this.node): Node {
    const n = new Node(name);
    parent.addChild(n);
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform).setContentSize(w, h);
    return n;
  }

  private _lab(node: Node, text: string, size: number, color: Color, w: number, h: number): Label {
    let lab = node.getComponent(Label);
    if (!lab) lab = node.addComponent(Label);
    lab.string = text;
    lab.fontSize = size;
    lab.isBold = true;
    lab.color = color;
    lab.enableOutline = true;
    lab.outlineWidth = 2;
    lab.outlineColor = new Color(8, 12, 20, 200);
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    node.getComponent(UITransform)?.setContentSize(w, h);
    return lab;
  }
}
