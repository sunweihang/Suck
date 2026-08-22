import {
  _decorator,
  BlockInputEvents,
  Color,
  Component,
  EventTouch,
  Graphics,
  Label,
  Layers,
  Node,
  Tween,
  UIOpacity,
  UITransform,
  Vec3,
  Widget,
  tween,
} from 'cc';
import { vibrateShort } from '../game/Haptic';
import {
  displayLinkLevel,
  findLinkPath,
  firstLinkMove,
  LINK_GOLD,
  linkRgbOf,
  makeLinkBoard,
  remainingPairs,
  shuffleLinkBoard,
  type LinkBoard,
  type LinkPoint,
} from '../game/LinkPlay';
import { Theme } from '../game/Theme';
import { uiSafeInsets, uiVisibleSize } from '../game/ViewFit';
import { gameAudio } from '../audio/AudioService';
import { applyArtSpriteSoon, ensureBtnChrome, VOLCANO_BTN_H, VOLCANO_BTN_W } from './UiArt';
import { paintCapsuleBtn, paintLevelBadge, styleLevelBadge, styleQCaption } from './QChrome';

const { ccclass } = _decorator;

const BG = new Color(254, 248, 220, 255);
const LINE = new Color(255, 92, 148, 255);
const PICK = new Color(255, 255, 255, 255);
const HINT_INK = new Color(120, 96, 72, 255);
const TITLE_INK = new Color(255, 214, 64, 255);
const TITLE_OUTLINE = new Color(88, 48, 16, 255);
const BTN_INK = new Color(255, 255, 255, 255);
const NEXT_OUTLINE = new Color(20, 64, 32, 255);
const NEXT_FILL = new Color(88, 196, 96, 255);
const GOLD_INK = new Color(248, 225, 128, 255);
const TOOL_FILL = new Color(255, 196, 96, 255);
const TOOL_STROKE = new Color(214, 88, 28, 255);
const BADGE_W = 280;
const BADGE_H = 88;
const SETTINGS = 132;
const TOOL_W = 200;
const TOOL_H = 72;
const CELL_GAP = 10;
const BTN_W = VOLCANO_BTN_W;
const BTN_H = VOLCANO_BTN_H;

@ccclass('LinkPlayPanel')
export class LinkPlayPanel extends Component {
  private _built = false;
  private _board: LinkBoard | null = null;
  private _pick = -1;
  private _busy = false;
  private _paused = false;
  private _cell = 120;
  private _onHome: (() => void) | null = null;
  private _onWin: (() => void) | null = null;
  private _onSettings: (() => void) | null = null;

  setup(opts: { onHome: () => void; onWin: () => void; onSettings: () => void }): void {
    this._onHome = opts.onHome;
    this._onWin = opts.onWin;
    this._onSettings = opts.onSettings;
    this._ensureTree();
    this._bindEvents();
    this.layoutChrome();
  }

  isOpen(): boolean {
    return this.node.active;
  }

  show(id: number): void {
    this._ensureTree();
    this._paused = false;
    this._busy = false;
    this._pick = -1;
    this.node.active = true;
    this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);
    this.reload(id);
    this._hideWin();
    this.layoutChrome();
  }

  hide(): void {
    Tween.stopAllByTarget(this._winCard());
    this._clearLine();
    this.node.active = false;
    this._busy = false;
    this._paused = false;
    this._board = null;
  }

  setPaused(on: boolean): void {
    this._paused = on;
  }

  reload(id?: number): void {
    const n = id ?? this._board?.id ?? 1;
    this._board = makeLinkBoard(n);
    this._pick = -1;
    this._busy = false;
    this._hideWin();
    this._syncBadge();
    this._rebuildTiles();
    this._clearLine();
    this._syncHint();
  }

  layoutChrome(): void {
    this._ensureTree();
    const vis = uiVisibleSize();
    const safe = uiSafeInsets();
    this.node.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    this.node.getComponent(Widget)?.updateAlignment();
    const bg = this.node.getChildByName('Bg');
    bg?.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    this._fillBg(bg, vis.w, vis.h);
    const top = vis.h * 0.5 - safe.top - 16;
    this._settingsBtn()?.setPosition(-vis.w * 0.5 + 88, top - 56, 0);
    this._badge()?.setPosition(0, top - 56, 0);
    this._tools()?.setPosition(0, -vis.h * 0.5 + safe.bottom + 88, 0);
    this._placeBoard(vis.w, vis.h, safe.top, safe.bottom);
    this._placeWin(vis.w, vis.h);
    this._syncBadge();
    this._paintTools();
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
    if (!this.node.getComponent(BlockInputEvents)) this.node.addComponent(BlockInputEvents);

    this._mk('Bg', this.node, vis.w, vis.h);
    const settings = this._mk('SettingsBtn', this.node, SETTINGS, SETTINGS);
    this._mk('Gear', settings, 72, 72);
    const badge = this._mk('Badge', this.node, BADGE_W, BADGE_H);
    this._mk('Skin', badge, BADGE_W, BADGE_H);
    const lab = this._mk('Label', badge, BADGE_W - 24, BADGE_H - 16);
    styleLevelBadge(lab.addComponent(Label), 40);
    this._mk('Board', this.node, 960, 960);
    this._mk('Line', this.node, vis.w, vis.h);
    const tools = this._mk('Tools', this.node, 640, TOOL_H + 8);
    this._toolBtn(tools, 'HintBtn', '提示');
    this._toolBtn(tools, 'ShuffleBtn', '重排');
    this._hint(this.node, 'Tip', '点两个相同的方块连起来', vis.w - 80, 48);
    this._ensureWin();
  }

  private _ensureWin(): void {
    const card = this._mk('WinCard', this.node, 860, 640);
    card.active = false;
    if (!card.getComponent(UIOpacity)) card.addComponent(UIOpacity);
    if (!card.getComponent(BlockInputEvents)) card.addComponent(BlockInputEvents);
    this._title(card, 'Title', '挑战成功', 84);
    this._hint(card, 'Gold', `+${LINK_GOLD} 金币`, 720, 64);
    const btn = this._mk('NextBtn', card, BTN_W, BTN_H);
    this._label(btn, 'Label', '继续游戏', 40, BTN_INK, BTN_W - 24, BTN_H - 16, NEXT_OUTLINE);
  }

  private _toolBtn(parent: Node, name: string, text: string): Node {
    const n = this._mk(name, parent, TOOL_W, TOOL_H);
    this._label(n, 'Label', text, 36, BTN_INK, TOOL_W - 16, TOOL_H - 12, TOOL_STROKE);
    return n;
  }

  private _bindEvents(): void {
    this._bindTap(this._settingsBtn(), () => this._onSettings?.());
    this._bindTap(this._tools()?.getChildByName('HintBtn'), () => this._hintMove());
    this._bindTap(this._tools()?.getChildByName('ShuffleBtn'), () => this._shuffle());
    this._bindTap(this._winCard()?.getChildByName('NextBtn'), () => {
      if (this._busy) return;
      this._onWin?.();
    });
  }

  private _bindTap(node: Node | null | undefined, onTap: () => void): void {
    if (!node) return;
    node.off(Node.EventType.TOUCH_END);
    node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      if (this._paused) return;
      gameAudio()?.playUiClick();
      onTap();
    }, this);
  }

  private _placeBoard(w: number, h: number, top: number, bottom: number): void {
    const board = this._boardN();
    if (!board) return;
    const cols = this._board?.cols ?? 4;
    const rows = this._board?.rows ?? 4;
    const usableW = Math.max(280, w - 56);
    const usableH = Math.max(280, h - top - bottom - 340);
    this._cell = Math.max(64, Math.min(168, usableW / cols - CELL_GAP, usableH / rows - CELL_GAP));
    const bw = cols * this._cell + (cols - 1) * CELL_GAP;
    const bh = rows * this._cell + (rows - 1) * CELL_GAP;
    board.getComponent(UITransform)?.setContentSize(bw, bh);
    board.setPosition(0, 20, 0);
    const line = this.node.getChildByName('Line');
    line?.getComponent(UITransform)?.setContentSize(w, h);
    line?.setPosition(0, 0, 0);
    this.node.getChildByName('Tip')?.setPosition(0, -h * 0.5 + bottom + 168, 0);
    this._layoutTiles();
    this._paintTools();
  }

  private _rebuildTiles(): void {
    const board = this._boardN();
    const data = this._board;
    if (!board || !data) return;
    const keep = new Set<string>();
    for (let r = 0; r < data.rows; r++) {
      for (let c = 0; c < data.cols; c++) {
        const name = `T_${r}_${c}`;
        keep.add(name);
        let n = board.getChildByName(name);
        if (!n) {
          n = this._mk(name, board, this._cell, this._cell);
          n.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
            e.propagationStopped = true;
            const cols = this._board?.cols ?? 0;
            this._tap(r * cols + c);
          }, this);
        }
      }
    }
    for (let i = board.children.length - 1; i >= 0; i--) {
      const kid = board.children[i];
      if (!keep.has(kid.name)) kid.destroy();
    }
    this._layoutTiles();
  }

  private _layoutTiles(): void {
    const board = this._boardN();
    const data = this._board;
    if (!board || !data) return;
    for (let r = 0; r < data.rows; r++) {
      for (let c = 0; c < data.cols; c++) {
        const n = board.getChildByName(`T_${r}_${c}`);
        if (!n) continue;
        const kind = data.cells[r * data.cols + c];
        n.active = kind > 0;
        n.getComponent(UITransform)?.setContentSize(this._cell, this._cell);
        const p = this._cellPos(r, c);
        n.setPosition(p.x, p.y, 0);
        if (kind > 0) this._paintTile(n, kind, this._pick === r * data.cols + c);
      }
    }
  }

  private _cellPos(r: number, c: number): { x: number; y: number } {
    const cols = this._board?.cols ?? 1;
    const rows = this._board?.rows ?? 1;
    const step = this._cell + CELL_GAP;
    const w = cols * this._cell + (cols - 1) * CELL_GAP;
    const h = rows * this._cell + (rows - 1) * CELL_GAP;
    return {
      x: -w * 0.5 + this._cell * 0.5 + c * step,
      y: h * 0.5 - this._cell * 0.5 - r * step,
    };
  }

  private _pathPos(p: LinkPoint): { x: number; y: number } {
    const cols = this._board?.cols ?? 1;
    const rows = this._board?.rows ?? 1;
    const rr = Math.max(-0.62, Math.min(rows - 0.38, p.r));
    const cc = Math.max(-0.62, Math.min(cols - 0.38, p.c));
    return this._cellPos(rr, cc);
  }

  private _paintTile(node: Node, kind: number, pick: boolean): void {
    let g = node.getComponent(Graphics);
    if (!g) g = node.addComponent(Graphics);
    const rgb = linkRgbOf(kind);
    const fill = new Color(rgb[0], rgb[1], rgb[2], 255);
    const s = this._cell;
    const r = s * 0.22;
    g.clear();
    g.fillColor = new Color(48, 32, 56, 40);
    g.roundRect(-s * 0.5 + 4, -s * 0.5 - 6, s, s, r);
    g.fill();
    g.fillColor = fill;
    g.roundRect(-s * 0.5, -s * 0.5, s, s, r);
    g.fill();
    g.fillColor = new Color(255, 255, 255, 110);
    g.roundRect(-s * 0.5 + 10, s * 0.08, s - 20, s * 0.28, r * 0.45);
    g.fill();
    const eye = Math.max(4, s * 0.07);
    g.fillColor = new Color(48, 32, 56, 230);
    g.circle(-s * 0.16, s * 0.06, eye);
    g.circle(s * 0.16, s * 0.06, eye);
    g.fill();
    g.strokeColor = new Color(48, 32, 56, 230);
    g.lineWidth = Math.max(3, s * 0.045);
    g.arc(0, -s * 0.06, s * 0.18, Math.PI * 1.12, Math.PI * 1.88, false);
    g.stroke();
    if (pick) {
      g.strokeColor = PICK;
      g.lineWidth = Math.max(6, s * 0.08);
      g.roundRect(-s * 0.5 + 3, -s * 0.5 + 3, s - 6, s - 6, r);
      g.stroke();
    }
  }

  private _tap(index: number): void {
    if (this._paused || this._busy || !this._board) return;
    if (this._winCard()?.active) return;
    const kind = this._board.cells[index];
    if (kind <= 0) return;
    gameAudio()?.playUiClick();
    if (this._pick < 0 || this._pick === index) {
      this._pick = this._pick === index ? -1 : index;
      this._layoutTiles();
      return;
    }
    const path = findLinkPath(this._board.cells, this._board.rows, this._board.cols, this._pick, index);
    if (!path) {
      this._pick = index;
      this._layoutTiles();
      return;
    }
    this._clearPair(this._pick, index, path);
  }

  private _clearPair(a: number, b: number, path: LinkPoint[]): void {
    if (!this._board) return;
    this._busy = true;
    this._drawPath(path);
    vibrateShort();
    gameAudio()?.playRemove();
    this._board.cells[a] = 0;
    this._board.cells[b] = 0;
    this._pick = -1;
    this._popTile(a);
    this._popTile(b);
    this.scheduleOnce(() => {
      if (!this.node.isValid) return;
      this._clearLine();
      this._layoutTiles();
      this._syncHint();
      if (remainingPairs(this._board?.cells ?? []) <= 0) {
        this._showWin();
        return;
      }
      if (!firstLinkMove(this._board!)) shuffleLinkBoard(this._board!);
      this._layoutTiles();
      this._busy = false;
    }, 0.28);
  }

  private _popTile(index: number): void {
    const data = this._board;
    const board = this._boardN();
    if (!data || !board) return;
    const r = (index / data.cols) | 0;
    const c = index % data.cols;
    const n = board.getChildByName(`T_${r}_${c}`);
    if (!n) return;
    Tween.stopAllByTarget(n);
    tween(n)
      .to(0.18, { scale: new Vec3(0.12, 0.12, 1) }, { easing: 'backIn' })
      .call(() => {
        if (n.isValid) n.setScale(1, 1, 1);
      })
      .start();
  }

  private _drawPath(path: LinkPoint[]): void {
    const line = this.node.getChildByName('Line');
    if (!line) return;
    let g = line.getComponent(Graphics);
    if (!g) g = line.addComponent(Graphics);
    g.clear();
    if (path.length < 2) return;
    const board = this._boardN();
    const origin = board?.position ?? new Vec3();
    g.strokeColor = LINE;
    g.lineWidth = Math.max(10, this._cell * 0.16);
    const a = this._pathPos(path[0]);
    g.moveTo(origin.x + a.x, origin.y + a.y);
    for (let i = 1; i < path.length; i++) {
      const p = this._pathPos(path[i]);
      g.lineTo(origin.x + p.x, origin.y + p.y);
    }
    g.stroke();
  }

  private _clearLine(): void {
    this.node.getChildByName('Line')?.getComponent(Graphics)?.clear();
  }

  private _hintMove(): void {
    if (this._paused || this._busy || !this._board || this._winCard()?.active) return;
    const mv = firstLinkMove(this._board);
    if (!mv) {
      shuffleLinkBoard(this._board);
      this._layoutTiles();
      return;
    }
    this._pick = mv[0];
    this._layoutTiles();
    const path = findLinkPath(this._board.cells, this._board.rows, this._board.cols, mv[0], mv[1]);
    if (path) this._drawPath(path);
    this.scheduleOnce(() => {
      if (!this.node.isValid) return;
      this._clearLine();
    }, 0.7);
  }

  private _shuffle(): void {
    if (this._paused || this._busy || !this._board || this._winCard()?.active) return;
    shuffleLinkBoard(this._board);
    this._pick = -1;
    this._clearLine();
    this._rebuildTiles();
  }

  private _showWin(): void {
    this._busy = true;
    gameAudio()?.playWin();
    const card = this._winCard();
    if (!card) {
      this._onWin?.();
      return;
    }
    card.active = true;
    const gold = card.getChildByName('Gold')?.getComponent(Label);
    if (gold) gold.string = `+${LINK_GOLD} 金币`;
    ensureBtnChrome(card.getChildByName('NextBtn'), BTN_W, BTN_H, NEXT_FILL, NEXT_OUTLINE, 'winAction');
    const op = card.getComponent(UIOpacity) ?? card.addComponent(UIOpacity);
    op.opacity = 255;
    Tween.stopAllByTarget(card);
    card.setScale(0.82, 0.82, 1);
    tween(card).to(0.28, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
  }

  private _hideWin(): void {
    const card = this._winCard();
    if (!card) return;
    Tween.stopAllByTarget(card);
    card.active = false;
  }

  private _placeWin(_w: number, _h: number): void {
    const card = this._winCard();
    if (!card) return;
    card.setPosition(0, 40, 0);
    card.getChildByName('Title')?.setPosition(0, 160, 0);
    card.getChildByName('Gold')?.setPosition(0, 40, 0);
    const btn = card.getChildByName('NextBtn');
    btn?.setPosition(0, -140, 0);
    ensureBtnChrome(btn, BTN_W, BTN_H, NEXT_FILL, NEXT_OUTLINE, 'winAction');
  }

  private _syncBadge(): void {
    const lab = this._badge()?.getChildByName('Label')?.getComponent(Label);
    if (lab) lab.string = `连线 ${String(displayLinkLevel(this._board?.id ?? 1)).padStart(2, '0')}`;
    const skin = this._badge()?.getChildByName('Skin');
    if (skin) {
      let g = skin.getComponent(Graphics);
      if (!g) g = skin.addComponent(Graphics);
      paintLevelBadge(g, BADGE_W, BADGE_H);
    }
    applyArtSpriteSoon(this._settingsBtn()?.getChildByName('Gear') ?? null, 'settingsGear', 72, 72);
  }

  private _syncHint(): void {
    const n = remainingPairs(this._board?.cells ?? []);
    const lab = this.node.getChildByName('Tip')?.getComponent(Label);
    if (lab) lab.string = n > 0 ? `还剩 ${n} 对` : '点两个相同的方块连起来';
  }

  private _paintTools(): void {
    const tools = this._tools();
    if (!tools) return;
    const hint = tools.getChildByName('HintBtn');
    const shuffle = tools.getChildByName('ShuffleBtn');
    hint?.setPosition(-TOOL_W * 0.5 - 16, 0, 0);
    shuffle?.setPosition(TOOL_W * 0.5 + 16, 0, 0);
    for (const n of [hint, shuffle]) {
      if (!n) continue;
      let g = n.getComponent(Graphics);
      if (!g) g = n.addComponent(Graphics);
      paintCapsuleBtn(g, TOOL_W, TOOL_H, TOOL_FILL, TOOL_STROKE);
    }
  }

  private _fillBg(node: Node | null, w: number, h: number): void {
    if (!node) return;
    let g = node.getComponent(Graphics);
    if (!g) g = node.addComponent(Graphics);
    g.clear();
    g.fillColor = BG;
    g.rect(-w * 0.5, -h * 0.5, w, h);
    g.fill();
    g.fillColor = Theme.veil;
    g.rect(-w * 0.5, -h * 0.5, w, h);
    g.fill();
  }

  private _title(parent: Node, name: string, text: string, size: number): Label {
    const n = this._mk(name, parent, 860, 120);
    const lab = n.addComponent(Label);
    lab.string = text;
    lab.fontSize = size;
    lab.lineHeight = size + 10;
    lab.isBold = true;
    lab.color = TITLE_INK;
    lab.enableOutline = true;
    lab.outlineWidth = 8;
    lab.outlineColor = TITLE_OUTLINE;
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    lab.useSystemFont = true;
    lab.fontFamily = 'PingFang SC';
    return lab;
  }

  private _hint(parent: Node, name: string, text: string, w: number, h: number): Label {
    const n = this._mk(name, parent, w, h);
    const lab = n.addComponent(Label);
    styleQCaption(lab, 30, HINT_INK);
    lab.string = text;
    lab.color = HINT_INK;
    return lab;
  }

  private _label(
    parent: Node,
    name: string,
    text: string,
    size: number,
    color: Color,
    w: number,
    h: number,
    outline: Color,
  ): Label {
    const n = parent.getChildByName(name) ?? this._mk(name, parent, w, h);
    const lab = n.getComponent(Label) ?? n.addComponent(Label);
    lab.string = text;
    lab.fontSize = size;
    lab.lineHeight = size + 8;
    lab.isBold = true;
    lab.color = color;
    lab.enableOutline = true;
    lab.outlineWidth = 4;
    lab.outlineColor = outline;
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    lab.overflow = Label.Overflow.SHRINK;
    lab.useSystemFont = true;
    lab.fontFamily = 'PingFang SC';
    return lab;
  }

  private _settingsBtn(): Node | null {
    return this.node.getChildByName('SettingsBtn');
  }

  private _badge(): Node | null {
    return this.node.getChildByName('Badge');
  }

  private _boardN(): Node | null {
    return this.node.getChildByName('Board');
  }

  private _tools(): Node | null {
    return this.node.getChildByName('Tools');
  }

  private _winCard(): Node | null {
    return this.node.getChildByName('WinCard');
  }

  private _mk(name: string, parent: Node, w: number, h: number): Node {
    const n = new Node(name);
    parent.addChild(n);
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform).setContentSize(w, h);
    return n;
  }
}
