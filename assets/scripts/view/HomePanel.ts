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
import { DESIGN_H, DESIGN_W, Theme } from '../game/Theme';
import { uiVisibleSize } from '../game/ViewFit';
import { paintQBtn, styleQCaption } from './QChrome';
import { applyArtSprite, artFrame } from './UiArt';
import { gameAudio } from '../audio/AudioService';

const { ccclass } = _decorator;

const PLAY_SCALE = 2 / 3;
const BREATH_HI = 1.06;
const BREATH_SEC = 0.9;

@ccclass('HomePanel')
export class HomePanel extends Component {
  private _built = false;
  private _level = 1;
  private _maxLevel = 1;
  private _onPlay: (() => void) | null = null;
  private _onSettings: (() => void) | null = null;
  private _pressed = false;

  setup(opts: {
    onPlay: () => void;
    onSettings: () => void;
  }): void {
    this._onPlay = opts.onPlay;
    this._onSettings = opts.onSettings;
    this._ensureTree();
    this.setLevel(this._level, this._maxLevel);
    this.layoutChrome();
    this.show();
  }

  applyArt(): void {
    this._ensureTree();
    this._paintBg();
    this._paintPlayBtn();
    this._paintSettings();
  }

  setLevel(n: number, max = this._maxLevel): void {
    this._level = n;
    this._maxLevel = Math.max(1, max);
  }

  show(): void {
    this.node.active = true;
    this.layoutChrome();
    this._startBreath();
  }

  hide(): void {
    this._stopBreath();
    this.node.active = false;
  }

  layoutChrome(): void {
    this._ensureTree();
    const vis = uiVisibleSize();
    this.node.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    this.node.getComponent(Widget)?.updateAlignment();
    const content = this._content();
    content?.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    this.node.getChildByName('Dim')?.getComponent(Widget)?.updateAlignment();
    this._paintBg();
    this._paintSettings();
    const title = content?.getChildByName('Title');
    if (title) title.active = false;
    for (const name of ['LevelBoard', 'PrevLevel', 'NextLevel', 'Footer']) {
      const n = content?.getChildByName(name);
      if (n) n.active = false;
    }
    content?.getChildByName('PlayBtn')?.setPosition(0, -vis.h * 0.32, 0);
    const settings = content?.getChildByName('SettingsBtn');
    if (settings) settings.active = false;
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

    if (this.node.getChildByName('Content')) {
      this._bindEvents();
      return;
    }

    const dim = this._mk('Dim', this.node, vis.w, vis.h);
    dim.setSiblingIndex(0);
    dim.addComponent(Graphics);
    const dimW = dim.addComponent(Widget);
    dimW.isAlignTop = dimW.isAlignBottom = dimW.isAlignLeft = dimW.isAlignRight = true;
    dimW.top = dimW.bottom = dimW.left = dimW.right = 0;
    dimW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    const content = this._mk('Content', this.node, vis.w, vis.h);
    this._paintBg();
    this._playBtn(content);
    this._btn(content, 'SettingsBtn', 120, 120, Theme.settingsFill, Theme.boardStroke, '设置', 32, Theme.playText);
    this._bindEvents();
  }

  private _content(): Node | null {
    return this.node.getChildByName('Content');
  }

  private _playNode(): Node | null {
    return this._content()?.getChildByName('PlayBtn') ?? null;
  }

  private _bindEvents(): void {
    const play = this._playNode();
    play?.off(Node.EventType.TOUCH_START);
    play?.off(Node.EventType.TOUCH_CANCEL);
    play?.off(Node.EventType.TOUCH_END);
    play?.on(Node.EventType.TOUCH_START, () => {
      this._pressed = true;
      this._stopBreath();
      play.setScale(0.96, 0.96, 1);
    }, this);
    play?.on(Node.EventType.TOUCH_CANCEL, () => {
      this._pressed = false;
      this._startBreath();
    }, this);
    play?.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      this._pressed = false;
      e.propagationStopped = true;
      gameAudio()?.playUiClick();
      this._onPlay?.();
      this._startBreath();
    }, this);
    this._bindTap(this._content()?.getChildByName('SettingsBtn'), () => this._onSettings?.());
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

  private _startBreath(): void {
    const play = this._playNode();
    if (!play || this._pressed || !this.node.active) return;
    Tween.stopAllByTarget(play);
    play.setScale(1, 1, 1);
    tween(play)
      .to(BREATH_SEC, { scale: new Vec3(BREATH_HI, BREATH_HI, 1) }, { easing: 'sineInOut' })
      .to(BREATH_SEC, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
      .union()
      .repeatForever()
      .start();
  }

  private _stopBreath(): void {
    const play = this._playNode();
    if (!play) return;
    Tween.stopAllByTarget(play);
  }

  private _mk(name: string, parent: Node, w: number, h: number): Node {
    const n = new Node(name);
    parent.addChild(n);
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform).setContentSize(w, h);
    return n;
  }

  private _playSize(): { w: number; h: number } {
    const w = Math.round(740 * PLAY_SCALE);
    const sf = artFrame('play');
    const ow = sf?.originalSize.width || 1069;
    const oh = sf?.originalSize.height || 423;
    return { w, h: Math.round((w * oh) / ow) };
  }

  private _playBtn(parent: Node): Node {
    const { w, h } = this._playSize();
    const n = this._mk('PlayBtn', parent, w, h);
    this._paintPlayBtn(n);
    return n;
  }

  private _paintPlayBtn(node?: Node | null): void {
    const n = node ?? this._playNode();
    if (!n) return;
    const { w, h } = this._playSize();
    applyArtSprite(n, 'play', w, h);
    const g = n.getComponent(Graphics);
    if (g) g.enabled = false;
    const lab = n.getChildByName('Label');
    if (lab) lab.active = false;
  }

  private _paintSettings(): void {
    const n = this._content()?.getChildByName('SettingsBtn');
    const g = n?.getComponent(Graphics);
    const ut = n?.getComponent(UITransform);
    if (!g || !ut) return;
    paintQBtn(g, ut.contentSize.width, ut.contentSize.height, Theme.settingsFill, Theme.boardStroke);
  }

  private _paintBg(): void {
    const dim = this.node.getChildByName('Dim');
    if (dim) dim.active = false;
    const vis = uiVisibleSize();
    let bg = this.node.getChildByName('Bg');
    if (!bg) {
      bg = this._mk('Bg', this.node, vis.w, vis.h);
      bg.setSiblingIndex(0);
    }
    const scale = Math.max(vis.w / DESIGN_W, vis.h / DESIGN_H);
    applyArtSprite(bg, 'home', Math.ceil(DESIGN_W * scale), Math.ceil(DESIGN_H * scale));
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
  ): Node {
    const n = this._mk(name, parent, w, h);
    paintQBtn(n.addComponent(Graphics), w, h, fill, stroke);
    const labN = this._mk('Label', n, w, h);
    const lab = labN.addComponent(Label);
    lab.string = text;
    styleQCaption(lab, fontSize, textColor);
    return n;
  }
}
