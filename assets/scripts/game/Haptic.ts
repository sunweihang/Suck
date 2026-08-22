/**
 * Phone haptic. WeChat is the ship path; navigator.vibrate covers browser preview.
 */

import { sys } from 'cc';

type Vibe = 'heavy' | 'medium' | 'light';

declare const wx: undefined | {
  vibrateShort?: (opts?: { type?: Vibe }) => void;
};

const COOLDOWN_MS = 90;
const WEB_MS: Record<Vibe, number> = { light: 15, medium: 28, heavy: 42 };
const STORAGE_KEY = 'suck.haptic';

let _nextAt = 0;
let _enabled = loadEnabled();

function loadEnabled(): boolean {
  try {
    const raw = sys.localStorage.getItem(STORAGE_KEY);
    if (raw === '0') return false;
    if (raw === '1') return true;
  } catch {
    /* private mode */
  }
  return true;
}

export function isHapticEnabled(): boolean {
  return _enabled;
}

export function setHapticEnabled(on: boolean): void {
  _enabled = !!on;
  try {
    sys.localStorage.setItem(STORAGE_KEY, _enabled ? '1' : '0');
  } catch {
    /* ignore quota / private mode */
  }
}

export function vibrateShort(type: Vibe = 'medium'): void {
  if (!_enabled) return;
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
