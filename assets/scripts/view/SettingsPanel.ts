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
  Slider,
  Sprite,
  UITransform,
  Widget,
} from 'cc';
import { openGameCircle } from '../ads/GameCircleService';
import { shareToFriend } from '../ads/WxShareService';
import { uiVisibleSize } from '../game/ViewFit';
import { gameAudio } from '../audio/AudioService';
import { styleQCaption, styleQNum } from './QChrome';
import { applyArtSpriteSoon } from './UiArt';

const { ccclass } = _decorator;

const CARD_W = 860;
const CARD_H = 1030;
const BTN_W = 660;
const BTN_H = 140;
const CLOSE = 72;
const ICON = 56;
const TRACK_W = 620;
const TRACK_H = 40;
const FILL_H = 28;
const THUMB = 48;
const FILL_INSET = 6;
const ROW_W = CARD_W - 100;
const ROW_H = ICON + 18 + TRACK_H + 24;
const TITLE_Y = 371;
const BGM_Y = 218;
const SFX_Y = 52;
const SHARE_Y = -175;
const CLUB_Y = -343;
const TITLE_INK = new Color(74, 68, 128, 255);
const BTN_INK = new Color(255, 255, 255, 255);
const BTN_OUTLINE = new Color(74, 68, 128, 255);

@ccclass('SettingsPanel')
export class SettingsPanel extends Component {
  private _built = false;
  private _onClose: (() => void) | null = null;
  private _bgmSlider: Slider | null = null;
  private _sfxSlider: Slider | null = null;
  private _bgmFill: Node | null = null;
  private _sfxFill: Node | null = null;
  private _sfxPreviewAt = 0;

  setup(opts: { onClose: () => void }): void {
    this._onClose = opts.onClose;
    this._ensureTree();
    this.layoutChrome();
  }

  show(): void {
    this.node.active = true;
    this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);
    this.layoutChrome();
    this.applyArt();
    this._syncFromAudio();
  }

  hide(): void {
    this.node.active = false;
  }

  applyArt(): void {
    this._ensureTree();
    this._applyChrome();
    const card = this.node.getChildByName('Card');
    const close = card?.getChildByName('CloseBtn');
    applyArtSpriteSoon(close, 'settingsClose', CLOSE, CLOSE);
    const lab = close?.getChildByName('Label');
    if (lab) lab.active = false;
    applyArtSpriteSoon(card?.getChildByName('ShareButton') ?? null, 'shareBtn', BTN_W, BTN_H);
    applyArtSpriteSoon(card?.getChildByName('ClubButton') ?? null, 'clubBtn', BTN_W, BTN_H);
    this._paintVolumeRow(card?.getChildByName('BgmRow') ?? null, 'icMusic');
    this._paintVolumeRow(card?.getChildByName('SfxRow') ?? null, 'icSfx');
  }

  layoutChrome(): void {
    this._ensureTree();
    const vis = uiVisibleSize();
    this.node.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    this.node.getComponent(Widget)?.updateAlignment();
    this.node.getChildByName('Dim')?.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    this.node.getChildByName('Card')?.setPosition(0, 20, 0);
    this.node.getChildByName('Card')?.getChildByName('CloseBtn')?.setPosition(
      CARD_W * 0.5 - 48 - CLOSE * 0.5,
      CARD_H * 0.5 - 48 - CLOSE * 0.5,
      0,
    );
    this._applyChrome();
  }

  private _applyChrome(): void {
    const vis = uiVisibleSize();
    const dim = this.node.getChildByName('Dim');
    applyArtSpriteSoon(dim, 'settingsDim', vis.w, vis.h);
    const card = this.node.getChildByName('Card');
    const cardG = card?.getComponent(Graphics);
    if (cardG) cardG.enabled = false;
    let frame = card?.getChildByName('Frame') ?? null;
    if (!frame && card) {
      frame = this._mk('Frame', card, CARD_W, CARD_H);
      frame.setSiblingIndex(0);
    }
    const frameG = frame?.getComponent(Graphics);
    if (frameG) {
      frameG.clear();
      frameG.enabled = false;
    }
    applyArtSpriteSoon(frame, 'settingsCard', CARD_W, CARD_H, true);
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

    const dim = this._mk('Dim', this.node, vis.w, vis.h);
    if (!dim.getComponent(BlockInputEvents)) dim.addComponent(BlockInputEvents);
    applyArtSpriteSoon(dim, 'settingsDim', vis.w, vis.h);
    dim.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      this._onClose?.();
    }, this);

    const card = this._mk('Card', this.node, CARD_W, CARD_H);
    if (!card.getComponent(BlockInputEvents)) card.addComponent(BlockInputEvents);
    const frame = this._mk('Frame', card, CARD_W, CARD_H);
    frame.setSiblingIndex(0);
    applyArtSpriteSoon(frame, 'settingsCard', CARD_W, CARD_H, true);
    const title = this._label(card, 'Title', '设置', 64, TITLE_INK, 0, TITLE_Y, CARD_W - 160, 88, true);
    title.outlineColor = TITLE_INK;
    title.outlineWidth = 0;

    const bgm = this._volumeRow(card, 'BgmRow', '背景音乐', BGM_Y);
    this._bgmSlider = bgm.slider;
    this._bgmFill = bgm.fill;
    this._wireSlider(bgm.slider, bgm.fill, (v) => gameAudio()?.setBgmVolume(v));

    const sfx = this._volumeRow(card, 'SfxRow', '音效', SFX_Y);
    this._sfxSlider = sfx.slider;
    this._sfxFill = sfx.fill;
    this._wireSlider(sfx.slider, sfx.fill, (v) => {
      gameAudio()?.setSfxVolume(v);
      const now = Date.now();
      if (now - this._sfxPreviewAt > 120) {
        this._sfxPreviewAt = now;
        gameAudio()?.playUiClick();
      }
    });

    this._action(card, 'ShareButton', '分享', SHARE_Y, () => shareToFriend());
    this._action(card, 'ClubButton', '游戏圈', CLUB_Y, () => openGameCircle());

    const close = this._mk('CloseBtn', card, CLOSE, CLOSE);
    this._label(close, 'Label', '×', 48, TITLE_INK, 0, 0, CLOSE, CLOSE, false);
    close.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      gameAudio()?.playUiClick();
      this._onClose?.();
    }, this);
  }

  private _volumeRow(
    parent: Node,
    name: string,
    text: string,
    y: number,
  ): { slider: Slider; fill: Node } {
    const row = this._mk(name, parent, ROW_W, ROW_H);
    row.setPosition(0, y, 0);

    const icon = this._mk('Icon', row, ICON, ICON);
    icon.setPosition(-ROW_W * 0.5 + ICON * 0.5 + 8, ROW_H * 0.5 - ICON * 0.5 - 4, 0);

    const lab = this._label(row, 'Label', text, 40, TITLE_INK, -ROW_W * 0.5 + ICON + 188, ROW_H * 0.5 - ICON * 0.5 - 4, 320, 56, false);
    lab.horizontalAlign = Label.HorizontalAlign.LEFT;
    lab.outlineWidth = 3;
    lab.outlineColor = Color.WHITE;

    const area = this._mk('SliderArea', row, TRACK_W, Math.max(TRACK_H, THUMB) + 16);
    area.setPosition(0, -ROW_H * 0.5 + TRACK_H * 0.5 + 8, 0);

    this._mk('Track', area, TRACK_W, TRACK_H);

    const fill = this._mk('Fill', area, FILL_H, FILL_H);
    const fillUt = fill.getComponent(UITransform);
    fillUt?.setAnchorPoint(0, 0.5);
    fill.setPosition(-TRACK_W * 0.5 + FILL_INSET, 0, 0);

    const handle = this._mk('Handle', area, THUMB, THUMB);
    const handleSp = handle.addComponent(Sprite);
    handleSp.sizeMode = Sprite.SizeMode.CUSTOM;

    const slider = area.addComponent(Slider);
    slider.handle = handleSp;
    slider.direction = Slider.Direction.Horizontal;
    slider.progress = 0.4;
    return { slider, fill };
  }

  private _paintVolumeRow(row: Node | null, iconKey: 'icMusic' | 'icSfx'): void {
    if (!row) return;
    applyArtSpriteSoon(row.getChildByName('Icon'), iconKey, ICON, ICON);
    const area = row.getChildByName('SliderArea');
    applyArtSpriteSoon(area?.getChildByName('Track') ?? null, 'volumeTrack', TRACK_W, TRACK_H);
    applyArtSpriteSoon(area?.getChildByName('Fill') ?? null, 'volumeFill', FILL_H, FILL_H, true);
    applyArtSpriteSoon(area?.getChildByName('Handle') ?? null, 'sliderThumb', THUMB, THUMB);
  }

  private _wireSlider(slider: Slider, fill: Node, apply: (v: number) => void): void {
    const evt = Slider.EventType?.SLIDE ?? 'slide';
    slider.node.off(evt);
    slider.node.on(evt, () => {
      const v = Math.max(0, Math.min(1, slider.progress));
      this._updateFill(fill, v);
      apply(v);
    }, this);
  }

  private _syncFromAudio(): void {
    const audio = gameAudio();
    if (!audio) return;
    this._setProgress(this._bgmSlider, this._bgmFill, audio.getBgmVolume());
    this._setProgress(this._sfxSlider, this._sfxFill, audio.getSfxVolume());
  }

  private _setProgress(slider: Slider | null, fill: Node | null, v: number): void {
    if (!slider) return;
    const t = Math.max(0, Math.min(1, v));
    slider.progress = t;
    this._updateFill(fill, t);
  }

  private _updateFill(fill: Node | null, progress: number): void {
    if (!fill) return;
    const ut = fill.getComponent(UITransform);
    if (!ut) return;
    const travel = Math.max(0, TRACK_W - FILL_INSET * 2);
    const w = progress <= 0.001 ? 0 : Math.max(FILL_H, travel * progress);
    ut.setAnchorPoint(0, 0.5);
    ut.setContentSize(w, FILL_H);
    fill.setPosition(-TRACK_W / 2 + FILL_INSET, 0, 0);
    fill.active = w > 0;
  }

  private _action(parent: Node, name: string, text: string, y: number, onTap: () => void): Node {
    const n = this._mk(name, parent, BTN_W, BTN_H);
    n.setPosition(0, y, 0);
    const lab = this._label(n, 'Label', text, 48, BTN_INK, 0, 3, BTN_W - 48, BTN_H - 16, false);
    lab.outlineColor = BTN_OUTLINE;
    lab.outlineWidth = 4;
    n.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      gameAudio()?.playUiClick();
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
    big = false,
  ): Label {
    const n = this._mk(name, parent, w, h);
    n.setPosition(x, y, 0);
    const lab = n.addComponent(Label);
    lab.string = text;
    if (big) styleQNum(lab, size, color);
    else styleQCaption(lab, size, color);
    lab.color = color;
    return lab;
  }
}
