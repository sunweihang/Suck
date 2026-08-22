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
import { getWxMiniProgramVersionText } from '../ads/WxAccount';
import { isHapticEnabled, setHapticEnabled, vibrateShort } from '../game/Haptic';
import { uiVisibleSize } from '../game/ViewFit';
import { gameAudio } from '../audio/AudioService';
import { styleQCaption, styleQNum } from './QChrome';
import { AD_MARK_H, applyAdIcon, applyArtSpriteSoon, ensureBtnChrome, fillInvisibleHit, VOLCANO_BTN_H, VOLCANO_BTN_W } from './UiArt';

const { ccclass } = _decorator;

const CARD_W = 860;
const CARD_H_BASE = 960;
const EXTRA_ROW = 120;
const BTN_W = VOLCANO_BTN_W;
const BTN_H = VOLCANO_BTN_H;
const CLOSE = 72;
const ICON = 72;
const ICON_PAD = 0;
const LABEL_GAP = 16;
const LABEL_W = 360;
const LABEL_H = 56;
const TRACK_H = 64;
const FILL_H = 40;
const THUMB = 48;
const FILL_INSET = 8;
const ROW_W = CARD_W - 100;
const TRACK_W = ROW_W;
const CONTENT_SHIFT = 12;
const ROW_H = ICON + 18 + TRACK_H + 24;
const OPT_H = 92;
const TOGGLE_W = 108;
const TOGGLE_H = 56;
const TITLE_Y_HOME = 380;
const BGM_Y_HOME = 180;
const SFX_Y_HOME = 0;
const HAPTIC_Y_HOME = -160;
const OPT_STEP = 105;
const ACTION_Y_HOME = -310;
const VERSION_Y_HOME = -430;
const BTN_FONT = 48;
const SKIP_FONT = 40;
const COL_L = -ROW_W * 0.5 + BTN_W * 0.5 + CONTENT_SHIFT;
const COL_R = ROW_W * 0.5 - BTN_W * 0.5 + CONTENT_SHIFT;
const VERSION_INK = new Color(74, 68, 128, 180);
const CLOSE_X = 340;
const CLOSE_Y_HOME = 400;
const TITLE_INK = new Color(74, 68, 128, 255);
const BTN_INK = new Color(255, 255, 255, 255);
const SHARE_OUTLINE = new Color(88, 48, 16, 255);
const SKIP_OUTLINE = new Color(20, 64, 32, 255);
const AD_ICON_H = AD_MARK_H;
const TOGGLE_ON = new Color(76, 196, 96, 255);
const TOGGLE_OFF = new Color(196, 192, 208, 255);
const TOGGLE_KNOB = new Color(255, 255, 255, 255);

@ccclass('SettingsPanel')
export class SettingsPanel extends Component {
  private _built = false;
  private _fromPrefab = false;
  private _inPlay = false;
  private _canSkip = false;
  private _busy = false;
  private _onClose: (() => void) | null = null;
  private _onRestart: (() => void) | null = null;
  private _onHome: (() => void) | null = null;
  private _onLink: (() => void) | null = null;
  private _onSkip: (() => void) | null = null;
  private _onReset: (() => void) | null = null;
  private _canLink = false;
  private _bgmSlider: Slider | null = null;
  private _sfxSlider: Slider | null = null;
  private _bgmFill: Node | null = null;
  private _sfxFill: Node | null = null;
  private _sfxPreviewAt = 0;

  setup(opts: {
    onClose: () => void;
    onRestart: () => void;
    onHome: () => void;
    onLink?: () => void;
    onSkip: () => void;
    onReset: () => void;
  }): void {
    this._onClose = opts.onClose;
    this._onRestart = opts.onRestart;
    this._onHome = opts.onHome;
    this._onLink = opts.onLink ?? null;
    this._onSkip = opts.onSkip;
    this._onReset = opts.onReset;
    this._ensureTree();
    this.layoutChrome();
  }

  show(opts?: { inPlay?: boolean; canSkip?: boolean; canLink?: boolean }): void {
    this._inPlay = !!opts?.inPlay;
    this._canSkip = !!opts?.canSkip;
    this._canLink = !!opts?.canLink;
    this._busy = false;
    this.node.active = true;
    this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);
    this.layoutChrome();
    this.applyArt();
    this._syncFromAudio();
    this._syncVersion();
    this._syncHaptic();
  }

  setBusy(on: boolean): void {
    this._busy = on;
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
    ensureBtnChrome(card?.getChildByName('ShareButton'), BTN_W, BTN_H, Color.WHITE, SHARE_OUTLINE, 'winDouble');
    ensureBtnChrome(this._skipBtn(), BTN_W, BTN_H, Color.WHITE, SKIP_OUTLINE, 'winAction');
    this._paintRestartButton(card?.getChildByName('ShareButton') ?? null);
    this._paintAdButton(this._skipBtn(), '跳过关卡', SKIP_OUTLINE);
    this._placeActions();
    this._paintVolumeRow(card?.getChildByName('BgmRow') ?? null, 'icMusic');
    this._paintVolumeRow(card?.getChildByName('SfxRow') ?? null, 'icSfx');
    this._paintOptionRow(card?.getChildByName('HapticRow') ?? null, 'icHaptic');
    this._paintOptionRow(card?.getChildByName('LinkRow') ?? null, 'icLink');
    this._syncHaptic();
  }

  layoutChrome(): void {
    this._ensureTree();
    const vis = uiVisibleSize();
    this.node.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    this.node.getComponent(Widget)?.updateAlignment();
    this.node.getChildByName('Dim')?.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    this._layoutBody();
    this._applyChrome();
  }

  private _linkOnHome(): boolean {
    return !this._inPlay && this._canLink;
  }

  private _cardH(): number {
    return CARD_H_BASE + (this._linkOnHome() ? EXTRA_ROW : 0);
  }

  private _lift(): number {
    return (this._cardH() - CARD_H_BASE) * 0.5;
  }

  private _actionY(): number {
    return ACTION_Y_HOME - this._lift();
  }

  private _versionY(): number {
    return VERSION_Y_HOME - this._lift();
  }

  private _skipBtn(): Node | null {
    return this.node.getChildByName('Card')?.getChildByName('SkipButton') ?? null;
  }

  private _layoutBody(): void {
    const lift = this._lift();
    const cardH = this._cardH();
    const card = this.node.getChildByName('Card');
    card?.setPosition(0, 20, 0);
    card?.getComponent(UITransform)?.setContentSize(CARD_W, cardH);
    const frame = card?.getChildByName('Frame');
    frame?.getComponent(UITransform)?.setContentSize(CARD_W, cardH);
    card?.getChildByName('Title')?.setPosition(0, TITLE_Y_HOME + lift, 0);
    card?.getChildByName('CloseBtn')?.setPosition(CLOSE_X, CLOSE_Y_HOME + lift, 0);
    card?.getChildByName('BgmRow')?.setPosition(0, BGM_Y_HOME + lift, 0);
    card?.getChildByName('SfxRow')?.setPosition(0, SFX_Y_HOME + lift, 0);
    const hapticY = HAPTIC_Y_HOME + lift;
    card?.getChildByName('HapticRow')?.setPosition(0, hapticY, 0);
    const homeRow = card?.getChildByName('HomeRow');
    const homeBtn = card?.getChildByName('HomeButton');
    const clubBtn = card?.getChildByName('ClubButton');
    const link = card?.getChildByName('LinkRow');
    const skipRow = card?.getChildByName('SkipRow');
    const reset = card?.getChildByName('ResetRow');
    if (homeRow) homeRow.active = false;
    if (homeBtn) homeBtn.active = false;
    if (clubBtn) clubBtn.active = false;
    if (skipRow) skipRow.active = false;
    if (reset) reset.active = false;
    if (link) {
      link.active = this._linkOnHome();
      if (link.active) link.setPosition(0, hapticY - OPT_STEP, 0);
    }
    this._placeActions();
    this._syncVersion();
  }

  private _placeActions(): void {
    const card = this.node.getChildByName('Card');
    const share = card?.getChildByName('ShareButton');
    const skip = this._skipBtn();
    const y = this._actionY();
    const showSkip = this._inPlay && this._canSkip;
    share?.getComponent(UITransform)?.setContentSize(BTN_W, BTN_H);
    skip?.getComponent(UITransform)?.setContentSize(BTN_W, BTN_H);
    if (share) share.active = true;
    if (skip) skip.active = showSkip;
    share?.setPosition(showSkip ? COL_L : 0, y, 0);
    skip?.setPosition(COL_R, y, 0);
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
      frame = this._mk('Frame', card, CARD_W, this._cardH());
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
    const h = ut?.height || this._cardH();
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

    const card = this._mk('Card', this.node, CARD_W, CARD_H_BASE);
    if (!card.getComponent(BlockInputEvents)) card.addComponent(BlockInputEvents);
    const frame = this._mk('Frame', card, CARD_W, CARD_H_BASE);
    frame.setSiblingIndex(0);
    applyArtSpriteSoon(frame, 'panelMain', CARD_W, CARD_H_BASE);
    const title = this._label(card, 'Title', '设置', 64, TITLE_INK, 0, TITLE_Y_HOME, CARD_W - 160, 88, true);
    title.outlineColor = TITLE_INK;
    title.outlineWidth = 0;

    this._volumeRow(card, 'BgmRow', '背景音乐', BGM_Y_HOME);
    this._volumeRow(card, 'SfxRow', '音效', SFX_Y_HOME);
    this._action(card, 'ShareButton', '重新开始', COL_L, ACTION_Y_HOME, () => undefined);
    this._action(card, 'SkipButton', '跳过关卡', COL_R, ACTION_Y_HOME, () => undefined);

    const close = this._mk('CloseBtn', card, CLOSE, CLOSE);
    close.setPosition(CLOSE_X, CLOSE_Y_HOME, 0);
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

    if (card) this._ensureOptionRows(card);

    dim?.off(Node.EventType.TOUCH_END);
    dim?.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      if (this._busy) return;
      this._onClose?.();
    }, this);
    this._bindTap(card?.getChildByName('CloseBtn'), () => this._onClose?.());
    this._bindTap(card?.getChildByName('ShareButton'), () => this._onRestart?.());
    this._bindTap(this._skipBtn(), () => this._onSkip?.());
    this._bindTap(card?.getChildByName('HapticRow'), () => this._toggleHaptic());
    this._bindTap(card?.getChildByName('LinkRow'), () => this._onLink?.());
    this._syncVersion();
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
      if (this._busy) return;
      gameAudio()?.playUiClick();
      onTap();
    }, this);
  }

  private _ensureOptionRows(card: Node): void {
    this._optionRow(card, 'HapticRow', '震动');
    this._optionRow(card, 'LinkRow', '连线');
    if (!card.getChildByName('SkipButton')) {
      this._action(card, 'SkipButton', '跳过关卡', COL_R, ACTION_Y_HOME, () => undefined);
    }
    const homeRow = card.getChildByName('HomeRow');
    if (homeRow) homeRow.active = false;
    const skipRow = card.getChildByName('SkipRow');
    if (skipRow) skipRow.active = false;
    const reset = card.getChildByName('ResetRow');
    if (reset) reset.active = false;
  }

  private _optionRow(parent: Node, name: string, text: string): Node {
    let row = parent.getChildByName(name);
    if (row) return row;
    row = this._mk(name, parent, ROW_W, OPT_H);
    fillInvisibleHit(row);
    const icon = this._mk('Icon', row, ICON, ICON);
    icon.setPosition(this._iconX(), 0, 0);
    this._label(row, 'Label', text, 40, TITLE_INK, this._labelX(), 0, LABEL_W, LABEL_H, false);
    this._styleRowLabel(row, 0);
    if (name === 'HapticRow') {
      this._mk('Toggle', row, TOGGLE_W, TOGGLE_H).setPosition(this._toggleX(), 0, 0);
    }
    return row;
  }

  private _paintOptionRow(
    row: Node | null,
    iconKey: 'icHaptic' | 'icLink',
  ): void {
    if (!row) return;
    const icon = row.getChildByName('Icon');
    icon?.getComponent(UITransform)?.setContentSize(ICON, ICON);
    icon?.setPosition(this._iconX(), 0, 0);
    applyArtSpriteSoon(icon, iconKey, ICON, ICON);
    this._styleRowLabel(row, 0);
  }

  private _paintRestartButton(btn: Node | null): void {
    if (!btn) return;
    const content = btn.getChildByName('Content');
    const ad = content?.getChildByName('AdIcon');
    if (ad) ad.active = false;
    const lab = content?.getChildByName('Label') ?? btn.getChildByName('Label');
    this._styleActionLabel(lab, '重新开始', SHARE_OUTLINE);
    content?.setPosition(0, 2, 0);
    if (content && lab) {
      content.getComponent(UITransform)?.setContentSize(BTN_W - 24, BTN_H - 8);
      lab.setPosition(0, 0, 0);
    }
  }

  private _paintAdButton(btn: Node | null, text: string, outline: Color): void {
    if (!btn) return;
    let content = btn.getChildByName('Content');
    if (!content) {
      content = this._mk('Content', btn, BTN_W - 24, BTN_H - 8);
      const lab = btn.getChildByName('Label');
      if (lab) lab.setParent(content);
      this._mk('AdIcon', content, Math.round(AD_ICON_H * 1.41), AD_ICON_H);
    }
    const lab = content.getChildByName('Label');
    this._styleActionLabel(lab, text, outline);
    const actionLab = lab?.getComponent(Label);
    if (actionLab) {
      actionLab.fontSize = SKIP_FONT;
      actionLab.lineHeight = SKIP_FONT + 6;
    }
    applyAdIcon(content.getChildByName('AdIcon'), AD_ICON_H);
    this._layoutAdContent(content);
  }

  private _layoutAdContent(content: Node): void {
    const icon = content.getChildByName('AdIcon');
    const lab = content.getChildByName('Label');
    const textW = 200;
    const gap = 10;
    const iconW = applyAdIcon(icon, AD_ICON_H);
    const w = iconW + gap + textW;
    content.getComponent(UITransform)?.setContentSize(w, BTN_H - 8);
    content.setPosition(0, 2, 0);
    icon?.setPosition(-w * 0.5 + iconW * 0.5, 0, 0);
    lab?.setPosition(-w * 0.5 + iconW + gap + textW * 0.5, 0, 0);
    lab?.getComponent(UITransform)?.setContentSize(textW, BTN_H - 16);
  }

  private _toggleHaptic(): void {
    const on = !isHapticEnabled();
    setHapticEnabled(on);
    this._syncHaptic();
    if (on) vibrateShort('medium');
  }

  private _syncHaptic(): void {
    const toggle = this.node.getChildByName('Card')?.getChildByName('HapticRow')?.getChildByName('Toggle');
    if (!toggle) return;
    this._paintToggle(toggle, isHapticEnabled());
  }

  private _paintToggle(node: Node, on: boolean): void {
    let g = node.getComponent(Graphics);
    if (!g) g = node.addComponent(Graphics);
    const ut = node.getComponent(UITransform);
    ut?.setContentSize(TOGGLE_W, TOGGLE_H);
    node.setPosition(this._toggleX(), 0, 0);
    const w = TOGGLE_W;
    const h = TOGGLE_H;
    const r = h * 0.5;
    const knob = h - 10;
    const x = on ? w * 0.5 - knob * 0.5 - 5 : -w * 0.5 + knob * 0.5 + 5;
    g.enabled = true;
    g.clear();
    g.fillColor = on ? TOGGLE_ON : TOGGLE_OFF;
    g.roundRect(-w * 0.5, -h * 0.5, w, h, r);
    g.fill();
    g.fillColor = TOGGLE_KNOB;
    g.circle(x, 0, knob * 0.5);
    g.fill();
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
    icon.setPosition(this._iconX(), this._volumeLabelY(), 0);
    this._label(row, 'Label', text, 40, TITLE_INK, this._labelX(), this._volumeLabelY(), LABEL_W, LABEL_H, false);
    this._styleRowLabel(row, this._volumeLabelY());

    const area = this._mk('SliderArea', row, TRACK_W, Math.max(TRACK_H, THUMB) + 16);
    area.setPosition(CONTENT_SHIFT, -ROW_H * 0.5 + TRACK_H * 0.5 + 8, 0);

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
    icon?.getComponent(UITransform)?.setContentSize(ICON, ICON);
    icon?.setPosition(this._iconX(), this._volumeLabelY(), 0);
    applyArtSpriteSoon(icon, iconKey, ICON, ICON);
    this._styleRowLabel(row, this._volumeLabelY());
    const area = row.getChildByName('SliderArea');
    area?.setPosition(CONTENT_SHIFT, -ROW_H * 0.5 + TRACK_H * 0.5 + 8, 0);
    area?.getComponent(UITransform)?.setContentSize(TRACK_W, Math.max(TRACK_H, THUMB) + 16);
    const track = area?.getChildByName('Track') ?? null;
    track?.getComponent(UITransform)?.setContentSize(TRACK_W, TRACK_H);
    applyArtSpriteSoon(track, 'loadTrack', TRACK_W, TRACK_H, true);
    const fill = area?.getChildByName('Fill') ?? null;
    const fillUt = fill?.getComponent(UITransform);
    applyArtSpriteSoon(fill, 'loadFill', fillUt?.width || FILL_H, FILL_H, true);
    const handle = area?.getChildByName('Handle') ?? null;
    handle?.getComponent(UITransform)?.setContentSize(THUMB, THUMB);
    applyArtSpriteSoon(handle, 'loadKnob', THUMB, THUMB);
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

  private _syncVersion(): void {
    const card = this.node.getChildByName('Card');
    if (!card) return;
    const text = getWxMiniProgramVersionText();
    let node = card.getChildByName('Version');
    if (!text) {
      if (node) node.active = false;
      return;
    }
    if (!node) {
      const lab = this._label(card, 'Version', text, 28, VERSION_INK, 0, this._versionY(), CARD_W - 80, 40, false);
      lab.outlineWidth = 0;
      lab.enableOutline = false;
      lab.color = VERSION_INK;
      node = lab.node;
    } else {
      const lab = node.getComponent(Label);
      if (lab) {
        lab.string = text;
        lab.color = VERSION_INK;
        lab.enableOutline = false;
      }
    }
    node.active = true;
    node.setPosition(0, this._versionY(), 0);
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
    const cap = Math.ceil(fillH * 0.5) + 6;
    const w = progress <= 0.001 ? 0 : Math.max(cap * 2, travel * progress);
    ut.setAnchorPoint(0, 0.5);
    ut.setContentSize(w, fillH);
    fill.setPosition(-trackW / 2 + FILL_INSET, 0, 0);
    fill.active = w > 0;
  }

  private _iconX(): number {
    return -ROW_W * 0.5 + ICON * 0.5 + ICON_PAD + CONTENT_SHIFT;
  }

  private _labelX(): number {
    return -ROW_W * 0.5 + ICON_PAD + ICON + LABEL_GAP + CONTENT_SHIFT;
  }

  private _toggleX(): number {
    return ROW_W * 0.5 - TOGGLE_W * 0.5 + CONTENT_SHIFT;
  }

  private _volumeLabelY(): number {
    return ROW_H * 0.5 - ICON * 0.5 - 4;
  }

  private _styleRowLabel(row: Node | null, y: number): void {
    const node = row?.getChildByName('Label');
    if (!node) return;
    const ut = node.getComponent(UITransform);
    ut?.setAnchorPoint(0, 0.5);
    ut?.setContentSize(LABEL_W, LABEL_H);
    node.setPosition(this._labelX(), y, 0);
    const lab = node.getComponent(Label);
    if (!lab) return;
    lab.horizontalAlign = Label.HorizontalAlign.LEFT;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    lab.overflow = Label.Overflow.NONE;
    lab.outlineWidth = 3;
    lab.outlineColor = Color.WHITE;
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
