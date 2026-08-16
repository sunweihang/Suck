/**
 * 微信右上角分享：转发好友 / 朋友圈。
 * 对齐 Unravel WxShareService — showShareMenu + onShareAppMessage / onShareTimeline。
 * 设置面板「分享」走 shareToFriend()（用户点击触发）。
 */

declare const wx: undefined | {
  showShareMenu?: (opts: {
    withShareTicket?: boolean;
    menus?: string[];
  }) => void;
  onShareAppMessage?: (cb: () => WxSharePayload) => void;
  onShareTimeline?: (cb: () => WxSharePayload) => void;
  shareAppMessage?: (payload: WxSharePayload) => void;
  showToast?: (opts: { title: string; icon?: string }) => void;
};

type WxSharePayload = {
  title?: string;
  imageUrl?: string;
  query?: string;
};

const SHARE_TITLE = '章鱼拆墙：同色合成闯关';
/** Packaged with the WeChat main package (build-templates/wechatgame). */
const SHARE_IMAGE = 'splash_screen.jpg';

let _ready = false;
let _getQuery: (() => string) | null = null;

function sharePayload(): WxSharePayload {
  return {
    title: SHARE_TITLE,
    imageUrl: SHARE_IMAGE,
    query: typeof _getQuery === 'function' ? _getQuery() || '' : '',
  };
}

/**
 * Eager init (call once at boot on WeChat). Safe to call multiple times.
 */
export function initWxShare(getQuery?: () => string): void {
  if (typeof getQuery === 'function') _getQuery = getQuery;
  if (_ready) return;
  if (typeof wx === 'undefined') return;

  try {
    wx.showShareMenu?.({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    });
  } catch (err) {
    console.warn('[WxShare] showShareMenu failed', err);
  }

  try {
    wx.onShareAppMessage?.(sharePayload);
  } catch (err) {
    console.warn('[WxShare] onShareAppMessage failed', err);
  }

  try {
    wx.onShareTimeline?.(sharePayload);
  } catch (err) {
    console.warn('[WxShare] onShareTimeline failed', err);
  }

  _ready = true;
}

/** 设置里「分享」按钮：主动拉起转发（须由用户点击触发）。 */
export function shareToFriend(): void {
  if (typeof wx === 'undefined') return;
  initWxShare();
  try {
    if (typeof wx.shareAppMessage === 'function') {
      wx.shareAppMessage(sharePayload());
      return;
    }
  } catch (err) {
    console.warn('[WxShare] shareAppMessage failed', err);
  }
  try {
    wx.showToast?.({ title: '请点右上角 ··· 转发', icon: 'none' });
  } catch {
    /* ignore */
  }
}
