import { sys } from 'cc';

export const CHEST_EVERY = 5;

const KEY = 'suck.chest-cycle.v1';

type Save = {
  pending?: number;
  granted?: number;
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
    console.warn('[ChestProgress] save failed', e);
  }
}

export function chestStepOf(cleared: number): number {
  const n = Math.max(1, cleared | 0);
  return ((n - 1) % CHEST_EVERY) + 1;
}

export function chestPercentOf(cleared: number): number {
  return Math.round((chestStepOf(cleared) / CHEST_EVERY) * 100);
}

export function chestReadyOf(cleared: number): boolean {
  return chestStepOf(cleared) === CHEST_EVERY;
}

export function markChestPending(cleared: number): void {
  if (!chestReadyOf(cleared)) return;
  const data = read();
  if ((data.granted ?? 0) >= cleared) return;
  if ((data.pending ?? 0) >= cleared) return;
  write({ ...data, pending: cleared });
}

export function peekPendingChest(): number {
  return Math.max(0, read().pending | 0);
}

export function consumePendingChest(): number {
  const data = read();
  const n = Math.max(0, data.pending | 0);
  if (n <= 0) return 0;
  write({ pending: 0, granted: Math.max(data.granted | 0, n) });
  return n;
}

export function resetChestProgress(): void {
  write({});
}
