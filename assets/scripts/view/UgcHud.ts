import {
  _decorator,
  Color,
  Component,
  EventTouch,
  Label,
  Layers,
  Node,
  Sprite,
  UITransform,
  Widget,
} from 'cc';
import { ColorToken } from '../game/GameConfig';
import { PLAY_ITEM_BAR, itemTrayTopFromBottom, uiSafeInsets, uiVisibleSize } from '../game/ViewFit';
import { UGC_MAX_DEPTH, UGC_MIN_DEPTH, type UgcTool } from '../ugc/UgcStore';
import { gameAudio } from '../audio/AudioService';
import { GOLD_HUD } from './GoldHud';
import { styleQCaption } from './QChrome';
import { applyArtSpriteSoon, fillInvisibleHit, layoutHomeLevel } from './UiArt';
import { UgcTextPanel } from './UgcTextPanel';

const { ccclass } = _decorator;

const SETTINGS_CIRCLE = 120;
const SETTINGS_W = 140;
const ITEM_HIT = 128;
const ITEM_ICON = 112;
const ITEM_GAP = 4;
const ITEM_PAD_X = 28;
const ITEM_BADGE = 48;
const ITEM_TRAY_H = PLAY_ITEM_BAR.trayH;
const LAYER_BADGE = 240;
const LAYER_DIGIT = 64;
const INK = new Color(110, 104, 168, 255);
const BADGE_INK = new Color(255, 255, 255, 255);
const BADGE_OUTLINE = new Color(160, 40, 72, 255);

const TOOLS = ['add', 'del', 'prev', 'next', 'undo', 'preview', 'edit'] as const;
type ToolId = (typeof TOOLS)[number];
const TOOL_ICON = {
  add: 'icUgcAdd',
  prev: 'icUgcDown',
  next: 'icUgcUp',
  undo: 'icUgcUndo',
  del: 'icUgcDel',
  preview: 'icUgcVis',
  edit: 'icUgcEdit',
} as const;
const TOOL_CAPTION: Record<ToolId, string> = {
  add: '加层',
  prev: '下层',
  next: '上层',
  undo: '撤销',
  del: '删层',
  preview: '预览',
  edit: '编辑',
};

const SIDE = ['clear', 'load', 'export', 'exit'] as const;
type SideId = (typeof SIDE)[number];
const SIDE_ICON = {
  clear: 'icUgcNew',
  load: 'icUgcLoad',
  export: 'icUgcExport',
  exit: 'icUgcExit',
} as const;
const SIDE_CAPTION: Record<SideId, string> = {
  clear: '新建',
  load: '加载',
  export: '分享',
  exit: '退出',
};
const SIDE_H = 156;
const SIDE_GAP = 8;

@ccclass('UgcHud')
export class UgcHud extends Component {
  private _built = false;
  private _token: ColorToken = 'c';
  private _tool: UgcTool = 'paint';
  private _layer = 0;
  private _depth = 4;
  private _bricks = 0;
  private _canUndo = false;
  private _undoCount = 0;
  private _showAll = false;
  private _onBack: (() => void) | null = null;
  private _onPlay: (() => void) | null = null;
  private _onTool: ((t: UgcTool) => void) | null = null;
  private _onLayer: ((n: number) => void) | null = null;
  private _onDepth: ((n: number) => void) | null = null;
  private _onUndo: (() => void) | null = null;
  private _onDel: (() => void) | null = null;
  private _onPreview: (() => void) | null = null;
  private _onEdit: (() => void) | null = null;
  private _onLoad: ((text: string) => string | true) | null = null;
  private _onExport: (() => string) | null = null;
  private _onClear: (() => void) | null = null;
  private _onExit: (() => void) | null = null;
  private _textDlg: UgcTextPanel | null = null;

  setup(opts: {
    onBack: () => void;
    onPlay: () => void;
    onTool: (t: UgcTool) => void;
    onLayer: (n: number) => void;
    onDepth: (n: number) => void;
    onUndo: () => void;
    onDel: () => void;
    onPreview: () => void;
    onEdit: () => void;
    onLoad: (text: string) => string | true;
    onExport: () => string;
    onClear: () => void;
    onExit: () => void;
  }): void {
    this._onBack = opts.onBack;
    this._onPlay = opts.onPlay;
    this._onTool = opts.onTool;
    this._onLayer = opts.onLayer;
    this._onDepth = opts.onDepth;
    this._onUndo = opts.onUndo;
    this._onDel = opts.onDel;
    this._onPreview = opts.onPreview;
    this._onEdit = opts.onEdit;
    this._onLoad = opts.onLoad;
    this._onExport = opts.onExport;
    this._onClear = opts.onClear;
    this._onExit = opts.onExit;
    this.hide();
  }

  show(): void {
    this.node.active = true;
    this.layoutChrome();
    this._paint();
  }

  hide(): void {
    this.node.active = false;
  }

  applyArt(): void {
    if (!this.node.active) return;
    this._ensureTree();
    this._paint();
  }

  setState(opts: {
    token: ColorToken;
    tool: UgcTool;
    layer: number;
    depth: number;
    bricks: number;
    canUndo: boolean;
    undoCount: number;
    showAll: boolean;
  }): void {
    this._token = opts.token;
    this._tool = opts.tool;
    this._layer = opts.layer;
    this._depth = opts.depth;
    this._bricks = opts.bricks;
    this._canUndo = opts.canUndo;
    this._undoCount = opts.undoCount;
    this._showAll = opts.showAll;
    this._paint();
  }

  hitsChrome(loc: { x: number; y: number }): boolean {
    if (!this.node.activeInHierarchy) return false;
    const dlg = this.node.getChildByName('TextDlg');
    if (dlg?.activeInHierarchy) return true;
    const names = ['ScoreBoard', 'Tools', 'SideRail'];
    for (let i = 0; i < names.length; i++) {
      const n = this.node.getChildByName(names[i]);
      if (n && this._hits(n, loc)) return true;
    }
    return false;
  }

  layoutChrome(): void {
    if (!this.node.active) return;
    this._ensureTree();
    const vis = uiVisibleSize();
    const safe = uiSafeInsets();
    const pad = GOLD_HUD.pad;
    const chromeY = vis.h * 0.5 - GOLD_HUD.rootH * 0.5 - safe.top - pad;
    const board = this._layerBoard();
    board.setPosition(0, chromeY + 8, 0);
    const back = this.node.getChildByName('BackBtn');
    if (back) back.active = false;
    const rail = this.node.getChildByName('SideRail');
    if (rail) {
      const rightX = vis.w * 0.5 - SETTINGS_W * 0.5 - safe.right - pad;
      const stackH = SIDE_H * SIDE.length + SIDE_GAP * Math.max(0, SIDE.length - 1);
      const startY = chromeY - 24;
      const midY = startY - (stackH - SIDE_H) * 0.5;
      rail.getComponent(UITransform)?.setContentSize(SETTINGS_W, stackH);
      rail.setPosition(rightX, midY, 0);
      SIDE.forEach((id, i) => {
        rail.getChildByName(`Side_${id}`)?.setPosition(0, startY - i * (SIDE_H + SIDE_GAP) - midY, 0);
      });
    }
    const play = this.node.getChildByName('PlayBtn');
    if (play) play.active = false;
    const tray = this._traySize();
    const tools = this.node.getChildByName('Tools');
    if (tools) {
      tools.getComponent(UITransform)?.setContentSize(tray.w, tray.h);
      tools.setPosition(0, -vis.h * 0.5 + itemTrayTopFromBottom(vis.h, safe.bottom) - tray.h * 0.5, 0);
    }
    const dlg = this.node.getChildByName('TextDlg');
    if (dlg?.active) dlg.setSiblingIndex(this.node.children.length - 1);
  }

  private _hits(node: Node, loc: { x: number; y: number }): boolean {
    if (!node.activeInHierarchy) return false;
    if (node.getComponent(UITransform)?.hitTest(loc)) return true;
    for (const child of node.children) {
      if (this._hits(child, loc)) return true;
    }
    return false;
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

    const leftoverBack = this.node.getChildByName('BackBtn');
    if (leftoverBack) leftoverBack.active = false;
    const leftoverPlay = this.node.getChildByName('PlayBtn');
    if (leftoverPlay) leftoverPlay.active = false;
    this._layerBoard();
    this._toolBar();
    this._sideRail();
    this._textPanel();
  }

  private _textPanel(): UgcTextPanel {
    if (this._textDlg) return this._textDlg;
    const n = this._mk('TextDlg', 1080, 1920);
    n.active = false;
    this._textDlg = n.addComponent(UgcTextPanel);
    this._textDlg.hide();
    return this._textDlg;
  }

  private _sideRail(): Node {
    const root = this._mk('SideRail', SETTINGS_W, SIDE_H * SIDE.length + SIDE_GAP * Math.max(0, SIDE.length - 1));
    SIDE.forEach((id) => this._sideBtn(root, id));
    return root;
  }

  private _sideBtn(root: Node, id: SideId): Node {
    const n = this._mk(`Side_${id}`, SETTINGS_W, SIDE_H, root);
    const bg = this._mk('Bg', SETTINGS_CIRCLE, SETTINGS_CIRCLE, n);
    bg.setPosition(0, 22, 0);
    const icon = this._mk('Icon', 80, 80, n);
    icon.setPosition(0, 22, 0);
    const lab = this._mk('Lab', 120, 40, n);
    lab.setPosition(0, -28, 0);
    this._lab(lab, SIDE_CAPTION[id], 28, INK, 120, 40);
    const caption = lab.getComponent(Label);
    if (caption) {
      caption.outlineColor = Color.WHITE;
      caption.outlineWidth = 3;
    }
    this._armSide(n, id);
    return n;
  }

  private _armSide(n: Node, id: SideId): void {
    fillInvisibleHit(n);
    this._noHit(n.getChildByName('Bg'));
    this._noHit(n.getChildByName('Icon'));
    this._noHit(n.getChildByName('Lab'));
    this._bindTap(n, () => this._onSideTap(id));
  }

  private _noHit(node: Node | null): void {
    const ut = node?.getComponent(UITransform) as (UITransform & { hitTest?: () => boolean }) | null;
    if (ut) ut.hitTest = () => false;
  }

  private _onSideTap(id: SideId): void {
    if (id === 'clear') this._onClear?.();
    else if (id === 'load') this._textPanel().showLoad((text) => this._onLoad?.(text) ?? '未就绪');
    else if (id === 'export') this._textPanel().showExport(this._onExport?.() ?? '');
    else if (id === 'exit') (this._onExit ?? this._onBack)?.();
  }

  private _layerBoard(): Node {
    let board = this.node.getChildByName('ScoreBoard');
    if (!board) {
      board = this._mk('ScoreBoard', LAYER_BADGE, LAYER_BADGE);
      this._mk('Board', LAYER_BADGE, LAYER_BADGE, board);
      this._mk('Title', Math.round(LAYER_BADGE * 0.78), Math.round(LAYER_DIGIT * 1.2), board);
    }
    const title = this.node.getChildByName('Title');
    if (title) title.active = false;
    const tip = this.node.getChildByName('TipLab');
    if (tip) tip.active = false;
    layoutHomeLevel(board, this._layer + 1, LAYER_BADGE, LAYER_DIGIT);
    return board;
  }

  private _traySize(): { w: number; h: number } {
    const span = TOOLS.length * ITEM_HIT + Math.max(0, TOOLS.length - 1) * ITEM_GAP;
    return { w: span + ITEM_PAD_X * 2, h: ITEM_TRAY_H };
  }

  private _itemPos(i: number): { x: number; y: number } {
    const span = TOOLS.length * ITEM_HIT + Math.max(0, TOOLS.length - 1) * ITEM_GAP;
    return { x: -span * 0.5 + ITEM_HIT * 0.5 + i * (ITEM_HIT + ITEM_GAP), y: 8 };
  }

  private _toolBar(): Node {
    const tray = this._traySize();
    const root = this._mk('Tools', tray.w, tray.h);
    this._mk('Tray', tray.w, tray.h, root);
    TOOLS.forEach((id, i) => this._toolBtn(root, id, i));
    return root;
  }

  private _toolBtn(root: Node, id: ToolId, i: number): Node {
    const n = this._mk(`Item_${id}`, ITEM_HIT, ITEM_HIT, root);
    const pos = this._itemPos(i);
    n.setPosition(pos.x, pos.y, 0);
    this._mk('Icon', ITEM_ICON, ITEM_ICON, n);
    const badge = this._mk('Badge', ITEM_BADGE, ITEM_BADGE, n);
    badge.setPosition(ITEM_ICON * 0.36, ITEM_ICON * 0.40, 0);
    this._mk('Face', ITEM_BADGE, ITEM_BADGE, badge);
    this._lab(this._mk('Lab', ITEM_BADGE, ITEM_BADGE, badge), '+', 30, BADGE_INK, ITEM_BADGE, ITEM_BADGE);
    const cap = this._mk('Cap', 120, 36, n);
    cap.setPosition(0, -ITEM_ICON * 0.52, 0);
    this._lab(cap, TOOL_CAPTION[id], 26, INK, 120, 36);
    const capLab = cap.getComponent(Label);
    if (capLab) {
      capLab.outlineColor = Color.WHITE;
      capLab.outlineWidth = 3;
    }
    this._bindTap(n, () => this._onToolTap(id));
    return n;
  }

  private _onToolTap(id: ToolId): void {
    if (id === 'add') this._onDepth?.(this._depth + 1);
    else if (id === 'prev') this._onLayer?.(this._layer - 1);
    else if (id === 'next') this._onLayer?.(this._layer + 1);
    else if (id === 'undo') this._onUndo?.();
    else if (id === 'del') this._onDel?.();
    else if (id === 'preview') this._onPreview?.();
    else if (id === 'edit') this._onEdit?.();
  }

  private _paint(): void {
    const leftoverBack = this.node.getChildByName('BackBtn');
    if (leftoverBack) leftoverBack.active = false;
    const leftoverPlay = this.node.getChildByName('PlayBtn');
    if (leftoverPlay) leftoverPlay.active = false;

    this._layerBoard();
    this._paintSide();

    const root = this.node.getChildByName('Tools');
    if (!root) return;
    for (const name of ['Item_vis', 'Item_erase']) {
      const leftover = root.getChildByName(name);
      if (leftover) leftover.active = false;
    }
    const tray = this._traySize();
    applyArtSpriteSoon(root.getChildByName('Tray'), 'itemTray', tray.w, tray.h, true);
    TOOLS.forEach((id, i) => {
      let n = root.getChildByName(`Item_${id}`);
      if (!n) n = this._toolBtn(root, id, i);
      this._paintTool(n, id, i);
    });
  }

  private _paintSide(): void {
    const rail = this.node.getChildByName('SideRail');
    if (!rail) return;
    const leftoverRun = rail.getChildByName('Side_run');
    if (leftoverRun) leftoverRun.active = false;
    SIDE.forEach((id) => {
      let n = rail.getChildByName(`Side_${id}`);
      if (!n) n = this._sideBtn(rail, id);
      applyArtSpriteSoon(n.getChildByName('Bg'), 'settingsBg', SETTINGS_CIRCLE, SETTINGS_CIRCLE);
      applyArtSpriteSoon(n.getChildByName('Icon'), SIDE_ICON[id], 80, 80);
      const lab = n.getChildByName('Lab')?.getComponent(Label);
      if (lab) lab.string = SIDE_CAPTION[id];
      this._armSide(n, id);
    });
  }

  private _paintTool(node: Node | null, id: ToolId, i: number): void {
    if (!node) return;
    const pos = this._itemPos(i);
    node.setPosition(pos.x, pos.y, 0);
    applyArtSpriteSoon(node.getChildByName('Icon'), TOOL_ICON[id], ITEM_ICON, ITEM_ICON);
    const on = id === 'add' ? this._depth < UGC_MAX_DEPTH
      : id === 'del' ? this._depth > UGC_MIN_DEPTH
      : id === 'prev' ? this._layer > 0
      : id === 'next' ? this._layer < this._depth - 1
      : id === 'undo' ? this._canUndo
      : true;
    const hot = (id === 'preview' && this._showAll)
      || (id === 'edit' && !this._showAll);
    const icon = node.getChildByName('Icon')?.getComponent(Sprite);
    if (icon) {
      icon.color = Color.WHITE;
      icon.grayscale = !on;
    }
    node.setScale(hot ? 1.08 : 1, hot ? 1.08 : 1, 1);

    const badge = node.getChildByName('Badge');
    if (!badge) return;
    const show = id === 'undo' && this._undoCount > 0;
    badge.active = show;
    if (!show) return;
    applyArtSpriteSoon(badge.getChildByName('Face') ?? badge, 'itemBadge', ITEM_BADGE, ITEM_BADGE);
    const lab = badge.getChildByName('Lab')?.getComponent(Label);
    if (lab) {
      lab.string = String(Math.min(99, this._undoCount));
      lab.fontSize = 22;
      lab.color = BADGE_INK;
      lab.outlineColor = BADGE_OUTLINE;
      lab.outlineWidth = 3;
    }
  }

  private _bindTap(node: Node, onTap: () => void): void {
    node.off(Node.EventType.TOUCH_START);
    node.off(Node.EventType.TOUCH_END);
    node.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
      e.propagationStopped = true;
    }, this);
    node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      gameAudio()?.playUiClick();
      onTap();
    }, this);
  }

  private _mk(name: string, w: number, h: number, parent: Node = this.node): Node {
    let n = parent.getChildByName(name);
    if (!n) {
      n = new Node(name);
      parent.addChild(n);
      n.layer = Layers.Enum.UI_2D;
      n.addComponent(UITransform);
    }
    n.getComponent(UITransform)?.setContentSize(w, h);
    return n;
  }

  private _lab(node: Node, text: string, size: number, color: Color, w: number, h: number): Label {
    let lab = node.getComponent(Label);
    if (!lab) lab = node.addComponent(Label);
    lab.string = text;
    styleQCaption(lab, size, color);
    node.getComponent(UITransform)?.setContentSize(w, h);
    return lab;
  }
}
