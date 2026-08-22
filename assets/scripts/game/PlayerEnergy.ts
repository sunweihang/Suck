import { sys } from 'cc';
import { localDateKey } from './DailyItemOffer';

const STORAGE_KEY = 'suck.energy.v1';

export const ENERGY = {
  max: 99,
  daily: 30,
  start: 30,
  cost: 1,
  ad: 5,
} as const;

export function energyAdReward(): number {
  return ENERGY.ad;
}

type EnergySave = {
  value?: number;
  day?: string;
};

export class PlayerEnergy {
  private _value = ENERGY.start;
  private _day = '';
  private _onChange: ((n: number, animate: boolean) => void) | null = null;

  load(): void {
    try {
      const raw = sys.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this._value = ENERGY.daily;
        this._day = localDateKey();
        this.save();
        return;
      }
      const data = JSON.parse(raw) as EnergySave;
      this._day = typeof data?.day === 'string' ? data.day : '';
      this._value = this._clamp(Number(data?.value));
      this.refreshDay();
    } catch {
      this._value = ENERGY.daily;
      this._day = localDateKey();
    }
  }

  save(): void {
    try {
      sys.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        value: this._value,
        day: this._day || localDateKey(),
      }));
    } catch (e) {
      console.warn('[PlayerEnergy] save failed', e);
    }
  }

  refreshDay(): void {
    const today = localDateKey();
    if (this._day === today) return;
    this._day = today;
    this._value = ENERGY.daily;
    this.save();
    this._onChange?.(this._value, false);
  }

  reset(): void {
    this._value = ENERGY.daily;
    this._day = localDateKey();
    this.save();
    this._onChange?.(this._value, false);
  }

  get value(): number {
    this.refreshDay();
    return this._value;
  }

  get max(): number {
    return ENERGY.max;
  }

  get full(): boolean {
    this.refreshDay();
    return this._value >= ENERGY.max;
  }

  watch(fn: ((n: number, animate: boolean) => void) | null): void {
    this._onChange = fn;
  }

  add(n: number, animate = true): number {
    this.refreshDay();
    const gain = Math.max(0, Math.floor(n));
    if (gain <= 0) return this._value;
    const next = this._clamp(this._value + gain);
    if (next === this._value) return this._value;
    this._value = next;
    this.save();
    this._onChange?.(this._value, animate);
    return this._value;
  }

  spend(n: number): boolean {
    this.refreshDay();
    const cost = Math.max(0, Math.floor(n));
    if (cost <= 0) return true;
    if (this._value < cost) return false;
    this._value -= cost;
    this.save();
    this._onChange?.(this._value, false);
    return true;
  }

  private _clamp(n: number): number {
    if (!Number.isFinite(n)) return ENERGY.daily;
    return Math.max(0, Math.min(ENERGY.max, Math.floor(n)));
  }
}
