import {
  _decorator,
  BlockInputEvents,
  Color,
  Component,
  EventTouch,
  Label,
  Layers,
  Node,
  Sprite,
  SpriteFrame,
  Texture2D,
  UITransform,
  Widget,
} from 'cc';
import { LEVEL_COUNT } from '../game/LevelCatalog';
import { uiSafeInsets, uiVisibleSize } from '../game/ViewFit';
import { GOLD_HUD, goldHudTopRight } from './GoldHud';
import { gameAudio } from '../audio/AudioService';

const { ccclass } = _decorator;

const CARD_W = 640;
const CARD_H = 1080;
const BTN_W = 480;
const BTN_H = 88;
const FIELD_W = 480;
const KEY_W = 140;
const KEY_H = 76;
const TOGGLE_W = 96;
const TOGGLE_H = 64;
const FPS_W = 96;
const FPS_H = 44;
const FPS_GAP = 12;
const SHOW_GM_ENTRY = false;

const INK = new Color(56, 36, 24, 255);
const CARD_BG = new Color(255, 248, 236, 255);
const INPUT_BG = new Color(255, 255, 255, 255);
const DIM = new Color(32, 20, 12, 150);
const WIN_BG = new Color(236, 140, 48, 255);
const FAIL_BG = new Color(220, 72, 72, 255);
const SKIP_BG = new Color(64, 148, 220, 255);
const RESET_BG = new Color(48, 168, 132, 255);
const KEY_BG = new Color(236, 220, 196, 255);
const KEY_INK = new Color(56, 36, 24, 255);
const TOGGLE_BG = new Color(236, 156, 64, 255);
const FPS_BG = new Color(32, 20, 12, 160);
const FPS_GOOD = new Color(96, 220, 120, 255);
const FPS_OK = new Color(248, 208, 72, 255);
const FPS_BAD = new Color(236, 88, 72, 255);
const BTN_TEXT = new Color(255, 255, 255, 255);
const PLACE = new Color(160, 120, 88, 255);

let _white: SpriteFrame | null = null;

function whiteFrame(): SpriteFrame {
  if (_white) return _white;
  const tex = new Texture2D();
  tex.reset({
    width: 2,
    height: 2,
    format: Texture2D.PixelFormat.RGBA8888,
  });
  tex.uploadData(new Uint8Array(16).fill(255));
  const sf = new SpriteFrame();
  sf.texture = tex;
  _white = sf;
  return sf;
}

@ccclass('GmPanel')
export class GmPanel extends Component {
  private _built = false;
  private _open = false;
  private _onWin: (() => void) | null = null;
  private _onFail: (() => void) | null = null;
  private _onReset: (() => void) | null = null;
  private _onSkip: ((level: number) => void) | null = null;
  private _onAddGold: ((delta: number) => void) | null = null;
  private _onSetGold: ((n: number) => void) | null = null;
  private _level = 1;
  private _draft = '';
  private _levelLab: Label | null = null;
  private _fpsLab: Label | null = null;
  private _fpsAcc = 0;
  private _fpsFrames = 0;
  private _entryShown = SHOW_GM_ENTRY;

  setup(opts: {
    onWin: () => void;
    onFail: () => void;
    onReset?: () => void;
    onSkip: (level: number) => void;
    onAddGold?: (delta: number) => void;
    onSetGold?: (n: number) => void;
  }): void {
    this._onWin = opts.onWin;
    this._onFail = opts.onFail;
    this._onReset = opts.onReset ?? null;
    this._onSkip = opts.onSkip;
    this._onAddGold = opts.onAddGold ?? null;
    this._onSetGold = opts.onSetGold ?? null;
    this._ensureTree();
    this.collapse();
    this.layoutChrome();
  }

  setLevel(n: number): void {
    this._level = Math.max(1, Math.min(LEVEL_COUNT, n | 0));
    const title = this.node.getChildByName('Card')?.getChildByName('Title')?.getComponent(Label);
    if (title) title.string = `GM  第${this._level}关`;
  }

  collapse(): void {
    this._open = false;
    this._setOpen(false);
  }

  revealEntry(): void {
    if (this._entryShown) return;
    this._entryShown = true;
    this.layoutChrome();
  }

  layoutChrome(): void {
    this._ensureTree();
    const vis = uiVisibleSize();
    this.node.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    this.node.getComponent(Widget)?.updateAlignment();
    const dim = this.node.getChildByName('Dim');
    dim?.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    dim?.getComponent(Widget)?.updateAlignment();
    this.node.getChildByName('Card')?.getComponent(UITransform)?.setContentSize(CARD_W, CARD_H);
    this.node.getChildByName('Card')?.setPosition(0, 20, 0);
    const toggle = this.node.getChildByName('Toggle');
    const fps = this.node.getChildByName('Fps');
    const safe = uiSafeInsets();
    const gold = goldHudTopRight(vis.w, vis.h, safe.top, safe.right);
    const goldShown = !!this.node.parent?.getChildByName('GoldHud')?.active;
    const toggleX = vis.w * 0.5 - TOGGLE_W * 0.5 - GOLD_HUD.pad;
    const toggleY = goldShown
      ? gold.y - GOLD_HUD.rootH * 0.5 - GOLD_HUD.gapBelow - TOGGLE_H * 0.5
      : gold.y;
    if (toggle) {
      toggle.active = this._entryShown;
      toggle.setPosition(toggleX, toggleY, 0);
    }
    if (fps) {
      fps.active = this._entryShown;
      fps.setPosition(toggleX, toggleY - TOGGLE_H * 0.5 - FPS_GAP - FPS_H * 0.5, 0);
    }
  }

  update(dt: number): void {
    if (!this._fpsLab) return;
    this._fpsAcc += dt;
    this._fpsFrames++;
    if (this._fpsAcc < 0.4) return;
    const fps = Math.round(this._fpsFrames / this._fpsAcc);
    this._fpsLab.string = `${fps}`;
    this._fpsLab.color = fps >= 50 ? FPS_GOOD : fps >= 30 ? FPS_OK : FPS_BAD;
    this._fpsAcc = 0;
    this._fpsFrames = 0;
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
    this._paint(dim, DIM, vis.w, vis.h);
    dim.addComponent(BlockInputEvents);
    const dimW = dim.addComponent(Widget);
    dimW.isAlignTop = dimW.isAlignBottom = dimW.isAlignLeft = dimW.isAlignRight = true;
    dimW.top = dimW.bottom = dimW.left = dimW.right = 0;
    dimW.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    dim.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      this.collapse();
    }, this);

    const card = this._mk('Card', this.node, CARD_W, CARD_H);
    this._paint(card, CARD_BG, CARD_W, CARD_H);
    card.addComponent(BlockInputEvents);
    card.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
    }, this);
    this._label(card, 'Title', `GM  第${this._level}关`, 42, INK, 0, 430, 520, 56);
    this._btn(card, 'WinBtn', WIN_BG, '一键胜利', BTN_TEXT, 0, 322, () => this._onWin?.());
    this._btn(card, 'FailBtn', FAIL_BG, '一键失败', BTN_TEXT, 0, 218, () => this._onFail?.());
    this._btn(card, 'ResetBtn', RESET_BG, '重置关卡', BTN_TEXT, 0, 114, () => this._onReset?.());
    this._btn(card, 'Gold100', TOGGLE_BG, '+100', BTN_TEXT, -164, 22, () => this._onAddGold?.(100), 148, 64, false);
    this._btn(card, 'Gold1k', TOGGLE_BG, '+1000', BTN_TEXT, 0, 22, () => this._onAddGold?.(1000), 148, 64, false);
    this._btn(card, 'GoldZero', FAIL_BG, '清零', BTN_TEXT, 164, 22, () => this._onSetGold?.(0), 148, 64, false);
    this._levelLab = this._field(card, 0, -68);
    this._pad(card);

    const toggle = this._mk('Toggle', this.node, TOGGLE_W, TOGGLE_H);
    toggle.active = this._entryShown;
    this._paint(toggle, TOGGLE_BG, TOGGLE_W, TOGGLE_H);
    this._label(toggle, 'Label', 'GM', 28, BTN_TEXT, 0, 0, TOGGLE_W, TOGGLE_H);
    const fps = this._mk('Fps', this.node, FPS_W, FPS_H);
    fps.active = this._entryShown;
    this._paint(fps, FPS_BG, FPS_W, FPS_H);
    this._fpsLab = this._label(fps, 'Label', '--', 26, FPS_GOOD, 0, 0, FPS_W, FPS_H);
    toggle.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      gameAudio()?.playUiClick();
      this._open = !this._open;
      if (this._open) {
        this._draft = '';
        this._syncDraft();
      }
      this._setOpen(this._open);
    }, this);
  }

  private _field(parent: Node, x: number, y: number): Label {
    const n = this._mk('LevelField', parent, FIELD_W, BTN_H);
    n.setPosition(x, y, 0);
    this._paint(n, INPUT_BG, FIELD_W, BTN_H);
    const lab = this._label(n, 'Value', this._draft || '关卡号', 44, this._draft ? INK : PLACE, 0, 0, FIELD_W - 24, BTN_H);
    n.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      this._draft = '';
      this._syncDraft();
    }, this);
    return lab;
  }

  private _pad(card: Node): void {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '删', '0', '跳关'];
    const gapX = 16;
    const gapY = 16;
    const originX = -KEY_W - gapX;
    const originY = -178;
    for (let i = 0; i < keys.length; i++) {
      const col = i % 3;
      const row = (i / 3) | 0;
      const key = keys[i];
      const fill = key === '跳关' ? SKIP_BG : KEY_BG;
      const color = key === '跳关' ? BTN_TEXT : KEY_INK;
      this._btn(
        card,
        `Key_${key}`,
        fill,
        key,
        color,
        originX + col * (KEY_W + gapX),
        originY - row * (KEY_H + gapY),
        () => this._onKey(key),
        KEY_W,
        KEY_H,
        false,
      );
    }
  }

  private _onKey(key: string): void {
    if (key === '跳关') {
      this._skip();
      return;
    }
    if (key === '删') {
      this._draft = this._draft.slice(0, -1);
      this._syncDraft();
      return;
    }
    if (this._draft.length >= 3) return;
    this._draft += key;
    this._syncDraft();
  }

  private _syncDraft(): void {
    if (!this._levelLab) return;
    this._levelLab.string = this._draft || '关卡号';
    this._levelLab.color = this._draft ? INK : PLACE;
  }

  private _skip(): void {
    const raw = Number(this._draft);
    const n = Number.isFinite(raw) && this._draft
      ? Math.max(1, Math.min(LEVEL_COUNT, raw | 0))
      : this._level;
    this.collapse();
    this._onSkip?.(n);
  }

  private _btn(
    parent: Node,
    name: string,
    fill: Color,
    text: string,
    color: Color,
    x: number,
    y: number,
    onTap: () => void,
    w = BTN_W,
    h = BTN_H,
    close = true,
  ): Node {
    const n = this._mk(name, parent, w, h);
    n.setPosition(x, y, 0);
    this._paint(n, fill, w, h);
    this._label(n, 'Label', text, h >= 80 ? 36 : 32, color, 0, 0, w, h);
    n.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      gameAudio()?.playUiClick();
      if (close) this.collapse();
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

  private _paint(node: Node, color: Color, w: number, h: number): void {
    let sp = node.getComponent(Sprite);
    if (!sp) sp = node.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.type = Sprite.Type.SIMPLE;
    sp.spriteFrame = whiteFrame();
    sp.color = color;
    sp.enabled = true;
    node.getComponent(UITransform)?.setContentSize(w, h);
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
    lab.lineHeight = size + 8;
    lab.isBold = true;
    lab.color = color;
    lab.enableOutline = false;
    lab.enableShadow = false;
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    lab.overflow = Label.Overflow.SHRINK;
    lab.useSystemFont = true;
    lab.fontFamily = 'PingFang SC';
    return lab;
  }
}
