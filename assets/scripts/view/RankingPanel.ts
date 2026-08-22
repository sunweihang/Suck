import {
  _decorator,
  BlockInputEvents,
  Color,
  Component,
  EventTouch,
  instantiate,
  Label,
  Node,
  Prefab,
  ScrollView,
  UITransform,
  Widget,
} from 'cc';
import { gameAudio } from '../audio/AudioService';
import { uiVisibleSize } from '../game/ViewFit';
import { applyArtSpriteSoon } from './UiArt';
import { RankingItem, plateForRank, type RankEntry } from './RankingItem';

const { ccclass } = _decorator;

const PANEL_W = 860;
const PANEL_H = 1700;
const PANEL_Y = 20;
const TITLE_Y = 680;
const CLOSE = 72;
const CLOSE_X = 340;
const CLOSE_Y = 775;
const ROW_W = 760;
const SELF_H = 119;
const SELF_Y = 558;
const SCROLL_H = 1284;
const SCROLL_Y = -160;
const TITLE_INK = new Color(74, 68, 128, 255);

const DEMO_SELF: RankEntry = {
  rank: 195,
  level: 4,
  name: 'Brown(Me)',
  isSelf: true,
};

const DEMO_LIST: RankEntry[] = [
  { rank: 1, level: 29, name: 'Erica' },
  { rank: 2, level: 26, name: 'Jack' },
  { rank: 3, level: 23, name: 'Owen' },
  { rank: 4, level: 18, name: 'Emma' },
  { rank: 5, level: 16, name: 'Lily' },
  { rank: 6, level: 15, name: 'Noah' },
  { rank: 7, level: 14, name: 'Mia' },
  { rank: 8, level: 12, name: 'Leo' },
  { rank: 9, level: 11, name: 'Ava' },
  { rank: 10, level: 10, name: 'Ethan' },
];

@ccclass('RankingPanel')
export class RankingPanel extends Component {
  private _onClose: (() => void) | null = null;
  private _itemPrefab: Prefab | null = null;
  private _self: RankEntry = { ...DEMO_SELF };
  private _list: RankEntry[] = DEMO_LIST.map((e) => ({ ...e }));

  setup(opts: { onClose?: () => void; itemPrefab?: Prefab | null }): void {
    this._onClose = opts.onClose ?? null;
    this._itemPrefab = opts.itemPrefab ?? null;
    this._bindClose();
  }

  show(): void {
    this.node.active = true;
    this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);
    const block = this.node.getComponent(BlockInputEvents);
    if (block) block.enabled = true;
    this.layoutChrome();
    this.refresh();
  }

  hide(): void {
    const block = this.node.getComponent(BlockInputEvents);
    if (block) block.enabled = false;
    this.node.active = false;
  }

  setSelf(entry: RankEntry): void {
    this._self = { ...entry, isSelf: true };
    this._paintSelf();
  }

  setList(entries: RankEntry[]): void {
    this._list = entries.map((e) => ({ ...e, isSelf: false }));
    this._paintList();
  }

  refresh(): void {
    this._paintSelf();
    this._paintList();
    this._applyChrome();
  }

  layoutChrome(): void {
    const vis = uiVisibleSize();
    this.node.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    this.node.getComponent(Widget)?.updateAlignment();
    this.node.getChildByName('Dim')?.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    const card = this._card();
    card?.setPosition(0, PANEL_Y, 0);
    card?.getComponent(UITransform)?.setContentSize(PANEL_W, PANEL_H);
    card?.getChildByName('Frame')?.getComponent(UITransform)?.setContentSize(PANEL_W, PANEL_H);
    card?.getChildByName('Title')?.setPosition(0, TITLE_Y, 0);
    card?.getChildByName('CloseBtn')?.setPosition(CLOSE_X, CLOSE_Y, 0);
    card?.getChildByName('Self')?.setPosition(0, SELF_Y, 0);
    const scroll = card?.getChildByName('Scroll');
    if (scroll) {
      scroll.getComponent(UITransform)?.setContentSize(ROW_W, SCROLL_H);
      scroll.setPosition(0, SCROLL_Y, 0);
      const view = scroll.getChildByName('View');
      view?.getComponent(UITransform)?.setContentSize(ROW_W, SCROLL_H);
      view?.setPosition(0, 0, 0);
      view?.getChildByName('Content')?.setPosition(0, SCROLL_H * 0.5, 0);
    }
    this._applyChrome();
  }

  private _applyChrome(): void {
    const vis = uiVisibleSize();
    applyArtSpriteSoon(this.node.getChildByName('Dim'), 'settingsDim', vis.w, vis.h);
    applyArtSpriteSoon(this._card()?.getChildByName('Frame') ?? null, 'panelMain', PANEL_W, PANEL_H, true);
    applyArtSpriteSoon(this._card()?.getChildByName('CloseBtn') ?? null, 'settingsClose', CLOSE, CLOSE);
    const title = this._card()?.getChildByName('Title')?.getComponent(Label);
    if (title) {
      title.string = '排行';
      title.fontSize = 64;
      title.lineHeight = 70;
      title.isBold = true;
      title.color = TITLE_INK;
      title.enableOutline = false;
      title.outlineWidth = 0;
      title.useSystemFont = true;
      title.fontFamily = 'PingFang SC';
    }
  }

  private _paintSelf(): void {
    const n = this._card()?.getChildByName('Self');
    if (!n) return;
    const item = n.getComponent(RankingItem) ?? n.addComponent(RankingItem);
    item.bind({ ...this._self, isSelf: true, plate: this._self.plate ?? plateForRank(this._self.rank, true) });
  }

  private _paintList(): void {
    const content = this._content();
    if (!content) return;
    for (const child of [...content.children]) {
      child.removeFromParent();
      child.destroy();
    }
    for (let i = 0; i < this._list.length; i++) {
      const row = this._spawnRow(content, `Item${i + 1}`);
      if (!row) continue;
      const item = row.getComponent(RankingItem) ?? row.addComponent(RankingItem);
      const entry = this._list[i];
      item.bind({ ...entry, isSelf: false, plate: entry.plate ?? plateForRank(entry.rank) });
    }
    const sv = this._card()?.getChildByName('Scroll')?.getComponent(ScrollView);
    if (sv) sv.scrollToTop(0.01);
  }

  private _spawnRow(parent: Node, name: string): Node | null {
    const tmpl = this._card()?.getChildByName('ItemTemplate');
    let n: Node | null = null;
    if (this._itemPrefab) {
      n = instantiate(this._itemPrefab);
    } else if (tmpl) {
      n = instantiate(tmpl);
    }
    if (!n) return null;
    n.name = name;
    n.active = true;
    parent.addChild(n);
    return n;
  }

  private _card(): Node | null {
    return this.node.getChildByName('Card');
  }

  private _content(): Node | null {
    return this._card()?.getChildByName('Scroll')?.getChildByName('View')?.getChildByName('Content') ?? null;
  }

  private _bindClose(): void {
    const close = () => {
      if (this._onClose) this._onClose();
      else this.hide();
    };
    const dim = this.node.getChildByName('Dim');
    dim?.off(Node.EventType.TOUCH_END);
    dim?.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      gameAudio()?.playUiClick();
      close();
    }, this);
    const btn = this._card()?.getChildByName('CloseBtn');
    btn?.off(Node.EventType.TOUCH_END);
    btn?.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      gameAudio()?.playUiClick();
      close();
    }, this);
  }
}
