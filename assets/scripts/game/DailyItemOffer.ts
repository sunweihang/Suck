import { sys } from 'cc';
import type { ItemId } from './LevelCatalog';

const KEY = 'suck.daily-item.v1';

export const DAILY_ITEM_REWARDS: readonly ItemId[] = ['hook', 'shuffle'];

type Save = {
  claimed?: string;
  shown?: string;
};

function read(): Save {
  try {
    const raw = sys.localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Save;
  } catch {
    return {};
  }
}

function write(data: Save): void {
  try {
    sys.localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('[DailyItemOffer] save failed', e);
  }
}

export function localDateKey(now = Date.now()): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isToday(value: string | undefined, today = localDateKey()): boolean {
  return !!value && value === today;
}

export function isDailyItemClaimedToday(): boolean {
  return isToday(read().claimed);
}

export function hasShownDailyPlayToday(): boolean {
  return isToday(read().shown);
}

export function markDailyPlayShown(): void {
  const today = localDateKey();
  write({ ...read(), shown: today });
}

export function markDailyItemClaimed(): void {
  const today = localDateKey();
  write({ ...read(), claimed: today, shown: today });
}

export function resetDailyItemOffer(): void {
  write({});
}
