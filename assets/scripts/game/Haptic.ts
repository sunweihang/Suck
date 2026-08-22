/**
 * Phone haptic. WeChat is the ship path; navigator.vibrate covers browser preview.
 */

type Vibe = 'heavy' | 'medium' | 'light';

declare const wx: undefined | {
  vibrateShort?: (opts?: { type?: Vibe }) => void;
};

const COOLDOWN_MS = 90;
const WEB_MS: Record<Vibe, number> = { light: 15, medium: 28, heavy: 42 };

let _nextAt = 0;

export function vibrateShort(type: Vibe = 'medium'): void {
  const now = Date.now();
  if (now < _nextAt) return;
  _nextAt = now + COOLDOWN_MS;
  try {
    if (typeof wx !== 'undefined' && wx.vibrateShort) {
      wx.vibrateShort({ type });
      return;
    }
  } catch {
    /* unsupported / rate-limited */
  }
  try {
    const nav = (globalThis as { navigator?: { vibrate?: (ms: number) => boolean } }).navigator;
    nav?.vibrate?.(WEB_MS[type]);
  } catch {
    /* desktop without vibration */
  }
}
