import { Rect, screen, sys, view } from 'cc';
import { GAME, type PlayViewBand } from './GameConfig';
import { portraitCameraRect, portraitVisibleSize } from './PortraitFit';

declare const wx: undefined | {
  getMenuButtonBoundingClientRect?: () => {
    bottom: number;
    height: number;
  };
  getSystemInfoSync?: () => {
    windowHeight?: number;
  };
};

/** WeChat capsule → UI design-space top inset. Sit below it; do not also shove chrome left. */
function wxMenuTop(uiH: number): number {
  try {
    const menu = wx?.getMenuButtonBoundingClientRect?.();
    const info = wx?.getSystemInfoSync?.();
    const wh = info?.windowHeight || 0;
    if (!menu || menu.height <= 0 || wh <= 0) return uiH * 0.12;
    return (menu.bottom / wh) * uiH + 40;
  } catch {
    return uiH * 0.12;
  }
}

export function windowAspect(): number {
  try {
    const vis = portraitVisibleSize();
    if (vis.width > 1 && vis.height > 1) return vis.width / vis.height;
  } catch {
    // fall through
  }
  const win = screen.windowSize;
  return win.height > 0 ? win.width / win.height : GAME.designWidth / GAME.designHeight;
}

export function designAspectViewRect(out = new Rect()): Rect {
  const r = portraitCameraRect();
  out.set(r.x, r.y, r.width, r.height);
  return out;
}

export function uiOrthoHeight(): number {
  return uiVisibleSize().h * 0.5;
}

export function uiVisibleSize(): { w: number; h: number } {
  try {
    const vis = portraitVisibleSize();
    if (vis.width > 1 && vis.height > 1) {
      return { w: vis.width, h: vis.height };
    }
  } catch {
    // fall through
  }
  return { w: GAME.designWidth, h: GAME.designHeight };
}

export function uiFitScale(): number {
  const { w, h } = uiVisibleSize();
  const safe = uiSafeInsetsRaw(w, h);
  const usableW = Math.max(1, w - safe.left - safe.right);
  const usableH = Math.max(1, h - safe.top - safe.bottom);
  const sx = usableW / GAME.designWidth;
  const sy = usableH / GAME.designHeight;
  return Math.min(1, Math.max(0.35, Math.min(sx, sy)));
}

function uiSafeInsetsRaw(
  uiW: number,
  uiH: number,
): { top: number; bottom: number; left: number; right: number } {
  const win = screen.windowSize;
  let safe: Rect;
  try {
    safe = view.getSafeAreaRect();
  } catch {
    safe = new Rect(0, 0, win.width, win.height);
  }
  if (!safe || safe.width <= 1 || safe.height <= 1) {
    safe = new Rect(0, 0, win.width, win.height);
  }
  const topPx = Math.max(0, win.height - (safe.y + safe.height));
  const bottomPx = Math.max(0, safe.y);
  const leftPx = Math.max(0, safe.x);
  const rightPx = Math.max(0, win.width - (safe.x + safe.width));
  let top = win.height > 0 ? (topPx / win.height) * uiH : 0;
  let bottom = win.height > 0 ? (bottomPx / win.height) * uiH : 0;
  let left = win.width > 0 ? (leftPx / win.width) * uiW : 0;
  let right = win.width > 0 ? (rightPx / win.width) * uiW : 0;
  if (sys.platform === sys.Platform.WECHAT_GAME) {
    top = Math.max(top, wxMenuTop(uiH));
    bottom = Math.max(bottom, uiH * 0.02);
  } else {
    top = Math.max(top, 48);
    bottom = Math.max(bottom, 20);
  }
  return { top, bottom, left, right };
}

export function su(n: number): number {
  return n * uiFitScale();
}

export function uiSafeInsets(): { top: number; bottom: number; left: number; right: number } {
  const { w, h } = uiVisibleSize();
  return uiSafeInsetsRaw(w, h);
}

/** Play HUD item tray — keep turret dock flush to this bar on every aspect. */
export const PLAY_ITEM_BAR = {
  trayH: 220,
  lift: 16,
  /** Design-space air between tray top and the lowest turret/bench pixels. */
  stageGap: 18,
} as const;

export function itemTrayTopFromBottom(viewH?: number, safeBottom?: number): number {
  const h = viewH ?? uiVisibleSize().h;
  const safe = safeBottom ?? uiSafeInsetsRaw(uiVisibleSize().w, h).bottom;
  return safe + PLAY_ITEM_BAR.lift + PLAY_ITEM_BAR.trayH;
}

/** Camera-view fraction (0 = bottom) where the turret dock should sit. */
export function playDockPinFrac(viewH?: number, safeBottom?: number): number {
  const h = Math.max(1, viewH ?? uiVisibleSize().h);
  return (itemTrayTopFromBottom(viewH, safeBottom) + PLAY_ITEM_BAR.stageGap) / h;
}

/** Camera-view fraction of the top of the sculpture field (below HUD / notch). */
export function playModelCeilFrac(viewH?: number, safeTop?: number): number {
  const vis = uiVisibleSize();
  const h = Math.max(1, viewH ?? vis.h);
  const top = safeTop ?? uiSafeInsetsRaw(vis.w, h).top;
  return 1 - (top + 64) / h;
}

/**
 * Design-space lift so the UGC dock sits just above the 试玩 button
 * (home 开始游戏 art at 0.62, plus the 6px air in UgcHud).
 */
export const UGC_PLAY_BTN_LIFT = 145 * 0.62 + 6;

export function playViewBand(viewH?: number, pinExtra = 0): PlayViewBand {
  const vis = uiVisibleSize();
  const h = viewH ?? vis.h;
  const safe = uiSafeInsetsRaw(vis.w, h);
  return {
    pinFrac: playDockPinFrac(h, safe.bottom) + pinExtra / h,
    ceilFrac: playModelCeilFrac(h, safe.top),
  };
}

/** Same space as `Camera.worldToScreen` / `EventTouch.getLocation()`. */
export function uiFromBottomToScreenY(uiFromBottom: number, viewH?: number): number {
  const h = Math.max(1, viewH ?? uiVisibleSize().h);
  const vp = view.getViewportRect();
  return vp.y + (uiFromBottom / h) * vp.height;
}

export function screenYToUiFromBottom(screenY: number, viewH?: number): number {
  const h = Math.max(1, viewH ?? uiVisibleSize().h);
  const vp = view.getViewportRect();
  if (vp.height <= 0) return 0;
  return ((screenY - vp.y) / vp.height) * h;
}
