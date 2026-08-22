import {
  _decorator,
  Color,
  Component,
  EventTouch,
  Label,
  Layers,
  Node,
  tween,
  UITransform,
  Vec2,
  Vec3,
} from 'cc';
import { gameAudio } from '../audio/AudioService';
import { uiSafeInsets, uiVisibleSize } from '../game/ViewFit';
import { applyAdIcon, applyArtSpriteSoon } from './UiArt';

const { ccclass } = _decorator;

export const GOLD_HUD = {
  rootW: 300,
  rootH: 96,
  pad: 36,
  gapBelow: 16,
  bgW: 236,
  bgH: 66,
  bgX: 8,
  icon: 86,
  iconX: -108,
  amountW: 132,
  amountH: 66,
  amountX: 8,
  plus: 52,
  plusX: 122,
  plusY: 28,
  fontSize: 36,
};

const AMOUNT_COLOR = new Color(248, 225, 128, 255);
const AMOUNT_SHADOW = new Color(20, 36, 48, 160);

export type CurrencyHudSide = 'left' | 'right';
export type CurrencyHudIcon = 'goldIcon' | 'energyIcon';

export function goldHudTopRight(visW: number, visH: number, safeTop: number, safeRight = 0): { x: number; y: number } {
  return goldHudPose('right', visW, visH, safeTop, 0, safeRight);
}

export function goldHudTopLeft(visW: number, visH: number, safeTop: number, safeLeft = 0): { x: number; y: number } {
  return goldHudPose('left', visW, visH, safeTop, safeLeft, 0);
}

export function goldHudPose(
  side: CurrencyHudSide,
  visW: number,
  visH: number,
  safeTop: number,
  safeLeft = 0,
  safeRight = 0,
): { x: number; y: number } {
  const y = visH * 0.5 - GOLD_HUD.rootH * 0.5 - safeTop - GOLD_HUD.pad;
  if (side === 'left') {
    return { x: -visW * 0.5 + GOLD_HUD.rootW * 0.5 + GOLD_HUD.pad + safeLeft, y };
  }
  return { x: visW * 0.5 - GOLD_HUD.rootW * 0.5 - GOLD_HUD.pad - safeRight, y };
}

@ccclass('GoldHud')
export class GoldHud extends Component {
  private _built = false;
  private _value = 0;
  private _amount: Label | null = null;
  private _icon: Node | null = null;
  private _onPlus: (() => void) | null = null;
  private _pulseAt = 0;
  private _side: CurrencyHudSide = 'right';
  private _iconKey: CurrencyHudIcon = 'goldIcon';

  setup(opts?: {
    onPlus?: () => void;
    side?: CurrencyHudSide;
    icon?: CurrencyHudIcon;
  }): void {
    this._onPlus = opts?.onPlus ?? null;
    this._side = opts?.side ?? 'right';
    this._iconKey = opts?.icon ?? 'goldIcon';
    this._ensureTree();
    this.layoutChrome();
    this.applyArt();
  }

  applyArt(): void {
    this._ensureTree();
    applyArtSpriteSoon(this.node.getChildByName('Bg'), 'goldBg', GOLD_HUD.bgW, GOLD_HUD.bgH, true);
    applyArtSpriteSoon(this.node.getChildByName('Icon'), this._iconKey, GOLD_HUD.icon, GOLD_HUD.icon);
    this._paintAdPlus();
  }

  setCoins(coins: number, animate = false): void {
    this.setValue(coins, animate);
  }

  setValue(n: number, animate = false): void {
    this._ensureTree();
    const next = Math.max(0, Math.floor(n));
    const gained = next > this._value;
    this._value = next;
    if (this._amount) this._amount.string = String(this._value);
    if (animate && gained) {
      const now = Date.now();
      if (now - this._pulseAt > 90) {
        this._pulseAt = now;
        this._pulse();
      }
    }
  }

  iconWorldPos(out: Vec3): Vec3 {
    if (this._icon?.isValid) {
      this._icon.getWorldPosition(out);
      return out;
    }
    this.node.getWorldPosition(out);
    return out;
  }

  adWorldPos(out: Vec3): Vec3 {
    const plus = this.node.getChildByName('Plus');
    if (plus?.isValid) {
      plus.getWorldPosition(out);
      return out;
    }
    return this.iconWorldPos(out);
  }

  deny(): void {
    const icon = this._icon;
    if (!icon?.isValid) return;
    tween(icon)
      .stop()
      .to(0.05, { position: new Vec3(GOLD_HUD.iconX - 8, 0, 0) })
      .to(0.05, { position: new Vec3(GOLD_HUD.iconX + 8, 0, 0) })
      .to(0.05, { position: new Vec3(GOLD_HUD.iconX, 0, 0) })
      .start();
  }

  layoutChrome(): void {
    this._ensureTree();
    const vis = uiVisibleSize();
    const safe = uiSafeInsets();
    const pose = goldHudPose(this._side, vis.w, vis.h, safe.top, safe.left, safe.right);
    this.node.setPosition(pose.x, pose.y, 0);
  }

  private _ensureTree(): void {
    if (this._built) return;
    this._built = true;
    this.node.layer = Layers.Enum.UI_2D;
    let ut = this.node.getComponent(UITransform);
    if (!ut) ut = this.node.addComponent(UITransform);
    ut.setContentSize(GOLD_HUD.rootW, GOLD_HUD.rootH);

    this._mk('Bg', GOLD_HUD.bgW, GOLD_HUD.bgH);
    this._icon = this._mk('Icon', GOLD_HUD.icon, GOLD_HUD.icon);
    this._plusBtn();
    const amountN = this._mk('Amount', GOLD_HUD.amountW, GOLD_HUD.amountH);
    this._amount = amountN.addComponent(Label);
    this._amount.string = '0';
    this._amount.fontSize = GOLD_HUD.fontSize;
    this._amount.lineHeight = GOLD_HUD.fontSize;
    this._amount.isBold = true;
    this._amount.color = AMOUNT_COLOR;
    this._amount.enableOutline = true;
    this._amount.outlineWidth = 1;
    this._amount.outlineColor = AMOUNT_COLOR;
    this._amount.enableShadow = true;
    this._amount.shadowColor = AMOUNT_SHADOW;
    this._amount.shadowOffset = new Vec2(0, -1);
    this._amount.enableWrapText = false;
    this._amount.horizontalAlign = Label.HorizontalAlign.CENTER;
    this._amount.verticalAlign = Label.VerticalAlign.CENTER;
    this._amount.overflow = Label.Overflow.NONE;
    this._amount.useSystemFont = true;
    this._amount.fontFamily = 'PingFang SC';
    this._amount.cacheMode = Label.CacheMode.CHAR;
    this._amount.string = '0123456789';
    this._amount.updateRenderData?.(true);
    this._amount.string = '0';
    this._placeParts();
  }

  private _placeParts(): void {
    this.node.getChildByName('Bg')?.setPosition(GOLD_HUD.bgX, 0, 0);
    this._icon?.setPosition(GOLD_HUD.iconX, 0, 0);
    this.node.getChildByName('Amount')?.setPosition(GOLD_HUD.amountX, -2, 0);
    const plus = this.node.getChildByName('Plus');
    plus?.setPosition(GOLD_HUD.plusX, GOLD_HUD.plusY, 0);
    plus?.setSiblingIndex(this.node.children.length - 1);
  }

  private _plusBtn(): Node {
    const n = this._mk('Plus', GOLD_HUD.plus, GOLD_HUD.plus);
    n.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
      e.propagationStopped = true;
    }, this);
    n.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
      gameAudio()?.playUiClick();
      this._onPlus?.();
    }, this);
    return n;
  }

  private _paintAdPlus(): void {
    const plus = this.node.getChildByName('Plus');
    if (!plus) return;
    const face = plus.getChildByName('Face');
    if (face) face.active = false;
    const lab = plus.getChildByName('Lab');
    if (lab) lab.active = false;
    applyAdIcon(plus, GOLD_HUD.plus);
    tween(plus).stop();
    plus.setScale(1, 1, 1);
    this._placeParts();
  }

  private _mk(name: string, w: number, h: number, parent: Node = this.node): Node {
    const n = new Node(name);
    parent.addChild(n);
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform).setContentSize(w, h);
    return n;
  }

  private _pulse(): void {
    if (!this._icon?.isValid) return;
    tween(this._icon)
      .stop()
      .to(0.08, { scale: new Vec3(1.25, 1.25, 1) })
      .to(0.12, { scale: new Vec3(1, 1, 1) })
      .start();
  }
}
