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
import { isTutorialLevel } from '../game/LevelCatalog';
import { Theme } from '../game/Theme';
import { uiSafeInsets, uiVisibleSize } from '../game/ViewFit';
import { fitBox, paintQBtn, styleQCaption, styleQNum } from './QChrome';
import { applyArtSprite, paintQNumber } from './UiArt';

const { ccclass } = _decorator;

@ccclass('HomePanel')
export class HomePanel extends Component {
  private _built = false;
  private _level = 1;
  private _maxLevel = 1;
  private _onPlay: (() => void) | null = null;
  private _onSettings: (() => void) | null = null;
  private _onPrev: (() => void) | null = null;
  private _onNext: (() => void) | null = null;

  setup(opts: {
    onPlay: () => void;
    onSettings: () => void;
    onPrevLevel: () => void;
    onNextLevel: () => void;
  }): void {
    this._onPlay = opts.onPlay;
    this._onSettings = opts.onSettings;
    this._onPrev = opts.onPrevLevel;
    this._onNext = opts.onNextLevel;
    this._ensureTree();
    this.setLevel(this._level, this._maxLevel);
    this.layoutChrome();
    this.show();
  }

  applyArt(): void {
    this._ensureTree();
    this._paintBg();
    const board = this.node.getChildByName('Content')?.getChildByName('LevelBoard');
    applyArtSprite(board?.getChildByName('Board') ?? null, 'board', 660, 308);
    applyArtSprite(board?.getChildByName('Chip') ?? null, 'chip', 176, 76);
    paintQNumber(board?.getChildByName('Digits') ?? null, this._level, 152);
  }

  setLevel(n: number, max = this._maxLevel): void {
    this._level = n;
    this._maxLevel = Math.max(1, max);
    const board = this.node.getChildByName('Content')?.getChildByName('LevelBoard');
    paintQNumber(board?.getChildByName('Digits') ?? null, n, 152);
    const chip = board?.getChildByName('Chip')?.getChildByName('ChipLab')?.getComponent(Label);
    if (chip) chip.string = isTutorialLevel(n) ? '引导' : '关';
    const foot = this.node.getChildByName('Content')?.getChildByName('Footer')?.getComponent(Label);
    if (foot) {
      foot.string = isTutorialLevel(n)
        ? '把同色章鱼拖到墙前平台  ·  只吸本色'
        : '拖拽合成  ·  只吸本色';
    }
    this._paintNav('PrevLevel', n > 1);
    this._paintNav('NextLevel', n < this._maxLevel);
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
    this._paintBg();
    const safe = uiSafeInsets();
    content?.getChildByName('Title')?.setPosition(0, vis.h * 0.24, 0);
    content?.getChildByName('LevelBoard')?.setPosition(0, vis.h * 0.06, 0);
    content?.getChildByName('PrevLevel')?.setPosition(-268, vis.h * 0.06, 0);
    content?.getChildByName('NextLevel')?.setPosition(268, vis.h * 0.06, 0);
    content?.getChildByName('PlayBtn')?.setPosition(0, -120, 0);
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
    this._paintBg();
    this._label(content, 'Title', 'SUCK', 108, Theme.boardNum, 720, 140, true);
    this._levelBoard(content);
    this._btn(content, 'PrevLevel', 112, 112, Theme.settingsFill, Theme.boardStroke, '<', 56, Theme.playText, () => this._onPrev?.());
    this._btn(content, 'NextLevel', 112, 112, Theme.settingsFill, Theme.boardStroke, '>', 56, Theme.playText, () => this._onNext?.());
    this._playBtn(content);
    this._btn(content, 'SettingsBtn', 120, 120, Theme.settingsFill, Theme.boardStroke, 'SET', 34, Theme.playText, () => this._onSettings?.());
    this._label(content, 'Footer', '拖拽合成  ·  只吸本色', 26, Theme.subtitle, 800, 40, false);
  }

  private _levelBoard(parent: Node): Node {
    const w = 660;
    const h = 308;
    const board = this._mk('LevelBoard', parent, w, h);
    const face = this._mk('Board', board, w, h);
    applyArtSprite(face, 'board', w, h);
    const chip = this._mk('Chip', board, 176, 76);
    chip.setPosition(0, 148, 0);
    applyArtSprite(chip, 'chip', 176, 76);
    this._label(chip, 'ChipLab', '引导', 30, Theme.title, 176, 76, false);
    const digits = this._mk('Digits', board, 500, 168);
    digits.setPosition(0, -10, 0);
    paintQNumber(digits, this._level, 152);
    return board;
  }

  private _mk(name: string, parent: Node, w: number, h: number): Node {
    const n = new Node(name);
    parent.addChild(n);
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform).setContentSize(w, h);
    return n;
  }

  private _label(
    parent: Node,
    name: string,
    text: string,
    size: number,
    color: Color,
    w: number,
    h: number,
    big: boolean,
  ): Label {
    const n = this._mk(name, parent, w, h);
    const lab = n.addComponent(Label);
    lab.string = text;
    if (big) styleQNum(lab, size, color);
    else styleQCaption(lab, size, color);
    fitBox(n, w, h);
    return lab;
  }

  private _playBtn(parent: Node): Node {
    const w = 560;
    const h = 180;
    const n = this._btn(parent, 'PlayBtn', w, h, Theme.playFill, Theme.boardStroke, 'PLAY', 78, Theme.playText, () => this._onPlay?.());
    n.on(Node.EventType.TOUCH_START, () => n.setScale(0.96, 0.96, 1), this);
    n.on(Node.EventType.TOUCH_CANCEL, () => n.setScale(1, 1, 1), this);
    n.on(Node.EventType.TOUCH_END, () => n.setScale(1, 1, 1), this);
    return n;
  }

  private _paintNav(name: string, on: boolean): void {
    const n = this.node.getChildByName('Content')?.getChildByName(name);
    if (!n) return;
    n.setScale(on ? 1 : 0.88, on ? 1 : 0.88, 1);
    const g = n.getComponent(Graphics);
    const ut = n.getComponent(UITransform);
    if (!g || !ut) return;
    const fill = on ? Theme.settingsFill : Theme.dim;
    paintQBtn(g, ut.contentSize.width, ut.contentSize.height, fill, Theme.boardStroke);
  }

  private _paintBg(): void {
    const vis = uiVisibleSize();
    const dim = this.node.getChildByName('Content')?.getChildByName('Dim');
    if (!dim) return;
    const scale = Math.max(vis.w / 1024, vis.h / 1536);
    const w = Math.ceil(1024 * scale);
    const h = Math.ceil(1536 * scale);
    dim.getComponent(UITransform)?.setContentSize(w, h);
    if (applyArtSprite(dim, 'bg', w, h)) {
      dim.getComponent(Graphics)?.clear();
      return;
    }
    this._fill(dim, Theme.sky);
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
    fill: Color,
    stroke: Color,
    text: string,
    fontSize: number,
    textColor: Color,
    onTap: () => void,
  ): Node {
    const n = this._mk(name, parent, w, h);
    paintQBtn(n.addComponent(Graphics), w, h, fill, stroke);
    const labN = this._mk('Label', n, w, h);
    const lab = labN.addComponent(Label);
    lab.string = text;
    styleQCaption(lab, fontSize, textColor);
    n.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      onTap();
    }, this);
    return n;
  }
}
