/**
 * WeChat rewarded video. Grants only when the platform reports isEnded.
 * Desktop / missing wx: stub reward so local preview can exercise the flow.
 */

import { gameAudio } from '../audio/AudioService';

type WxRewardedVideoAd = {
  show: () => Promise<void>;
  load: () => Promise<void>;
  onClose?: (cb: (res: { isEnded?: boolean }) => void) => void;
  offClose?: (cb: (res: { isEnded?: boolean }) => void) => void;
  onError?: (cb: (err: unknown) => void) => void;
};

type WxMinigame = {
  createRewardedVideoAd?: (opts: { adUnitId: string }) => WxRewardedVideoAd;
};

export type RewardedAdResult = 'rewarded' | 'skipped' | 'failed';

/** Replace with the WeChat 流量主 unit before shipping. */
const AD_UNIT_ID = 'adunit-suck-reward-pending';

let _videoAd: WxRewardedVideoAd | null = null;
let _errorHooked = false;

function getWx(): WxMinigame | null {
  const g = globalThis as typeof globalThis & {
    wx?: WxMinigame;
    GameGlobal?: { wx?: WxMinigame };
  };
  return g.wx ?? g.GameGlobal?.wx ?? null;
}

function ensureVideoAd(): WxRewardedVideoAd | null {
  if (_videoAd) return _videoAd;
  const wx = getWx();
  if (!wx?.createRewardedVideoAd) return null;
  try {
    _videoAd = wx.createRewardedVideoAd({ adUnitId: AD_UNIT_ID });
  } catch (err) {
    console.error('[RewardedAd] create failed', err);
    return null;
  }
  if (_videoAd && !_errorHooked) {
    _errorHooked = true;
    _videoAd.onError?.((err) => {
      console.error('[RewardedAd] onError', err);
    });
  }
  return _videoAd;
}

export function initRewardedAd(): void {
  ensureVideoAd();
}

function beginAdSession(): void {
  gameAudio()?.pauseForAd();
}

function endAdSession(): void {
  gameAudio()?.resumeAfterAd();
}

export function showRewardedVideoAd(): Promise<RewardedAdResult> {
  const videoAd = ensureVideoAd();
  if (!videoAd) {
    console.warn('[RewardedAd] wx unavailable — stub reward (local preview)');
    return Promise.resolve('rewarded');
  }

  beginAdSession();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: RewardedAdResult) => {
      if (settled) return;
      settled = true;
      videoAd.offClose?.(onClose);
      endAdSession();
      resolve(result);
    };

    const onClose = (res: { isEnded?: boolean }) => {
      finish(res?.isEnded === true ? 'rewarded' : 'skipped');
    };

    videoAd.onClose?.(onClose);

    videoAd
      .show()
      .catch(() =>
        videoAd
          .load()
          .then(() => videoAd.show())
          .catch((err) => {
            console.error('激励视频 广告显示失败', err);
            finish('failed');
          }),
      );
  });
}
