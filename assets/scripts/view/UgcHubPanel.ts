import {
  _decorator,
  BlockInputEvents,
  Color,
  Component,
  EventTouch,
  Label,
  Layers,
  Mask,
  Node,
  ScrollView,
  UITransform,
  Widget,
} from 'cc';
import { coverBackgroundSize, portraitVisibleSize } from '../game/PortraitFit';
import { Theme } from '../game/Theme';
import { uiSafeInsets, uiVisibleSize } from '../game/ViewFit';
import {
  deleteUgcMap,
  listUgcMaps,
  type UgcMap,
} from '../ugc/UgcStore';
import { gameAudio } from '../audio/AudioService';
import { GOLD_HUD } from './GoldHud';
import { styleQCaption, styleQNum } from './QChrome';
import { applyArtSpriteSoon, ensureBtnChrome, VOLCANO_BTN_H, VOLCANO_BTN_W } from './UiArt';

const { ccclass } = _decorator;

const TITLE_INK = new Color(74, 68, 128, 255);
const CARD_W = 920;
const CARD_H = 196;
const CARD_GAP = 18;
const NEW_W = VOLCANO_BTN_W;
const NEW_H = VOLCANO_BTN_H;
const CLOSE = 120;
const GEAR = 56;
const ACTION_W = 200;
const ACTION_H = 72;

@ccclass('UgcHubPanel')
export class UgcHubPanel extends Component {
  private _built = false;
  private _confirmId: string | null = null;
  private _onBack: (() => void) | null = null;
  private _onNew: (() => void) | null = null;
  private _onEdit: ((id: string) => void) | null = null;
  private _onPlay: ((id: string) => void) | null = null;

  setup(opts: {
    onBack: () => void;
    onNew: () => void;
    onEdit: (id: string) => void;
    onPlay: (id: string) => void;
  }): void {
    this._onBack = opts.onBack;
    this._onNew = opts.onNew;
    this._onEdit = opts.onEdit;
    this._onPlay = opts.onPlay;
    this.hide();
  }

  show(): void {
    this.node.active = true;
    this._confirmId = null;
    this._raise();
    this._refresh();
    this.layoutChrome();
    this.applyArt();
    const block = this.node.getComponent(BlockInputEvents);
    if (block) block.enabled = true;
  }

  hide(): void {
    this._confirmId = null;
    const empty = this.node.getChildByName('Empty');
    if (empty) empty.active = false;
    const block = this.node.getComponent(BlockInputEvents);
    if (block) block.enabled = false;
    this.node.active = false;
  }

  private _raise(): void {
    const parent = this.node.parent;
    if (parent) this.node.setSiblingIndex(parent.children.length - 1);
  }

  applyArt(): void {
    if (!this.node.active) return;
    this._ensureTree();
    const vis = portraitVisibleSize();
    const cover = coverBackgroundSize(vis.width, vis.height);
    applyArtSpriteSoon(this.node.getChildByName('Bg'), 'home', cover.w, cover.h);
    const ui = uiVisibleSize();
    applyArtSpriteSoon(this.node.getChildByName('Dim'), 'settingsDim', ui.w, ui.h);
    const back = this.node.getChildByName('BackBtn');
    applyArtSpriteSoon(back?.getChildByName('Bg') ?? null, 'settingsBg', CLOSE, CLOSE);
    applyArtSpriteSoon(back?.getChildByName('Gear') ?? null, 'settingsClose', GEAR, GEAR);
    ensureBtnChrome(this.node.getChildByName('NewBtn'), NEW_W, NEW_H, Theme.playFill, Theme.playStroke, 'winDouble');
  }

  layoutChrome(): void {
    if (!this.node.active) return;
    this._ensureTree();
    const vis = uiVisibleSize();
    const safe = uiSafeInsets();
    const pad = GOLD_HUD.pad;
    const chromeY = vis.h * 0.5 - GOLD_HUD.rootH * 0.5 - safe.top - pad;
    this._layoutCoverBg();
    this._paintDim();
    this.node.getChildByName('Title')?.setPosition(0, chromeY, 0);
    this.node.getChildByName('BackBtn')?.setPosition(
      -vis.w * 0.5 + CLOSE * 0.5 + safe.left + pad,
      chromeY - 8,
      0,
    );
    this.node.getChildByName('NewBtn')?.setPosition(0, -vis.h * 0.5 + safe.bottom + NEW_H * 0.5 + 36, 0);
    this.node.getChildByName('Empty')?.setPosition(0, 80, 0);
    const scroll = this.node.getChildByName('Scroll');
    if (scroll) {
      const top = chromeY - 70;
      const bot = -vis.h * 0.5 + safe.bottom + NEW_H + 72;
      const h = Math.max(200, top - bot);
      scroll.getComponent(UITransform)?.setContentSize(CARD_W, h);
      scroll.setPosition(0, (top + bot) * 0.5, 0);
      const view = scroll.getChildByName('View');
      view?.getComponent(UITransform)?.setContentSize(CARD_W, h);
      view?.setPosition(0, 0, 0);
    }
    this._layoutCards();
  }

  private _layoutCoverBg(): void {
    const bg = this.node.getChildByName('Bg');
    if (!bg) return;
    const vis = portraitVisibleSize();
    const cover = coverBackgroundSize(vis.width, vis.height);
    bg.getComponent(UITransform)?.setContentSize(cover.w, cover.h);
    bg.setPosition(0, 0, 0);
  }

  private _paintDim(): void {
    const vis = uiVisibleSize();
    const dim = this.node.getChildByName('Dim');
    if (!dim) return;
    dim.setSiblingIndex(0);
    dim.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    dim.setPosition(0, 0, 0);
    applyArtSpriteSoon(dim, 'settingsDim', vis.w, vis.h);
    const bg = this.node.getChildByName('Bg');
    if (bg) bg.setSiblingIndex(1);
  }

  private _refresh(): void {
    this._ensureTree();
    const maps = listUgcMaps();
    const content = this._content();
    if (!content) return;
    for (const child of [...content.children]) {
      if (child.name.startsWith('Card_')) {
        child.removeFromParent();
        child.destroy();
      }
    }
    maps.forEach((map) => this._spawnCard(content, map));
    const empty = this.node.getChildByName('Empty');
    if (empty) empty.active = maps.length === 0;
    this._layoutCards();
  }

  private _layoutCards(): void {
    const content = this._content();
    const scroll = this.node.getChildByName('Scroll');
    if (!content || !scroll) return;
    const cards = content.children.filter((n) => n.name.startsWith('Card_'));
    const h = cards.length * (CARD_H + CARD_GAP);
    const viewH = scroll.getComponent(UITransform)?.height ?? 800;
    content.getComponent(UITransform)?.setContentSize(CARD_W, Math.max(viewH, h));
    let y = Math.max(viewH, h) * 0.5 - CARD_H * 0.5;
    for (const card of cards) {
      card.setPosition(0, y, 0);
      y -= CARD_H + CARD_GAP;
    }
    const sv = scroll.getComponent(ScrollView);
    if (sv) sv.scrollToTop(0.01);
  }

  private _spawnCard(parent: Node, map: UgcMap): Node {
    const n = this._mk(`Card_${map.id}`, CARD_W, CARD_H, parent);
    const face = this._mk('Face', CARD_W, CARD_H, n);
    applyArtSpriteSoon(face, 'settingsCard', CARD_W, CARD_H, true);
    const title = this._mk('Name', 800, 56, n);
    title.setPosition(0, 52, 0);
    this._lab(title, map.name, 40, Theme.playText, 800, 56, true);
    const meta = this._mk('Meta', 800, 40, n);
    meta.setPosition(0, 10, 0);
    this._lab(meta, `${map.bricks.length} 块砖 · ${map.cols}×${map.rows}×${map.depth}`, 28, Theme.subtitle, 800, 40, false);

    const play = this._action(n, 'Play', '试玩', -248, 'clubBtn');
    const edit = this._action(n, 'Edit', '编辑', 0, 'shareBtn');
    const del = this._action(n, 'Del', this._confirmId === map.id ? '确认删' : '删除', 248, 'shareBtn');
    this._bindTap(play, () => {
      if (map.bricks.length <= 0) return;
      this._onPlay?.(map.id);
    });
    this._bindTap(edit, () => this._onEdit?.(map.id));
    this._bindTap(del, () => this._askDelete(map.id));
    return n;
  }

  private _action(
    parent: Node,
    name: string,
    text: string,
    x: number,
    art: 'clubBtn' | 'shareBtn',
  ): Node {
    const n = this._mk(name, ACTION_W, ACTION_H, parent);
    n.setPosition(x, -52, 0);
    this._lab(this._mk('Label', ACTION_W - 12, ACTION_H - 12, n), text, 30, Theme.playText, ACTION_W - 12, ACTION_H - 12, false);
    ensureBtnChrome(n, ACTION_W, ACTION_H, Theme.playFill, Theme.playStroke, art);
    return n;
  }

  private _askDelete(id: string): void {
    if (this._confirmId !== id) {
      this._confirmId = id;
      this._refresh();
      return;
    }
    deleteUgcMap(id);
    this._confirmId = null;
    this._refresh();
  }

  private _content(): Node | null {
    return this.node.getChildByName('Scroll')?.getChildByName('View')?.getChildByName('Content') ?? null;
  }

  private _ensureTree(): void {
    if (this._built) return;
    this._built = true;
    const keepOff = !this.node.active;
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
    this.node.addComponent(BlockInputEvents);

    const dim = this._mk('Dim', vis.w, vis.h);
    dim.addComponent(BlockInputEvents);
    this._mk('Bg', vis.w, vis.h);
    const title = this._mk('Title', 480, 80);
    this._lab(title, '创作地图', 52, TITLE_INK, 480, 80, true);

    const back = this._mk('BackBtn', CLOSE + 20, CLOSE + 48);
    this._mk('Bg', CLOSE, CLOSE, back).setPosition(0, 16, 0);
    this._mk('Gear', GEAR, GEAR, back).setPosition(0, 16, 0);
    const backLab = this._mk('Lab', 120, 36, back);
    backLab.setPosition(0, -56, 0);
    this._lab(backLab, '返回', 26, TITLE_INK, 120, 36, false);
    this._bindTap(back, () => this._onBack?.());

    const empty = this._mk('Empty', 800, 80);
    empty.active = false;
    this._lab(empty, '还没有地图，新建一份', 36, Theme.subtitle, 800, 80, false);

    const neu = this._mk('NewBtn', NEW_W, NEW_H);
    this._lab(this._mk('Label', NEW_W - 24, NEW_H - 20, neu), '新建地图', 40, Theme.playText, NEW_W - 24, NEW_H - 20, false);
    this._bindTap(neu, () => this._onNew?.());

    const scroll = this._mk('Scroll', CARD_W, 900);
    const view = this._mk('View', CARD_W, 900, scroll);
    view.addComponent(Mask);
    const content = this._mk('Content', CARD_W, 900, view);
    const sv = scroll.addComponent(ScrollView);
    sv.horizontal = false;
    sv.vertical = true;
    sv.inertia = true;
    sv.brake = 0.75;
    sv.elastic = true;
    sv.content = content;
    if (keepOff) this.node.active = false;
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
    node.getComponent(UITransform)?.setContentSize(w, h);
    return lab;
  }
}
