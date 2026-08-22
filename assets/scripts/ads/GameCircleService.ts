/**
 * 游戏圈入口 — 对齐 Unravel / mg/gameClub.js：
 * 官方路径 createPageManager + openlink；无 PageManager 时回退 createGameClubButton。
 * 入口在对局 HUD / 设置面板「游戏圈」按钮，调用 openGameCircle()。
 */

import { screen } from 'cc';

declare const wx: undefined | {
  createPageManager?: () => WxPageManager;
  createGameClubButton?: (opts: {
    icon?: string;
    style: WxGameClubStyle;
  }) => WxGameClubButton;
  showToast?: (opts: { title: string; icon?: string }) => void;
  getMenuButtonBoundingClientRect?: () => {
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
    height: number;
  };
  getSystemInfoSync?: () => {
    statusBarHeight?: number;
    windowWidth?: number;
    windowHeight?: number;
  };
};

type WxPageManager = {
  load: (opts: { openlink: string }) => Promise<unknown>;
  show: (opts?: { openlink?: string }) => Promise<unknown>;
};

type WxGameClubStyle = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type WxGameClubButton = {
  show: () => void;
  hide: () => void;
  destroy: () => void;
  style?: WxGameClubStyle;
};

/** MP「游戏圈 → 基础设置 → 游戏内打开」 */
export const GAME_CLUB_OPENLINK =
  '-SSEykJvFV3pORt5kTNpSxCpARkRRtJwuDyEBoBDmrxB126pgtQtpuFaNMgz1_9d6gCMHA2DZvxL5cG9zJK6JDsV4N8wDVXGVVuBMnKED3Yql-NHWKkLiqK0d9Kc06F3h2GAlUvCP_qBHo8R9-RFo7Rb5s2QuF8bFfR7RwgOiYHv8fjdvyHiSAIceFp8BunPCTmSmNP-rwC2TECFZ0Q2y7KsTuwNDAZOt91EPRtgZuwNgVJo0rfGcdcTgNBOwkWR9wmzfNHQEZSuI0bbcNs48mqVawID_QoOoqb5zucc82eyyeC3-QzWyJo-0jrTVkM6abDMsj_CYUxc8T67S_JvwQ';

/** MP「游戏内推荐」— 可选，通关等高光时刻再 showRecommend() */
export const RECOMMEND_OPENLINK =
  'FM09lLkjIQxM0OlIgsWiuGIdFe7FV0HoNKXS8V9PYRGivHdcb1Vgy-VLnIkz2UYLp9WmYwmubGdCnPq5j39j09gvKG1Qw311wHmqbqTnYOdA3X7x6t9WlqWHILzK1HI8JWFWcDlZRsGP3cVgmxQz0evuzDYtVzeV_sLj3MY9kkAvHlbfBhAirzdhAX8VbQgGtYx1AMODM328lstxsiayE7aXYrBId7dtCoWm8bxsWA92k8keVUcPzKXhK6Kskk3QHk1Zf1WWqaz1aV3r4049PhanrqdP5t88BPZJcInyWnTXRkO7E8kTv3hMz-BmVsyxJvY2PPtOqhQ8keov5FWld2eXCEedn3TVS-81OVUlsyo5g6_mOhC0W4gvQhZ5VT3yk0V4phW-4V4ukW1dGFcGw';

const BTN_SIZE = 40;

let _fallbackButton: WxGameClubButton | null = null;
let _opening = false;
let _recommendPm: WxPageManager | null = null;
let _recommendReady = false;
let _recommendShownThisSession = false;

function wxOk(): boolean {
  return typeof wx !== 'undefined';
}

function hasPageManager(): boolean {
  return wxOk() && typeof wx?.createPageManager === 'function';
}

/** 回退绿按钮布局（屏幕像素，避开微信胶囊） */
function gameClubScreenLayout(): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const win = screen.windowSize;
  const W = win.width || wx?.getSystemInfoSync?.()?.windowWidth || 375;
  const size = BTN_SIZE;
  let x = W - size - 88;
  let y = 96;

  try {
    const menu = wx?.getMenuButtonBoundingClientRect?.();
    if (menu && menu.width > 0) {
      y = menu.top + (menu.height - size) * 0.5;
      x = Math.max(12, menu.left - size - 12);
    }
  } catch {
    /* keep defaults */
  }

  return { x, y, w: size, h: size };
}

function destroyFallback(): void {
  if (!_fallbackButton) return;
  try {
    _fallbackButton.destroy?.();
  } catch {
    /* ignore */
  }
  _fallbackButton = null;
}

function setupFallbackButton(): void {
  if (!wxOk() || !wx?.createGameClubButton) return;
  destroyFallback();
  try {
    const s = gameClubScreenLayout();
    _fallbackButton = wx.createGameClubButton({
      icon: 'green',
      style: {
        left: s.x,
        top: s.y,
        width: s.w,
        height: s.h,
      },
    });
    _fallbackButton?.show?.();
  } catch (err) {
    console.warn('[GameCircle] fallback create failed', err);
    _fallbackButton = null;
  }
}

/** Boot：清掉残留原生按钮；正式入口在设置里点开。 */
export function initGameCircle(): void {
  if (!wxOk()) return;
  destroyFallback();
}

/** 官方路径：createPageManager + 游戏内打开 openlink。 */
export function openGameCircle(): void {
  if (!wxOk()) return;
  if (_opening) return;

  if (hasPageManager()) {
    _opening = true;
    try {
      const pm = wx!.createPageManager!();
      pm.load({ openlink: GAME_CLUB_OPENLINK })
        .then(() => pm.show())
        .catch((err) => {
          console.warn('[GameCircle] PageManager open failed', err);
          try {
            wx?.showToast?.({ title: '游戏圈打开失败', icon: 'none' });
          } catch {
            /* ignore */
          }
        })
        .finally(() => {
          _opening = false;
        });
      return;
    } catch (err) {
      _opening = false;
      console.warn('[GameCircle] PageManager error', err);
    }
  }

  setupFallbackButton();
  try {
    wx?.showToast?.({ title: '请点击绿色游戏圈按钮', icon: 'none' });
  } catch {
    /* ignore */
  }
}

export function showGameClubButton(): void {
  try {
    _fallbackButton?.show?.();
  } catch {
    /* ignore */
  }
}

export function hideGameClubButton(): void {
  try {
    _fallbackButton?.hide?.();
  } catch {
    /* ignore */
  }
}

export function destroyGameClubButton(): void {
  destroyFallback();
}

/** 仅回退按钮需要跟屏 */
export function relayoutGameClubButton(): void {
  if (!_fallbackButton) return;
  try {
    const s = gameClubScreenLayout();
    const style = _fallbackButton.style;
    if (style) {
      style.left = s.x;
      style.top = s.y;
      style.width = s.w;
      style.height = s.h;
      return;
    }
  } catch {
    /* recreate below */
  }
  setupFallbackButton();
}

export async function showRecommend(opts?: { force?: boolean }): Promise<void> {
  if (!opts?.force && _recommendShownThisSession) return;
  if (!hasPageManager()) return;
  try {
    if (!_recommendReady || !_recommendPm) {
      _recommendPm = wx!.createPageManager!();
      await _recommendPm.load({ openlink: RECOMMEND_OPENLINK });
      _recommendReady = true;
    }
    await _recommendPm.show();
    _recommendShownThisSession = true;
  } catch (err) {
    console.warn('[GameCircle] recommend show failed', err);
    _recommendPm = null;
    _recommendReady = false;
  }
}
