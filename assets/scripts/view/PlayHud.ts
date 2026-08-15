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
import { HintHand } from '../battle/HintHand';
import { Theme } from '../game/Theme';
import { uiSafeInsets, uiVisibleSize } from '../game/ViewFit';
import { fitBox, paintQBtn, styleQCaption, styleQNum } from './QChrome';
import { layoutHomeLevel } from './UiArt';
import { gameAudio } from '../audio/AudioService';

const { ccclass } = _decorator;

const PLAY_BADGE = 360;
const PLAY_DIGIT_H = 150;

@ccclass('PlayHud')
export class PlayHud extends Component {
  private _built = false;
  private _level = 1;
  private _onHome: (() => void) | null = null;
  private _onNext: (() => void) | null = null;

  setup(opts: { onHome: () => void; onNext?: () => void }): void {
    this._onHome = opts.onHome;
    this._onNext = opts.onNext ?? null;
    this._ensureTree();
    const back = this.node.getChildByName('BackBtn');
    if (back) back.active = false;
    const next = this.node.getChildByName('NextBtn');
    next?.off(Node.EventType.TOUCH_END);
    next?.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      gameAudio()?.playUiClick();
      this._onNext?.();
    }, this);
    this.layoutChrome();
  }

  show(): void {
    this.node.active = true;
    const next = this.node.getChildByName('NextBtn');
    if (next) next.active = false;
    this._syncTip();
    this.layoutChrome();
  }

  hide(): void {
    this.node.active = false;
  }

  applyArt(): void {
    this._ensureTree();
    layoutHomeLevel(this.node.getChildByName('ScoreBoard'), this._level, PLAY_BADGE, PLAY_DIGIT_H);
  }

  setLevel(n: number): void {
    this._level = n;
    layoutHomeLevel(this.node.getChildByName('ScoreBoard'), n, PLAY_BADGE, PLAY_DIGIT_H);
    this._syncTip();
  }

  showCleared(_cleared: number, _hasNext: boolean): void {
    const win = this.node.getChildByName('WinLabel');
    if (win) win.active = false;
    const next = this.node.getChildByName('NextBtn');
    if (next) next.active = false;
    const tip = this.node.getChildByName('TipLab');
    if (tip) tip.active = false;
    this.hintHand?.hide();
  }

  get hintHand(): HintHand | null {
    return this.node.getChildByName('HintHand')?.getComponent(HintHand) ?? null;
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
    const top = vis.h * 0.5 - safe.top;
    const back = this.node.getChildByName('BackBtn');
    if (back) back.active = false;
    this.node.getChildByName('ScoreBoard')?.setPosition(0, top - PLAY_BADGE * 0.52, 0);
    this.node.getChildByName('TipLab')?.setPosition(0, top - PLAY_BADGE - 16, 0);
    this.node.getChildByName('WinLabel')?.setPosition(0, 80, 0);
    this.node.getChildByName('NextBtn')?.setPosition(0, -80, 0);
  }

  private _syncTip(): void {
    const tip = this.node.getChildByName('TipLab');
    if (tip) tip.active = false;
    const hint = this.node.getChildByName('HintHand');
    if (hint) hint.active = false;
    this.hintHand?.hide();
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

    this._scoreBoard();

    const tip = this._mk('TipLab', 880, 56);
    tip.active = false;

    const win = this._mk('WinLabel', 860, 96);
    win.active = false;
    this._lab(win, '墙体已拆完', 64, Theme.boardNum, 860, 96, true);

    const next = this._mk('NextBtn', 400, 108);
    next.active = false;
    paintQBtn(next.addComponent(Graphics), 400, 108, Theme.playFill, Theme.boardStroke);
    this._lab(next, '下一关', 44, Theme.playText, 400, 108, false);

    this._mk('Powers', 0, 0).active = false;

    const hand = this._mk('HintHand', 160, 220);
    hand.addComponent(HintHand);
    hand.active = false;
  }

  private _scoreBoard(): Node {
    const board = this._mk('ScoreBoard', PLAY_BADGE, PLAY_BADGE);
    this._mk('Board', PLAY_BADGE, PLAY_BADGE, board);
    this._mk('Title', Math.round(PLAY_BADGE * 0.78), Math.round(PLAY_BADGE * 0.52), board);
    layoutHomeLevel(board, this._level, PLAY_BADGE, PLAY_DIGIT_H);
    return board;
  }

  private _mk(name: string, w: number, h: number, parent: Node = this.node): Node {
    const n = new Node(name);
    parent.addChild(n);
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform).setContentSize(w, h);
    return n;
  }

  private _lab(
    node: Node,
    text: string,
    size: number,
    color: Color,
    w: number,
    h: number,
    big: boolean,
  ): Label {
    let lab = node.getComponent(Label);
    if (!lab) lab = node.addComponent(Label);
    lab.string = text;
    if (big) styleQNum(lab, size, color);
    else styleQCaption(lab, size, color);
    fitBox(node, w, h);
    return lab;
  }
}
