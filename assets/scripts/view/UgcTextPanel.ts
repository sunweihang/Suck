import {
  _decorator,
  BlockInputEvents,
  Color,
  Component,
  EditBox,
  EventTouch,
  Graphics,
  Label,
  Layers,
  Node,
  Sprite,
  SpriteFrame,
  Texture2D,
  Tween,
  UIOpacity,
  UITransform,
  Vec3,
  Widget,
  tween,
} from 'cc';
import { Theme } from '../game/Theme';
import { uiVisibleSize } from '../game/ViewFit';
import { gameAudio } from '../audio/AudioService';
import { styleQCaption } from './QChrome';
import { applyArtSpriteSoon, ensureBtnChrome, VOLCANO_BTN_H, VOLCANO_BTN_W } from './UiArt';

const { ccclass } = _decorator;

const CARD_W = 860;
const CARD_H = 1000;
const BOX_W = 700;
const BOX_H = 470;
const BOX_PAD = 36;
const CLOSE = 72;
const CLOSE_X = 340;
const CLOSE_Y = 425;
const TITLE_Y = 330;
const ACTION_Y = -323;
const BOX_Y = 16;
const BTN_W = VOLCANO_BTN_W;
const BTN_H = VOLCANO_BTN_H;
const TITLE_INK = new Color(74, 68, 128, 255);
const INK = new Color(56, 48, 88, 255);
const PLACE = new Color(160, 152, 184, 255);
const PLAY_INK = Color.WHITE;
const PLAY_OUTLINE = new Color(88, 48, 16, 255);
const HINT_W = 520;
const HINT_H = 56;
const HINT_OK = new Color(248, 244, 255, 255);
const HINT_ERR = new Color(255, 214, 218, 255);

let _white: SpriteFrame | null = null;

function whiteFrame(): SpriteFrame {
  if (_white) return _white;
  const tex = new Texture2D();
  tex.reset({ width: 2, height: 2, format: Texture2D.PixelFormat.RGBA8888 });
  tex.uploadData(new Uint8Array(16).fill(255));
  const sf = new SpriteFrame();
  sf.texture = tex;
  _white = sf;
  return sf;
}

type ClipBridge = {
  setClipboardData?: (opts: {
    data: string;
    success?: () => void;
    fail?: () => void;
    complete?: () => void;
  }) => void;
  getClipboardData?: (opts: {
    success?: (res: { data?: string }) => void;
    fail?: () => void;
  }) => void;
  getSystemInfoSync?: () => unknown;
};

function clipBridge(): ClipBridge | null {
  const g = globalThis as {
    wx?: ClipBridge;
    tt?: ClipBridge;
    ks?: ClipBridge;
    qq?: ClipBridge;
    my?: ClipBridge;
    swan?: ClipBridge;
    GameGlobal?: { wx?: ClipBridge };
  };
  const list = [g.wx, g.tt, g.ks, g.qq, g.my, g.swan, g.GameGlobal?.wx];
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (b && typeof b.setClipboardData === 'function' && typeof b.getSystemInfoSync === 'function') return b;
  }
  return null;
}

function copyViaDom(text: string): boolean {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc?.body) return false;
  const ta = doc.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', 'readonly');
  ta.style.position = 'fixed';
  ta.style.left = '0';
  ta.style.top = '0';
  ta.style.width = '1px';
  ta.style.height = '1px';
  ta.style.opacity = '0';
  doc.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    ta.setSelectionRange(0, text.length);
  } catch {
    /* some webviews omit this */
  }
  let ok = false;
  try {
    ok = !!doc.execCommand('copy');
  } catch {
    ok = false;
  }
  doc.body.removeChild(ta);
  return ok;
}

function copyText(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (ok: boolean) => resolve(ok);
    const wxApi = clipBridge();
    if (wxApi?.setClipboardData) {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        if (ok) {
          done(true);
          return;
        }
        if (copyViaDom(text)) {
          done(true);
          return;
        }
        const clip = (globalThis as { navigator?: { clipboard?: { writeText?: (s: string) => Promise<void> } } }).navigator?.clipboard;
        if (clip?.writeText) {
          clip.writeText(text).then(() => done(true)).catch(() => done(false));
          return;
        }
        done(false);
      };
      try {
        wxApi.setClipboardData({
          data: text,
          success: () => finish(true),
          fail: () => finish(false),
          complete: () => finish(false),
        });
      } catch {
        finish(false);
      }
      return;
    }
    const clip = (globalThis as { navigator?: { clipboard?: { writeText?: (s: string) => Promise<void> } } }).navigator?.clipboard;
    if (clip?.writeText) {
      clip.writeText(text).then(() => done(true)).catch(() => done(copyViaDom(text)));
      return;
    }
    done(copyViaDom(text));
  });
}

function readClipboard(): Promise<string> {
  return new Promise((resolve) => {
    const wxApi = clipBridge();
    if (wxApi?.getClipboardData) {
      wxApi.getClipboardData({
        success: (res) => resolve(res?.data ?? ''),
        fail: () => resolve(''),
      });
      return;
    }
    const clip = (globalThis as { navigator?: { clipboard?: { readText?: () => Promise<string> } } }).navigator?.clipboard;
    if (clip?.readText) {
      clip.readText().then((s) => resolve(s ?? '')).catch(() => resolve(''));
      return;
    }
    resolve('');
  });
}

@ccclass('UgcTextPanel')
export class UgcTextPanel extends Component {
  private _built = false;
  private _mode: 'load' | 'export' = 'load';
  private _onLoad: ((text: string) => string | true) | null = null;
  private _box: EditBox | null = null;
  private _draft = '';

  hide(): void {
    this._listenPaste(false);
    this.unschedule(this._restoreCopyLabel);
    this._restoreCopyLabel();
    this.node.active = false;
  }

  showLoad(onLoad: (text: string) => string | true): void {
    this._mode = 'load';
    this._onLoad = onLoad;
    this._open('', '粘贴关卡配置');
  }

  showExport(text: string): void {
    this._mode = 'export';
    this._onLoad = null;
    this._open(text, '当前关卡配置');
  }

  private _open(text: string, placeholder: string): void {
    this._ensureTree();
    this.node.active = true;
    this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);
    this._layout();
    this._paint();
    this._draft = text;
    this._syncView(placeholder);
    const title = this.node.getChildByName('Card')?.getChildByName('Title')?.getComponent(Label);
    if (title) title.string = this._mode === 'load' ? '加载配置' : '分享配置';
    const leftoverSub = this.node.getChildByName('Card')?.getChildByName('Sub');
    leftoverSub?.destroy();
    const ok = this.node.getChildByName('Card')?.getChildByName('OkBtn')?.getChildByName('Label')?.getComponent(Label);
    if (ok) ok.string = this._mode === 'load' ? '导入' : '复制';
    const paste = this.node.getChildByName('Card')?.getChildByName('PasteBtn');
    if (paste) paste.active = this._mode === 'load';
    this._listenPaste(this._mode === 'load');
    this._hint('');
  }

  private _layout(): void {
    const vis = uiVisibleSize();
    this.node.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    const dim = this.node.getChildByName('Dim');
    dim?.getComponent(UITransform)?.setContentSize(vis.w, vis.h);
    const card = this.node.getChildByName('Card');
    card?.getComponent(UITransform)?.setContentSize(CARD_W, CARD_H);
    card?.setPosition(0, 24, 0);
    card?.getChildByName('Frame')?.getComponent(UITransform)?.setContentSize(CARD_W, CARD_H);
    card?.getChildByName('Title')?.setPosition(0, TITLE_Y, 0);
    card?.getChildByName('CloseBtn')?.setPosition(CLOSE_X, CLOSE_Y, 0);
    card?.getChildByName('InputWell')?.setPosition(0, BOX_Y, 0);
    card?.getChildByName('Input')?.setPosition(0, BOX_Y, 0);
    card?.getChildByName('Face')?.setPosition(0, BOX_Y, 0);
    card?.getChildByName('Scroll')?.setPosition(0, BOX_Y, 0);
    card?.getChildByName('Hint')?.setPosition(0, BOX_Y - BOX_H * 0.5 + HINT_H * 0.5 + 16, 0);
    card?.getChildByName('Hint')?.getComponent(UITransform)?.setContentSize(HINT_W, HINT_H);
    const paste = card?.getChildByName('PasteBtn');
    const okBtn = card?.getChildByName('OkBtn');
    if (this._mode === 'load') {
      paste?.setPosition(-197, ACTION_Y, 0);
      okBtn?.setPosition(197, ACTION_Y, 0);
    } else {
      okBtn?.setPosition(0, ACTION_Y, 0);
    }
  }

  private _paint(): void {
    const vis = uiVisibleSize();
    applyArtSpriteSoon(this.node.getChildByName('Dim'), 'settingsDim', vis.w, vis.h);
    const card = this.node.getChildByName('Card');
    applyArtSpriteSoon(card?.getChildByName('Frame') ?? null, 'panelMain', CARD_W, CARD_H);
    const close = card?.getChildByName('CloseBtn');
    close?.getChildByName('Bg')?.destroy();
    close?.getChildByName('Gear')?.destroy();
    applyArtSpriteSoon(close ?? null, 'settingsClose', CLOSE, CLOSE);
    ensureBtnChrome(card?.getChildByName('OkBtn') ?? null, BTN_W, BTN_H, Theme.playFill, Theme.playStroke, 'winDouble');
    ensureBtnChrome(card?.getChildByName('PasteBtn') ?? null, BTN_W, BTN_H, Theme.playFill, Theme.playStroke, 'winAction');
    const toast = card?.getChildByName('Hint');
    this._paintHint(toast?.getChildByName('Face') ?? toast, HINT_W, HINT_H);
    const face = card?.getChildByName('Face');
    if (face) this._paintWell(face, BOX_W, BOX_H);
    const well = card?.getChildByName('InputWell');
    if (well) {
      this._paintWell(well, BOX_W, BOX_H);
      this._noHit(well);
    }
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

    const dim = this._mk('Dim', vis.w, vis.h);
    dim.addComponent(BlockInputEvents);
    const dw = dim.addComponent(Widget);
    dw.isAlignTop = dw.isAlignBottom = dw.isAlignLeft = dw.isAlignRight = true;
    dw.top = dw.bottom = dw.left = dw.right = 0;
    this._bind(dim, () => this.hide());

    const card = this._mk('Card', CARD_W, CARD_H);
    card.addComponent(BlockInputEvents);
    this._mk('Frame', CARD_W, CARD_H, card);
    const title = this._mk('Title', CARD_W - 160, 88, card);
    title.setPosition(0, TITLE_Y, 0);
    const titleLab = this._lab(title, '加载配置', 64, TITLE_INK, CARD_W - 160, 88);
    titleLab.outlineColor = Color.WHITE;
    titleLab.outlineWidth = 4;

    const close = this._mk('CloseBtn', CLOSE, CLOSE, card);
    close.setPosition(CLOSE_X, CLOSE_Y, 0);
    this._bind(close, () => this.hide());

    this._box = this._editBox(card);
    this._scrollBody(card);
    const hint = this._mk('Hint', HINT_W, HINT_H, card);
    hint.setPosition(0, BOX_Y - BOX_H * 0.5 + HINT_H * 0.5 + 16, 0);
    const leftoverLab = hint.getComponent(Label);
    if (leftoverLab) leftoverLab.enabled = false;
    this._mk('Face', HINT_W, HINT_H, hint);
    const hintLab = this._plain(this._mk('Lab', HINT_W - 36, HINT_H - 8, hint), '', 26, HINT_OK, HINT_W - 36, HINT_H - 8);
    hintLab.horizontalAlign = Label.HorizontalAlign.CENTER;
    hintLab.verticalAlign = Label.VerticalAlign.CENTER;
    hintLab.overflow = Label.Overflow.SHRINK;
    hintLab.enableWrapText = false;
    if (!hint.getComponent(UIOpacity)) hint.addComponent(UIOpacity);
    hint.active = false;

    const paste = this._mk('PasteBtn', BTN_W, BTN_H, card);
    paste.setPosition(-197, ACTION_Y, 0);
    const pasteLab = this._lab(this._mk('Label', BTN_W - 24, BTN_H - 20, paste), '粘贴', 44, PLAY_INK, BTN_W - 24, BTN_H - 20);
    pasteLab.outlineColor = PLAY_OUTLINE;
    pasteLab.outlineWidth = 4;
    pasteLab.isBold = true;
    this._bind(paste, () => void this._paste());

    const ok = this._mk('OkBtn', BTN_W, BTN_H, card);
    ok.setPosition(197, ACTION_Y, 0);
    const okLab = this._lab(this._mk('Label', BTN_W - 24, BTN_H - 20, ok), '导入', 44, PLAY_INK, BTN_W - 24, BTN_H - 20);
    okLab.outlineColor = PLAY_OUTLINE;
    okLab.outlineWidth = 4;
    okLab.isBold = true;
    this._bind(ok, () => void this._confirm());
  }

  private async _confirm(): Promise<void> {
    const text = this._draft;
    if (this._mode === 'export') {
      if (!text.trim()) {
        this._hint('当前没有可复制的积木', 'err');
        return;
      }
      const ok = await copyText(text);
      if (ok) this._flashCopy();
      else {
        this._offerSelectCopy();
        this._hint('请长按文本框全选复制', 'err');
      }
      return;
    }
    if (!text.trim()) {
      this._hint('请先粘贴配置', 'err');
      return;
    }
    const result = this._onLoad?.(text);
    if (result === true) {
      this.hide();
      return;
    }
    this._hint(result || '配置无效', 'err');
  }

  private async _paste(): Promise<void> {
    const text = (await readClipboard()).trim();
    if (!text) {
      this._focusBox();
      this._hint('没读到剪贴板，请点输入框后按 Ctrl+V', 'err');
      return;
    }
    this._applyInput(text);
  }

  private _applyInput(text: string): void {
    this._draft = text;
    if (this._box) {
      this._box.string = text;
      if (this._box.textLabel) this._box.textLabel.string = text;
    }
    this._paintBody();
  }

  private _focusBox(): void {
    const box = this._box as (EditBox & { setFocus?: (on?: boolean) => void; focus?: () => void }) | null;
    if (!box) return;
    if (typeof box.setFocus === 'function') box.setFocus(true);
    else box.focus?.();
  }

  private _onDocPaste = (ev: Event): void => {
    if (!this.node.active || this._mode !== 'load') return;
    const text = (ev as ClipboardEvent).clipboardData?.getData('text')?.trim() ?? '';
    if (!text) return;
    ev.preventDefault();
    this._applyInput(text);
  };

  private _listenPaste(on: boolean): void {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) return;
    doc.removeEventListener('paste', this._onDocPaste);
    if (on) doc.addEventListener('paste', this._onDocPaste);
  }

  private _syncView(_placeholder: string): void {
    const card = this.node.getChildByName('Card');
    const input = card?.getChildByName('Input');
    const well = card?.getChildByName('InputWell');
    const scroll = card?.getChildByName('Scroll');
    const face = card?.getChildByName('Face');
    if (input) input.active = false;
    if (well) well.active = false;
    if (scroll) scroll.active = false;
    if (face) face.active = true;
    if (this._box) this._box.string = this._draft;
    this._paintBody();
  }

  private _offerSelectCopy(): void {
    const card = this.node.getChildByName('Card');
    const input = card?.getChildByName('Input');
    const face = card?.getChildByName('Face');
    if (input) input.active = true;
    if (face) face.active = false;
    if (this._box) {
      this._box.string = this._draft;
      if (this._box.textLabel) {
        this._box.textLabel.string = this._draft;
        this._box.textLabel.color = INK;
      }
    }
    const sp = input?.getComponent(Sprite);
    if (sp) sp.color = new Color(255, 248, 238, 255);
    this._focusBox();
  }

  private _compact(text: string): string {
    const raw = text.trim();
    if (!raw) return '（当前没有可分享的积木）';
    try {
      return JSON.stringify(JSON.parse(raw));
    } catch {
      return raw.replace(/\s+/g, ' ');
    }
  }

  private _paintBody(): void {
    const face = this.node.getChildByName('Card')?.getChildByName('Face');
    if (!face) return;
    const w = BOX_W - BOX_PAD * 2;
    const h = BOX_H - BOX_PAD * 2;
    const n = this._mk('Body', w, h, face);
    n.setScale(1, 1, 1);
    n.setPosition(0, 2, 0);
    n.getComponent(UITransform)?.setContentSize(w, h);
    const empty = this._mode === 'load' && !this._draft.trim();
    const lab = n.getComponent(Label) ?? n.addComponent(Label);
    lab.string = empty ? '点下方粘贴' : this._compact(this._draft);
    lab.useSystemFont = true;
    lab.fontFamily = 'PingFang SC';
    lab.fontSize = 24;
    lab.lineHeight = 34;
    lab.isBold = false;
    lab.color = empty ? PLACE : INK;
    lab.enableOutline = false;
    lab.enableShadow = false;
    lab.enableWrapText = true;
    lab.overflow = Label.Overflow.CLAMP;
    lab.horizontalAlign = Label.HorizontalAlign.LEFT;
    lab.verticalAlign = Label.VerticalAlign.TOP;
    lab.cacheMode = Label.CacheMode.NONE;
  }

  private _paintHint(node: Node | null, w: number, h: number): void {
    if (!node) return;
    const sp = node.getComponent(Sprite);
    if (sp) {
      sp.enabled = false;
      sp.spriteFrame = null;
    }
    let g = node.getComponent(Graphics);
    if (!g) g = node.addComponent(Graphics);
    const r = h * 0.5;
    g.clear();
    g.fillColor = new Color(40, 34, 62, 46);
    g.roundRect(-w * 0.5 + 3, -h * 0.5 - 4, w, h, r);
    g.fill();
    g.fillColor = new Color(46, 40, 68, 214);
    g.roundRect(-w * 0.5, -h * 0.5, w, h, r);
    g.fill();
  }

  private _flashCopy(): void {
    this._hint('');
    const lab = this.node.getChildByName('Card')?.getChildByName('OkBtn')?.getChildByName('Label')?.getComponent(Label);
    if (!lab) return;
    this.unschedule(this._restoreCopyLabel);
    lab.string = '已复制';
    this.scheduleOnce(this._restoreCopyLabel, 1.5);
  }

  private _restoreCopyLabel = (): void => {
    const lab = this.node.getChildByName('Card')?.getChildByName('OkBtn')?.getChildByName('Label')?.getComponent(Label);
    if (lab && this._mode === 'export') lab.string = '复制';
  };

  private _paintWell(node: Node, w: number, h: number): void {
    const sp = node.getComponent(Sprite);
    if (sp) sp.enabled = false;
    let g = node.getComponent(Graphics);
    if (!g) g = node.addComponent(Graphics);
    const r = 40;
    g.clear();
    g.fillColor = new Color(80, 56, 130, 32);
    g.roundRect(-w * 0.5 + 6, -h * 0.5 - 8, w, h, r);
    g.fill();
    g.fillColor = new Color(255, 248, 238, 255);
    g.roundRect(-w * 0.5, -h * 0.5, w, h, r);
    g.fill();
    g.fillColor = new Color(255, 255, 255, 170);
    g.roundRect(-w * 0.5 + 18, h * 0.5 - 48, w - 36, 36, 18);
    g.fill();
    g.strokeColor = new Color(186, 168, 226, 255);
    g.lineWidth = 5;
    g.roundRect(-w * 0.5, -h * 0.5, w, h, r);
    g.stroke();
  }

  private _noHit(node: Node): void {
    const ut = node.getComponent(UITransform) as (UITransform & { hitTest?: () => boolean }) | null;
    if (ut) ut.hitTest = () => false;
  }

  private _scrollBody(card: Node): void {
    const face = this._mk('Face', BOX_W, BOX_H, card);
    face.setPosition(0, BOX_Y, 0);
    this._paintWell(face, BOX_W, BOX_H);
    const leftover = card.getChildByName('Scroll');
    if (leftover) leftover.active = false;
  }

  private _hint(text: string, kind: 'ok' | 'err' = 'ok'): void {
    const hint = this.node.getChildByName('Card')?.getChildByName('Hint');
    if (!hint) return;
    Tween.stopAllByTarget(hint);
    const fade = hint.getComponent(UIOpacity) ?? hint.addComponent(UIOpacity);
    Tween.stopAllByTarget(fade);
    if (!text) {
      hint.active = false;
      fade.opacity = 255;
      return;
    }
    const lab = hint.getChildByName('Lab')?.getComponent(Label);
    if (lab) {
      lab.string = text;
      lab.color = kind === 'err' ? HINT_ERR : HINT_OK;
    }
    fade.opacity = 255;
    hint.active = true;
    hint.setScale(0.86, 0.86, 1);
    tween(hint)
      .to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();
    if (kind === 'ok') {
      tween(fade)
        .delay(1.7)
        .to(0.28, { opacity: 0 })
        .call(() => {
          hint.active = false;
          fade.opacity = 255;
        })
        .start();
    }
  }

  private _editBox(card: Node): EditBox {
    const well = this._mk('InputWell', BOX_W, BOX_H, card);
    well.setPosition(0, BOX_Y, 0);
    this._paintWell(well, BOX_W, BOX_H);
    this._noHit(well);

    const n = this._mk('Input', BOX_W, BOX_H, card);
    n.setPosition(0, BOX_Y, 0);
    n.getComponent(Graphics)?.destroy();
    const sp = n.getComponent(Sprite) ?? n.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.spriteFrame = whiteFrame();
    sp.color = new Color(255, 248, 238, 255);
    n.getComponent(UITransform)?.setContentSize(BOX_W, BOX_H);

    const textN = this._mk('TEXT_LABEL', BOX_W - BOX_PAD * 2, BOX_H - BOX_PAD * 2, n);
    const text = this._plain(textN, '', 24, INK, BOX_W - BOX_PAD * 2, BOX_H - BOX_PAD * 2);
    text.overflow = Label.Overflow.CLAMP;

    const phN = this._mk('PLACEHOLDER_LABEL', BOX_W - BOX_PAD * 2, BOX_H - BOX_PAD * 2, n);
    const ph = this._plain(phN, '点这里输入，或点下方粘贴', 24, PLACE, BOX_W - BOX_PAD * 2, BOX_H - BOX_PAD * 2);
    ph.overflow = Label.Overflow.CLAMP;

    const box = n.getComponent(EditBox) ?? n.addComponent(EditBox);
    box.inputMode = EditBox.InputMode.ANY;
    box.returnType = EditBox.KeyboardReturnType.DONE;
    box.maxLength = 200000;
    box.textLabel = text;
    box.placeholderLabel = ph;
    box.backgroundImage = whiteFrame();
    box.placeholder = '点这里输入，或点下方粘贴';
    n.off(EditBox.EventType.TEXT_CHANGED, this._onBoxChanged, this);
    n.on(EditBox.EventType.TEXT_CHANGED, this._onBoxChanged, this);
    return box;
  }

  private _onBoxChanged(): void {
    this._draft = this._box?.string ?? this._draft;
  }

  private _bind(node: Node | null, onTap: () => void): void {
    if (!node) return;
    node.off(Node.EventType.TOUCH_END);
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

  private _plain(node: Node, text: string, size: number, color: Color, w: number, h: number): Label {
    let lab = node.getComponent(Label);
    if (!lab) lab = node.addComponent(Label);
    lab.string = text;
    lab.useSystemFont = true;
    lab.fontFamily = 'PingFang SC';
    lab.fontSize = size;
    lab.lineHeight = size + 10;
    lab.isBold = false;
    lab.color = color;
    lab.enableOutline = false;
    lab.enableShadow = false;
    lab.horizontalAlign = Label.HorizontalAlign.LEFT;
    lab.verticalAlign = Label.VerticalAlign.TOP;
    lab.overflow = Label.Overflow.CLAMP;
    lab.enableWrapText = true;
    lab.cacheMode = Label.CacheMode.NONE;
    node.getComponent(UITransform)?.setContentSize(w, h);
    return lab;
  }
}
