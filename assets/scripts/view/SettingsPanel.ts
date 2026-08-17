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
import { applyArtSpriteSoon, ensureBtnChrome, VOLCANO_BTN_H, VOLCANO_BTN_W } from './UiArt';

const { ccclass } = _decorator;

const CARD_W = 860;
const CARD_H = 1000;
const BTN_W = VOLCANO_BTN_W;
const BTN_H = VOLCANO_BTN_H;
const CLOSE = 72;
const ICON = 56;
const TRACK_W = 620;
const TRACK_H = 40;
const FILL_H = 28;
const THUMB = 48;
const FILL_INSET = 6;
const ROW_W = CARD_W - 100;
const ROW_H = ICON + 18 + TRACK_H + 24;
const TITLE_Y = 330;
const BGM_Y = 126;
const SFX_Y = -64;
const BTN_FONT = 48;
const ACTION_Y = -323;
const SHARE_X = -197;
const CLUB_X = 197;
const CLOSE_X = 340;
const CLOSE_Y = 425;
const TITLE_INK = new Color(74, 68, 128, 255);
const BTN_INK = new Color(255, 255, 255, 255);
const SHARE_OUTLINE = new Color(88, 48, 16, 255);
const CLUB_OUTLINE = new Color(20, 64, 32, 255);

@ccclass('SettingsPanel')
export class SettingsPanel extends Component {
  private _built = false;
  private _fromPrefab = false;
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
    this._paintNode(close, 'settingsClose');
    const lab = close?.getChildByName('Label');
    if (lab) lab.active = false;
    if (!this._fromPrefab) {
      ensureBtnChrome(card?.getChildByName('ShareButton'), BTN_W, BTN_H, Color.WHITE, SHARE_OUTLINE, 'winDouble');
      ensureBtnChrome(card?.getChildByName('ClubButton'), BTN_W, BTN_H, Color.WHITE, CLUB_OUTLINE, 'winAction');
      this._styleActionLabel(card?.getChildByName('ShareButton')?.getChildByName('Label') ?? null, '分享', SHARE_OUTLINE);
      this._styleActionLabel(card?.getChildByName('ClubButton')?.getChildByName('Label') ?? null, '游戏圈', CLUB_OUTLINE);
      this._placeActions();
    }
    this._paintVolumeRow(card?.getChildByName('BgmRow') ?? null, 'icMusic');
    this._paintVolumeRow(card?.getChildByName('SfxRow') ?? null, 'icSfx');
  }

  layoutChrome(): void {
    this._ensureTree();
    const vis = uiVisibleSize();
    this.node.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    this.node.getComponent(Widget)?.updateAlignment();
    this.node.getChildByName('Dim')?.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    if (this._fromPrefab) {
      this._applyChrome();
      return;
    }
    this.node.getChildByName('Card')?.setPosition(0, 20, 0);
    this.node.getChildByName('Card')?.getComponent(UITransform)?.setContentSize(CARD_W, CARD_H);
    this.node.getChildByName('Card')?.getChildByName('CloseBtn')?.setPosition(CLOSE_X, CLOSE_Y, 0);
    this._placeActions();
    this._applyChrome();
  }

  private _placeActions(): void {
    const card = this.node.getChildByName('Card');
    const share = card?.getChildByName('ShareButton');
    const club = card?.getChildByName('ClubButton');
    share?.getComponent(UITransform)?.setContentSize(BTN_W, BTN_H);
    club?.getComponent(UITransform)?.setContentSize(BTN_W, BTN_H);
    share?.setPosition(SHARE_X, ACTION_Y, 0);
    club?.setPosition(CLUB_X, ACTION_Y, 0);
  }

  private _styleActionLabel(node: Node | null, text: string, outline: Color): void {
    if (!node) return;
    node.getComponent(UITransform)?.setContentSize(BTN_W - 48, BTN_H - 16);
    node.setPosition(0, 2, 0);
    const lab = node.getComponent(Label);
    if (!lab) return;
    lab.string = text;
    lab.fontSize = BTN_FONT;
    lab.lineHeight = BTN_FONT + 6;
    lab.isBold = true;
    lab.color = BTN_INK;
    lab.enableOutline = true;
    lab.outlineWidth = 4;
    lab.outlineColor = outline;
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    lab.overflow = Label.Overflow.SHRINK;
    lab.useSystemFont = true;
    lab.fontFamily = 'PingFang SC';
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
    this._paintNode(frame, 'panelMain');
  }

  private _paintNode(node: Node | null | undefined, key: 'settingsClose' | 'winDouble' | 'winAction' | 'panelMain'): void {
    if (!node) return;
    const ut = node.getComponent(UITransform);
    const w = ut?.width || CARD_W;
    const h = ut?.height || CARD_H;
    applyArtSpriteSoon(node, key, w, h);
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

    const existing = this.node.getChildByName('Card');
    if (existing) {
      this._fromPrefab = true;
      this._adoptTree();
      return;
    }

    const dim = this._mk('Dim', this.node, vis.w, vis.h);
    if (!dim.getComponent(BlockInputEvents)) dim.addComponent(BlockInputEvents);
    applyArtSpriteSoon(dim, 'settingsDim', vis.w, vis.h);

    const card = this._mk('Card', this.node, CARD_W, CARD_H);
    if (!card.getComponent(BlockInputEvents)) card.addComponent(BlockInputEvents);
    const frame = this._mk('Frame', card, CARD_W, CARD_H);
    frame.setSiblingIndex(0);
    applyArtSpriteSoon(frame, 'panelMain', CARD_W, CARD_H);
    const title = this._label(card, 'Title', '设置', 64, TITLE_INK, 0, TITLE_Y, CARD_W - 160, 88, true);
    title.outlineColor = TITLE_INK;
    title.outlineWidth = 0;

    this._volumeRow(card, 'BgmRow', '背景音乐', BGM_Y);
    this._volumeRow(card, 'SfxRow', '音效', SFX_Y);
    this._action(card, 'ShareButton', '分享', SHARE_X, ACTION_Y, () => undefined);
    this._action(card, 'ClubButton', '游戏圈', CLUB_X, ACTION_Y, () => undefined);

    const close = this._mk('CloseBtn', card, CLOSE, CLOSE);
    close.setPosition(CLOSE_X, CLOSE_Y, 0);
    this._label(close, 'Label', '×', 48, TITLE_INK, 0, 0, CLOSE, CLOSE, false);
    this._adoptTree();
  }

  private _adoptTree(): void {
    const dim = this.node.getChildByName('Dim');
    if (dim && !dim.getComponent(BlockInputEvents)) dim.addComponent(BlockInputEvents);
    const card = this.node.getChildByName('Card');
    if (card && !card.getComponent(BlockInputEvents)) card.addComponent(BlockInputEvents);

    const bgm = this._adoptVolumeRow(card?.getChildByName('BgmRow') ?? null);
    this._bgmSlider = bgm.slider;
    this._bgmFill = bgm.fill;
    if (bgm.slider && bgm.fill) this._wireSlider(bgm.slider, bgm.fill, (v) => gameAudio()?.setBgmVolume(v));

    const sfx = this._adoptVolumeRow(card?.getChildByName('SfxRow') ?? null);
    this._sfxSlider = sfx.slider;
    this._sfxFill = sfx.fill;
    if (sfx.slider && sfx.fill) {
      this._wireSlider(sfx.slider, sfx.fill, (v) => {
        gameAudio()?.setSfxVolume(v);
        const now = Date.now();
        if (now - this._sfxPreviewAt > 120) {
          this._sfxPreviewAt = now;
          gameAudio()?.playUiClick();
        }
      });
    }

    dim?.off(Node.EventType.TOUCH_END);
    dim?.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      this._onClose?.();
    }, this);
    this._bindTap(card?.getChildByName('CloseBtn'), () => this._onClose?.());
    this._bindTap(card?.getChildByName('ShareButton'), () => shareToFriend());
    this._bindTap(card?.getChildByName('ClubButton'), () => openGameCircle());
  }

  private _adoptVolumeRow(row: Node | null): { slider: Slider | null; fill: Node | null } {
    if (!row) return { slider: null, fill: null };
    const area = row.getChildByName('SliderArea');
    const fill = area?.getChildByName('Fill') ?? null;
    const handle = area?.getChildByName('Handle');
    if (!area) return { slider: null, fill };
    let slider = area.getComponent(Slider);
    if (!slider) slider = area.addComponent(Slider);
    let handleSp = handle?.getComponent(Sprite) ?? null;
    if (handle && !handleSp) handleSp = handle.addComponent(Sprite);
    if (handleSp) {
      handleSp.sizeMode = Sprite.SizeMode.CUSTOM;
      slider.handle = handleSp;
    }
    slider.direction = Slider.Direction.Horizontal;
    return { slider, fill };
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
    const icon = row.getChildByName('Icon');
    const iconUt = icon?.getComponent(UITransform);
    applyArtSpriteSoon(icon, iconKey, iconUt?.width || ICON, iconUt?.height || ICON);
    const area = row.getChildByName('SliderArea');
    const track = area?.getChildByName('Track') ?? null;
    const trackUt = track?.getComponent(UITransform);
    applyArtSpriteSoon(track, 'volumeTrack', trackUt?.width || TRACK_W, trackUt?.height || TRACK_H);
    const fill = area?.getChildByName('Fill') ?? null;
    const fillUt = fill?.getComponent(UITransform);
    applyArtSpriteSoon(fill, 'volumeFill', fillUt?.width || FILL_H, fillUt?.height || FILL_H, true);
    const handle = area?.getChildByName('Handle') ?? null;
    const handleUt = handle?.getComponent(UITransform);
    applyArtSpriteSoon(handle, 'sliderThumb', handleUt?.width || THUMB, handleUt?.height || THUMB);
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
    const trackW = fill.parent?.getChildByName('Track')?.getComponent(UITransform)?.width || TRACK_W;
    const fillH = FILL_H;
    const travel = Math.max(0, trackW - FILL_INSET * 2);
    const w = progress <= 0.001 ? 0 : Math.max(fillH, travel * progress);
    ut.setAnchorPoint(0, 0.5);
    ut.setContentSize(w, fillH);
    fill.setPosition(-trackW / 2 + FILL_INSET, 0, 0);
    fill.active = w > 0;
  }

  private _action(parent: Node, name: string, text: string, x: number, y: number, onTap: () => void): Node {
    const n = this._mk(name, parent, BTN_W, BTN_H);
    n.setPosition(x, y, 0);
    const lab = this._label(n, 'Label', text, BTN_FONT, BTN_INK, 0, 2, BTN_W - 48, BTN_H - 16, false);
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
