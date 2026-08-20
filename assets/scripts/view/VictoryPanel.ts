import {
  _decorator,
  Color,
  Component,
  EventTouch,
  Graphics,
  Label,
  Layers,
  Mask,
  Node,
  Sprite,
  SpriteFrame,
  Tween,
  UIOpacity,
  UITransform,
  Vec3,
  Widget,
  tween,
} from 'cc';
import { chestPercentOf, chestReadyOf, chestStepOf } from '../game/ChestProgress';
import { uiVisibleSize } from '../game/ViewFit';
import { gameAudio } from '../audio/AudioService';
import { applyArtSpriteSoon, ensureBtnChrome, VOLCANO_BTN_H, VOLCANO_BTN_W } from './UiArt';
import { clearWinConfetti, playWinConfetti, warmupWinConfetti } from './WinConfetti';

const { ccclass } = _decorator;

const DIM = new Color(6, 8, 14, 222);
const BTN_INK = new Color(255, 255, 255, 255);
const NEXT_OUTLINE = new Color(20, 64, 32, 255);
const DOUBLE_OUTLINE = new Color(88, 48, 16, 255);
const NEXT_FILL = new Color(120, 190, 244, 255);
const DOUBLE_FILL = new Color(253, 188, 46, 255);
const GOLD_INK = new Color(248, 225, 128, 255);
const GOLD_OUTLINE = new Color(74, 68, 128, 255);
const TITLE_INK = new Color(255, 214, 64, 255);
const TITLE_OUTLINE = new Color(88, 48, 16, 255);
const BTN_W = VOLCANO_BTN_W;
const BTN_H = VOLCANO_BTN_H;
const BTN_GAP = 24;
const AD_ICON_W = 52;
const AD_ICON_H = 36;
const BTN_FONT = 40;
const GOLD_ICON = 72;
const GOLD_LAB_W = 160;
const GOLD_GAP = 12;
const GOLD_FONT = 56;
const CHEST = 560;
const SHADOW_TINT = new Color(28, 26, 36, 255);
const FILL_TINT = new Color(64, 196, 255, 255);
const GLOW = new Color(255, 196, 72, 46);
const SHEEN = new Color(190, 240, 255, 210);
const PCT_INK = new Color(255, 255, 255, 255);
const PCT_OUTLINE = new Color(16, 18, 28, 255);
const PCT_FONT = 92;

@ccclass('VictoryPanel')
export class VictoryPanel extends Component {
  private _built = false;
  private _onNext: (() => void) | null = null;
  private _onDouble: (() => void) | null = null;
  private _gold = 0;
  private _canDouble = true;
  private _locked = false;
  private _nextLabel = '下一关';
  private _cleared = 0;
  private _fill = 0;
  private _fillPx = -1;
  private _pctShown = -1;
  private _dimW = 0;
  private _dimH = 0;
  private _pctAnim: { v: number } | null = null;
  private _open = false;
  private _gpuHot = false;

  isOpen(): boolean {
    return this._open;
  }

  setup(opts: { onNext: () => void; onDouble?: () => void }): void {
    this._onNext = opts.onNext;
    this._onDouble = opts.onDouble ?? null;
    this._ensureTree();
    this._bindEvents();
    this._fade(0);
    this.node.active = true;
    const dim = this.node.getChildByName('Dim') ?? this.node;
    dim.off(Node.EventType.TOUCH_END);
    dim.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
    }, this);
    this.layoutChrome();
    this._bakePctAtlas();
    this.node.pauseSystemEvents(true);
  }

  /**
   * Compile UI + particle shaders while BootLoad still covers the canvas.
   * Near-zero opacity so splash pixels are not replaced.
   */
  async warmup(): Promise<void> {
    this._ensureTree();
    this.node.active = true;
    this._gold = 25;
    this._canDouble = true;
    this._cleared = 5;
    this._nextLabel = '下一关';
    this._syncDouble();
    this._syncGold();
    this._syncChest();
    this._paintBtns();
    this._setFill(1);
    this._bakePctAtlas();
    this._setPctText(40);
    this._fade(1);
    await warmupWinConfetti(this.node);
    await gameAudio()?.ensureWin();
    if (!this.node.isValid) return;
    this._fade(0);
    this.node.pauseSystemEvents(true);
    this._open = false;
    this._gpuHot = true;
    this._gold = 0;
    this._cleared = 0;
    this._fill = 0;
    this._fillPx = -1;
  }

  show(opts?: { hasNext?: boolean; gold?: number; canDouble?: boolean; nextLabel?: string; cleared?: number }): void {
    this._ensureTree();
    this._gold = Math.max(0, Math.floor(opts?.gold ?? 0));
    this._canDouble = opts?.canDouble !== false && this._gold > 0;
    this._nextLabel = opts?.nextLabel || '下一关';
    this._cleared = Math.max(0, Math.floor(opts?.cleared ?? 0));
    this._locked = false;
    this._open = true;
    this.node.active = true;
    this.node.resumeSystemEvents(true);
    this._fade(255);
    const next = this._stage()?.getChildByName('NextBtn');
    if (next) next.active = opts?.hasNext !== false;
    this._syncDouble();
    this._syncGold();
    this._syncChest();
    if (!this._gpuHot) this._paintBtns();
    else this._syncBtnLabels();
    const vis = uiVisibleSize();
    this._placeStage(vis.w, vis.h);
    this._popIn();
    this._playChestPct();
    gameAudio()?.playWin();
    playWinConfetti(this.node);
  }

  setDoubleVisible(visible: boolean): void {
    this._canDouble = visible;
    this._syncDouble();
    this.layoutChrome();
  }

  lock(): void {
    this._locked = true;
  }

  releaseFx(): void {
    clearWinConfetti(this.node);
  }

  hide(): void {
    this._open = false;
    Tween.stopAllByTarget(this._stage());
    Tween.stopAllByTarget(this._chestWrap());
    if (this._pctAnim) Tween.stopAllByTarget(this._pctAnim);
    clearWinConfetti(this.node);
    this._fade(0);
    this.node.pauseSystemEvents(true);
    this._locked = false;
  }

  private _fade(opacity: number): void {
    const op = this.node.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
    op.opacity = opacity;
  }

  goldStartWorld(out: Vec3): Vec3 {
    const icon = this._goldIcon();
    if (icon?.isValid) {
      icon.getWorldPosition(out);
      return out;
    }
    this.node.getWorldPosition(out);
    return out;
  }

  goldIconFrame(): SpriteFrame | null {
    return this._goldIcon()?.getComponent(Sprite)?.spriteFrame ?? null;
  }

  chestStartWorld(out: Vec3): Vec3 {
    const art = this._chestWrap()?.getChildByName('Shadow');
    if (art?.isValid) {
      art.getWorldPosition(out);
      return out;
    }
    return this.goldStartWorld(out);
  }

  layoutChrome(): void {
    this._ensureTree();
    const vis = uiVisibleSize();
    this.node.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    this.node.getComponent(Widget)?.updateAlignment();
    const dim = this.node.getChildByName('Dim');
    dim?.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    dim?.getComponent(Widget)?.updateAlignment();
    if (this._dimW !== vis.w || this._dimH !== vis.h) {
      this._dimW = vis.w;
      this._dimH = vis.h;
      this._fillDim(dim, vis.w, vis.h);
    }
    this._placeStage(vis.w, vis.h);
    this._paintBtns();
    this._hideFrame();
  }

  private _stage(): Node | null {
    return this.node.getChildByName('Card');
  }

  private _chestWrap(): Node | null {
    return this._stage()?.getChildByName('ChestProgress') ?? null;
  }

  private _goldIcon(): Node | null {
    const gold = this._stage()?.getChildByName('GoldReward');
    if (gold) gold.active = true;
    return gold?.getChildByName('GoldIcon') ?? gold ?? null;
  }

  private _hideFrame(): void {
    const frame = this._stage()?.getChildByName('Frame');
    if (!frame) return;
    frame.active = false;
    const sp = frame.getComponent(Sprite);
    if (sp) {
      sp.spriteFrame = null;
      sp.enabled = false;
    }
  }

  private _placeStage(w: number, h: number): void {
    const stage = this._stage();
    if (!stage) return;
    stage.getComponent(UITransform)?.setContentSize(w, h);
    stage.setPosition(0, 0, 0);
    this._layoutTitle(h);
    this._layoutChest(h);
    this._layoutGold(h);
    const double = stage.getChildByName('DoubleBtn');
    const next = stage.getChildByName('NextBtn');
    const count = (double?.active ? 1 : 0) + (next?.active ? 1 : 0);
    const span = count * BTN_W + Math.max(0, count - 1) * BTN_GAP;
    const y = -380;
    let x = -span * 0.5 + BTN_W * 0.5;
    if (double?.active) {
      this._sizeBtn(double);
      double.setPosition(x, y, 0);
      x += BTN_W + BTN_GAP;
    }
    if (next?.active) {
      this._sizeBtn(next);
      next.setPosition(x, y, 0);
    }
    this._layoutDoubleContent();
    this._layoutNextLabel();
  }

  private _sizeBtn(node: Node): void {
    node.getComponent(UITransform)?.setContentSize(BTN_W, BTN_H);
  }

  private _fillDim(node: Node | null, w: number, h: number): void {
    if (!node) return;
    const sp = node.getComponent(Sprite);
    if (sp) {
      sp.spriteFrame = null;
      sp.enabled = false;
    }
    let g = node.getComponent(Graphics);
    if (!g) g = node.addComponent(Graphics);
    g.enabled = true;
    g.clear();
    g.fillColor = DIM;
    g.rect(-w * 0.5, -h * 0.5, w, h);
    g.fill();
    node.setSiblingIndex(0);
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
    this._ensureDim();
    this._ensureStage();
    this._ensureBtns();
  }

  private _ensureDim(): Node {
    let dim = this.node.getChildByName('Dim');
    if (!dim) {
      const vis = uiVisibleSize();
      dim = this._mk('Dim', this.node, vis.w, vis.h);
    }
    dim.setSiblingIndex(0);
    return dim;
  }

  private _ensureStage(): Node {
    let stage = this.node.getChildByName('Card');
    if (!stage) stage = this._mk('Card', this.node, 1080, 1920);
    this._hideFrame();
    return stage;
  }

  private _ensureBtns(): void {
    const stage = this._ensureStage();
    this._ensureTitle(stage);
    this._ensureGold();
    this._ensureChest();
    if (!stage.getChildByName('DoubleBtn')) {
      const btn = this._mk('DoubleBtn', stage, BTN_W, BTN_H);
      const content = this._mk('Content', btn, 280, BTN_H - 8);
      this._mk('AdIcon', content, AD_ICON_W, AD_ICON_H);
      this._styleLabel(this._mk('Label', content, 200, BTN_H - 16), '双倍领取', DOUBLE_OUTLINE);
    }
    const next = stage.getChildByName('NextBtn') ?? this._mk('NextBtn', stage, BTN_W, BTN_H);
    if (!next.getChildByName('Label')) {
      this._styleLabel(this._mk('Label', next, BTN_W - 24, BTN_H - 16), '下一关', NEXT_OUTLINE);
    }
    this._layoutDoubleContent();
    this._layoutNextLabel();
  }

  private _ensureTitle(stage: Node): void {
    if (!stage.getChildByName('Title')) {
      this._styleTitle(this._mk('Title', stage, 860, 120), '胜利!', 92);
    }
    const sub = stage.getChildByName('Sub');
    if (sub) sub.active = false;
  }

  private _layoutTitle(h: number): void {
    this._stage()?.getChildByName('Title')?.setPosition(0, 460, 0);
    void h;
  }

  private _styleTitle(node: Node, text: string, size: number): Label {
    const lab = node.getComponent(Label) ?? node.addComponent(Label);
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

  private _styleLabel(node: Node, text: string, outline = NEXT_OUTLINE): Label {
    const lab = node.getComponent(Label) ?? node.addComponent(Label);
    lab.string = text;
    lab.fontSize = BTN_FONT;
    lab.lineHeight = BTN_FONT + 8;
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
    return lab;
  }

  private _layoutDoubleContent(): void {
    const btn = this._stage()?.getChildByName('DoubleBtn');
    const content = btn?.getChildByName('Content');
    if (!btn || !content) return;
    const icon = content.getChildByName('AdIcon');
    const lab = content.getChildByName('Label');
    const textW = 200;
    const gap = 10;
    const w = AD_ICON_W + gap + textW;
    content.getComponent(UITransform)?.setContentSize(w, BTN_H - 8);
    content.setPosition(0, 2, 0);
    icon?.setPosition(-w * 0.5 + AD_ICON_W * 0.5, 0, 0);
    lab?.setPosition(-w * 0.5 + AD_ICON_W + gap + textW * 0.5, 0, 0);
  }

  private _layoutNextLabel(): void {
    const next = this._stage()?.getChildByName('NextBtn');
    const lab = next?.getChildByName('Label');
    if (!lab) return;
    lab.getComponent(UITransform)?.setContentSize(BTN_W - 24, BTN_H - 16);
    lab.setPosition(0, 2, 0);
  }

  private _bareBtn(node: Node | null | undefined): void {
    if (!node) return;
    const sp = node.getComponent(Sprite);
    if (sp) {
      sp.spriteFrame = null;
      sp.enabled = false;
    }
    const g = node.getComponent(Graphics);
    if (g) {
      g.clear();
      g.enabled = false;
    }
  }

  private _paintBtns(): void {
    const stage = this._stage();
    const double = stage?.getChildByName('DoubleBtn') ?? null;
    const next = stage?.getChildByName('NextBtn') ?? null;
    if (!double?.getChildByName('Skin')) {
      this._bareBtn(double);
      ensureBtnChrome(double, BTN_W, BTN_H, DOUBLE_FILL, DOUBLE_OUTLINE, 'winDouble');
    }
    if (!next?.getChildByName('Skin')) {
      this._bareBtn(next);
      ensureBtnChrome(next, BTN_W, BTN_H, NEXT_FILL, NEXT_OUTLINE, 'winAction');
    }
    this._syncBtnLabels();
    if (!double?.getChildByName('Content')?.getChildByName('AdIcon')?.getComponent(Sprite)?.spriteFrame) {
      applyArtSpriteSoon(
        double?.getChildByName('Content')?.getChildByName('AdIcon') ?? null,
        'icAd',
        AD_ICON_W,
        AD_ICON_H,
      );
    }
    this._syncGold();
  }

  private _syncBtnLabels(): void {
    const stage = this._stage();
    const dLab = stage?.getChildByName('DoubleBtn')?.getChildByName('Content')?.getChildByName('Label');
    const nLab = stage?.getChildByName('NextBtn')?.getChildByName('Label');
    const dComp = dLab?.getComponent(Label);
    if (dComp) dComp.string = '双倍领取';
    else if (dLab) this._styleLabel(dLab, '双倍领取', DOUBLE_OUTLINE);
    const nComp = nLab?.getComponent(Label);
    if (nComp) nComp.string = this._nextLabel;
    else if (nLab) this._styleLabel(nLab, this._nextLabel, NEXT_OUTLINE);
  }

  private _ensureGold(): void {
    const stage = this._stage();
    if (!stage) return;
    let gold = stage.getChildByName('GoldReward');
    if (!gold) {
      const w = GOLD_ICON + GOLD_GAP + GOLD_LAB_W;
      gold = this._mk('GoldReward', stage, w, GOLD_ICON + 8);
      this._mk('GoldIcon', gold, GOLD_ICON, GOLD_ICON);
      this._mk('GoldLabel', gold, GOLD_LAB_W, GOLD_ICON + 8);
    }
    this._syncGold();
  }

  private _syncGold(): void {
    const gold = this._stage()?.getChildByName('GoldReward');
    if (!gold) return;
    gold.active = this._gold > 0;
    const labN = gold.getChildByName('GoldLabel');
    const lab = labN?.getComponent(Label);
    if (lab) lab.string = `+${this._gold}`;
    else if (labN) this._styleGoldLabel(labN, `+${this._gold}`);
    const icon = gold.getChildByName('GoldIcon');
    if (!icon?.getComponent(Sprite)?.spriteFrame) {
      applyArtSpriteSoon(icon, 'goldIcon', GOLD_ICON, GOLD_ICON);
    }
  }

  private _styleGoldLabel(node: Node, text: string): Label {
    const lab = node.getComponent(Label) ?? node.addComponent(Label);
    lab.string = text;
    lab.fontSize = GOLD_FONT;
    lab.lineHeight = GOLD_FONT + 6;
    lab.isBold = true;
    lab.color = GOLD_INK;
    lab.enableOutline = true;
    lab.outlineWidth = 5;
    lab.outlineColor = GOLD_OUTLINE;
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    lab.overflow = Label.Overflow.NONE;
    lab.enableWrapText = false;
    lab.useSystemFont = true;
    lab.fontFamily = 'PingFang SC';
    return lab;
  }

  private _layoutGold(h: number): void {
    const gold = this._stage()?.getChildByName('GoldReward');
    if (!gold) return;
    const w = GOLD_ICON + GOLD_GAP + GOLD_LAB_W;
    gold.getComponent(UITransform)?.setContentSize(w, GOLD_ICON + 8);
    gold.setPosition(0, -240, 0);
    void h;
    gold.active = this._gold > 0;
    const icon = gold.getChildByName('GoldIcon');
    const lab = gold.getChildByName('GoldLabel');
    icon?.getComponent(UITransform)?.setContentSize(GOLD_ICON, GOLD_ICON);
    icon?.setPosition(-w * 0.5 + GOLD_ICON * 0.5, 0, 0);
    lab?.getComponent(UITransform)?.setContentSize(GOLD_LAB_W, GOLD_ICON + 8);
    lab?.setPosition(-w * 0.5 + GOLD_ICON + GOLD_GAP + GOLD_LAB_W * 0.5, 2, 0);
  }

  private _ensureChest(): void {
    const stage = this._stage();
    if (!stage) return;
    let wrap = stage.getChildByName('ChestProgress');
    if (!wrap) {
      wrap = this._mk('ChestProgress', stage, CHEST + 80, CHEST + 160);
      this._mk('Glow', wrap, CHEST + 80, CHEST + 80);
      this._mk('Shadow', wrap, CHEST, CHEST);
      const clip = this._mk('FillClip', wrap, CHEST, CHEST);
      this._mk('FillArt', clip, CHEST, CHEST);
      this._stylePct(this._mk('Pct', wrap, 360, 120), '0%');
    }
    this._syncChest();
  }

  private _syncChest(): void {
    const wrap = this._chestWrap();
    if (!wrap) return;
    const on = this._cleared > 0;
    wrap.active = on;
    if (!on) return;
    const hint = wrap.getChildByName('Hint');
    if (hint) hint.active = false;
    this._paintChestArt();
    this._setFill(chestPercentOf(this._cleared) / 100);
    this._setPctText(chestPercentOf(this._cleared));
  }

  private _layoutChest(_h: number): void {
    const wrap = this._chestWrap();
    if (!wrap) return;
    wrap.getComponent(UITransform)?.setContentSize(CHEST + 80, CHEST + 160);
    wrap.setPosition(0, 70, 0);
    wrap.active = this._cleared > 0;
    const glow = wrap.getChildByName('Glow');
    const shadow = wrap.getChildByName('Shadow');
    const clip = wrap.getChildByName('FillClip');
    const pct = wrap.getChildByName('Pct');
    const hint = wrap.getChildByName('Hint');
    glow?.getComponent(UITransform)?.setContentSize(CHEST + 80, CHEST + 80);
    glow?.setPosition(0, 8, 0);
    shadow?.getComponent(UITransform)?.setContentSize(CHEST, CHEST);
    shadow?.setPosition(0, 8, 0);
    clip?.setPosition(0, 8, 0);
    pct?.getComponent(UITransform)?.setContentSize(360, 120);
    pct?.setPosition(0, 12, 0);
    if (hint) hint.active = false;
    if (glow) glow.active = false;
    this._paintChestArt();
    this._applyFill(this._fill);
  }

  private _paintChestArt(): void {
    const wrap = this._chestWrap();
    if (!wrap) return;
    const shadow = wrap.getChildByName('Shadow');
    const fill = wrap.getChildByName('FillClip')?.getChildByName('FillArt');
    if (shadow?.getComponent(Sprite)?.spriteFrame && fill?.getComponent(Sprite)?.spriteFrame) {
      this._tintChest();
      this._applyFill(this._fill);
      return;
    }
    applyArtSpriteSoon(shadow, 'chest', CHEST, CHEST, false, () => this._tintChest());
    applyArtSpriteSoon(fill ?? null, 'chest', CHEST, CHEST, false, () => this._applyFill(this._fill));
    this._tintChest();
  }

  private _tintChest(): void {
    const wrap = this._chestWrap();
    const shadowSp = wrap?.getChildByName('Shadow')?.getComponent(Sprite);
    if (shadowSp) shadowSp.color = SHADOW_TINT;
    const fillSp = wrap?.getChildByName('FillClip')?.getChildByName('FillArt')?.getComponent(Sprite);
    if (fillSp) fillSp.color = Color.WHITE;
  }

  private _setFill(t: number): void {
    this._fill = Math.max(0, Math.min(1, t));
    this._applyFill(this._fill);
  }

  private _applyFill(t: number): void {
    const clip = this._chestWrap()?.getChildByName('FillClip');
    const art = clip?.getChildByName('FillArt');
    if (!clip || !art) return;
    const k = Math.max(0, Math.min(1, t));
    const px = Math.max(0, Math.round(CHEST * k));
    if (px === this._fillPx) {
      const filled = art.getComponent(Sprite);
      if (filled && Math.abs(filled.fillRange - k) < 0.002) return;
    }
    this._fillPx = px;
    clip.active = true;
    clip.getComponent(UITransform)?.setContentSize(CHEST, CHEST);
    clip.setPosition(0, 8, 0);
    const mask = clip.getComponent(Mask);
    if (mask) mask.enabled = false;
    const g = clip.getComponent(Graphics);
    if (g) {
      g.clear();
      g.enabled = false;
    }
    art.getComponent(UITransform)?.setContentSize(CHEST, CHEST);
    art.setPosition(0, 0, 0);
    const sheen = clip.getChildByName('Sheen');
    if (sheen) sheen.active = false;
    const sp = art.getComponent(Sprite);
    if (!sp?.spriteFrame) return;
    sp.type = Sprite.Type.FILLED;
    sp.fillType = Sprite.FillType.VERTICAL;
    sp.fillStart = 0;
    sp.fillRange = k;
    sp.color = Color.WHITE;
  }

  private _playChestPct(): void {
    const wrap = this._chestWrap();
    if (!wrap?.active || this._cleared <= 0) return;
    const to = chestPercentOf(this._cleared);
    const from = chestStepOf(this._cleared) <= 1 ? 0 : chestPercentOf(this._cleared - 1);
    if (this._pctAnim) Tween.stopAllByTarget(this._pctAnim);
    const state = { v: from };
    this._pctAnim = state;
    this._setPctText(from);
    this._setFill(from / 100);
    tween(state)
      .to(0.7, { v: to }, {
        easing: 'quadOut',
        onUpdate: () => {
          const n = Math.round(state.v);
          if (n !== this._pctShown) this._setPctText(n);
          this._setFill(state.v / 100);
        },
      })
      .call(() => {
        this._setPctText(to);
        this._setFill(to / 100);
        if (!chestReadyOf(this._cleared)) return;
        Tween.stopAllByTarget(wrap);
        wrap.setScale(1, 1, 1);
        tween(wrap)
          .to(0.22, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'backOut' })
          .to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
          .call(() => this._breatheChest())
          .start();
      })
      .start();
  }

  private _setPctText(n: number): void {
    const node = this._chestWrap()?.getChildByName('Pct');
    if (!node) return;
    for (const child of node.children) child.active = false;
    const text = `${Math.max(0, Math.min(100, n | 0))}%`;
    const lab = node.getComponent(Label) ?? this._stylePct(node, text);
    lab.enabled = true;
    lab.string = text;
    if (n !== this._pctShown && this._pctShown >= 0 && (n % 4 === 0 || n === 100)) {
      Tween.stopAllByTarget(node);
      node.setScale(1.16, 1.16, 1);
      tween(node).to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    }
    this._pctShown = n;
  }

  private _stylePct(node: Node, text: string): Label {
    const lab = node.getComponent(Label) ?? node.addComponent(Label);
    lab.string = text;
    lab.fontSize = PCT_FONT;
    lab.lineHeight = PCT_FONT + 8;
    lab.isBold = true;
    lab.color = PCT_INK;
    lab.enableOutline = true;
    lab.outlineWidth = 10;
    lab.outlineColor = PCT_OUTLINE;
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    lab.overflow = Label.Overflow.NONE;
    lab.enableWrapText = false;
    lab.useSystemFont = true;
    lab.fontFamily = 'Arial Black';
    lab.cacheMode = Label.CacheMode.CHAR;
    return lab;
  }

  private _bakePctAtlas(): void {
    const node = this._chestWrap()?.getChildByName('Pct');
    if (!node) return;
    const lab = node.getComponent(Label) ?? this._stylePct(node, '0%');
    lab.string = '0123456789%';
    lab.updateRenderData?.(true);
    lab.string = '0%';
  }

  private _syncDouble(): void {
    const btn = this._stage()?.getChildByName('DoubleBtn');
    if (btn) btn.active = this._canDouble;
  }

  private _bindEvents(): void {
    this._bindTap(this._stage()?.getChildByName('NextBtn'), () => {
      if (this._locked) return;
      this._onNext?.();
    });
    this._bindTap(this._stage()?.getChildByName('DoubleBtn'), () => {
      if (this._locked) return;
      this._onDouble?.();
    });
  }

  private _bindTap(node: Node | null | undefined, onTap: () => void): void {
    if (!node) return;
    node.off(Node.EventType.TOUCH_START);
    node.off(Node.EventType.TOUCH_END);
    node.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
      e.propagationStopped = true;
      this.releaseFx();
    }, this);
    node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      gameAudio()?.playUiClick();
      onTap();
    }, this);
  }

  private _breatheChest(): void {
    const wrap = this._chestWrap();
    if (!wrap?.isValid || !wrap.active) return;
    Tween.stopAllByTarget(wrap);
    wrap.setScale(1, 1, 1);
    tween(wrap)
      .repeatForever(
        tween()
          .to(1.05, { scale: new Vec3(1.06, 1.06, 1) }, { easing: 'sineInOut' })
          .to(1.05, { scale: new Vec3(0.97, 0.97, 1) }, { easing: 'sineInOut' }),
      )
      .start();
  }

  private _popIn(): void {
    const wrap = this._chestWrap();
    const title = this._stage()?.getChildByName('Title');
    if (title) {
      Tween.stopAllByTarget(title);
      title.setScale(0.82, 0.82, 1);
      tween(title).to(0.32, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    }
    if (!wrap) return;
    Tween.stopAllByTarget(wrap);
    wrap.setScale(0.82, 0.82, 1);
    tween(wrap)
      .to(0.32, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .call(() => this._breatheChest())
      .start();
  }

  private _mk(name: string, parent: Node, w: number, h: number): Node {
    const n = new Node(name);
    parent.addChild(n);
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform).setContentSize(w, h);
    return n;
  }
}
