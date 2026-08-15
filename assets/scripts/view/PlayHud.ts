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
import { isTutorialLevel, levelTitle } from '../game/LevelCatalog';
import { Theme } from '../game/Theme';
import { uiSafeInsets, uiVisibleSize } from '../game/ViewFit';
import { fitBox, paintQBtn, styleQCaption, styleQNum } from './QChrome';
import { applyLevelBadge, layoutLevelBadge } from './UiArt';
import { gameAudio } from '../audio/AudioService';

const { ccclass } = _decorator;

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
    back?.off(Node.EventType.TOUCH_END);
    back?.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      gameAudio()?.playUiClick();
      this._onHome?.();
    }, this);
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
    layoutLevelBadge(this.node.getChildByName('ScoreBoard'), this._level, 360, 84, 42);
  }

  setLevel(n: number): void {
    this._level = n;
    layoutLevelBadge(this.node.getChildByName('ScoreBoard'), n, 360, 84, 42);
    this._syncTip();
  }

  showCleared(cleared: number, hasNext: boolean): void {
    const win = this.node.getChildByName('WinLabel');
    const lab = win?.getComponent(Label);
    if (lab) {
      lab.string = hasNext
        ? `${levelTitle(cleared)}完成`
        : '全部通关';
    }
    if (win) win.active = true;
    const next = this.node.getChildByName('NextBtn');
    if (next) next.active = hasNext;
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
    this.node.getChildByName('BackBtn')?.setPosition(-vis.w * 0.5 + 118, top - 72, 0);
    this.node.getChildByName('ScoreBoard')?.setPosition(0, top - 56, 0);
    this.node.getChildByName('TipLab')?.setPosition(0, top - 140, 0);
    this.node.getChildByName('WinLabel')?.setPosition(0, 80, 0);
    this.node.getChildByName('NextBtn')?.setPosition(0, -80, 0);
  }

  private _syncTip(): void {
    const on = isTutorialLevel(this._level);
    const tip = this.node.getChildByName('TipLab');
    if (tip) tip.active = on;
    const hint = this.node.getChildByName('HintHand');
    if (hint && this.hintHand && !on) this.hintHand.hide();
    else if (hint) hint.active = on;
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

    const back = this._mk('BackBtn', 168, 88);
    paintQBtn(back.addComponent(Graphics), 168, 88, Theme.settingsFill, Theme.boardStroke);
    this._lab(back, 'HOME', 34, Theme.settingsText, 168, 88, false);

    this._scoreBoard();

    const tip = this._mk('TipLab', 880, 56);
    this._lab(tip, '把同色章鱼拖到墙前平台', 30, Theme.playText, 880, 56, false);

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
    const w = 360;
    const h = 84;
    const board = this._mk('ScoreBoard', w, h);
    const face = this._mk('Board', w, h, board);
    applyLevelBadge(face, w, h);
    this._mk('Title', Math.round(w * 0.88), Math.round(h * 0.78), board);
    layoutLevelBadge(board, this._level, w, h, 42);
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
