import {
  _decorator,
  Component,
  EventTouch,
  Node,
  Tween,
  UITransform,
  Vec3,
  Widget,
  tween,
} from 'cc';
import { gameAudio } from '../audio/AudioService';
import { coverBackgroundSize, portraitVisibleSize } from '../game/PortraitFit';
import { Theme } from '../game/Theme';
import { ensureBtnChrome, VOLCANO_BTN_H, VOLCANO_BTN_W } from './UiArt';

const { ccclass } = _decorator;

const BREATH_HI = 1.06;
const BREATH_SEC = 0.9;

@ccclass('HomePanel')
export class HomePanel extends Component {
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
    this._bindEvents();
  }

  applyArt(): void {
    ensureBtnChrome(this._playNode(), VOLCANO_BTN_W, VOLCANO_BTN_H, Theme.playFill, Theme.playStroke, 'winDouble');
  }

  setLevel(n: number, max = this._maxLevel): void {
    this._level = n;
    this._maxLevel = Math.max(1, max);
  }

  show(): void {
    this.node.active = true;
    this._hideLinkTeaser();
    this.layoutChrome();
    this._startBreath();
  }

  hide(): void {
    this._stopBreath();
    this.node.active = false;
  }

  layoutChrome(): void {
    this.node.getComponent(Widget)?.updateAlignment();
    this._layoutCoverBg();
    this.node.getChildByName('Content')?.getComponent(Widget)?.updateAlignment();
    this._playNode()?.getComponent(Widget)?.updateAlignment();
    this._hideLinkTeaser();
  }

  private _layoutCoverBg(): void {
    const bg = this.node.getChildByName('Bg');
    if (!bg) return;
    const widget = bg.getComponent(Widget);
    if (widget) {
      widget.isAlignTop = widget.isAlignBottom = false;
      widget.isAlignLeft = widget.isAlignRight = false;
      widget.isAlignHorizontalCenter = widget.isAlignVerticalCenter = true;
      widget.horizontalCenter = 0;
      widget.verticalCenter = 0;
    }
    const vis = portraitVisibleSize();
    const cover = coverBackgroundSize(vis.width, vis.height);
    bg.getComponent(UITransform)?.setContentSize(cover.w, cover.h);
    widget?.updateAlignment();
  }

  private _content(): Node | null {
    return this.node.getChildByName('Content');
  }

  private _playNode(): Node | null {
    return this._content()?.getChildByName('PlayBtn') ?? null;
  }

  private _hideLinkTeaser(): void {
    const btn = this._content()?.getChildByName('LinkBtn');
    if (btn) btn.active = false;
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
}
