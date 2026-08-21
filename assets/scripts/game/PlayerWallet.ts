import { sys } from 'cc';
import type { ItemId } from './LevelCatalog';
import { notifyPlayerDirty } from '../net/PlayerCloud';

const STORAGE_KEY = 'suck.wallet.v1';

export const GOLD = {
  start: 200,
  win: 25,
  fail: 10,
  ad: 50,
  slot: 600,
  item: {
    shuffle: 20,
    hook: 40,
    shovel: 40,
    bomb: 30,
  } as Record<ItemId, number>,
};

export function itemGoldCost(id: ItemId): number {
  return GOLD.item[id];
}

export function slotGoldCost(): number {
  return GOLD.slot;
}

export function goldAdReward(): number {
  return GOLD.ad;
}

const EMPTY_ITEMS: Record<ItemId, number> = {
  shuffle: 0,
  hook: 0,
  shovel: 0,
  bomb: 0,
};

export class PlayerWallet {
  private _coins = GOLD.start;
  private _items: Record<ItemId, number> = { ...EMPTY_ITEMS };
  private _onChange: ((coins: number, animate: boolean) => void) | null = null;

  load(): void {
    try {
      const raw = sys.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this._coins = GOLD.start;
        this._items = { ...EMPTY_ITEMS };
        this.save();
        return;
      }
      const data = JSON.parse(raw) as { coins?: number; items?: Partial<Record<ItemId, number>> };
      this._coins = Math.max(0, Math.floor(Number(data?.coins) || 0));
      this._items = { ...EMPTY_ITEMS };
      for (const id of Object.keys(EMPTY_ITEMS) as ItemId[]) {
        this._items[id] = Math.max(0, Math.floor(Number(data?.items?.[id]) || 0));
      }
      const legacy = Math.max(0, Math.floor(Number((data?.items as { merge?: number } | undefined)?.merge) || 0));
      if (legacy > 0 && this._items.bomb <= 0) this._items.bomb = legacy;
    } catch {
      this._coins = GOLD.start;
      this._items = { ...EMPTY_ITEMS };
    }
  }

  get items(): Record<ItemId, number> {
    return { ...this._items };
  }

  applyCloud(coins: number, items: Partial<Record<ItemId, number>>): void {
    this._coins = Math.max(0, Math.floor(Number(coins) || 0));
    this._items = { ...EMPTY_ITEMS };
    for (const id of Object.keys(EMPTY_ITEMS) as ItemId[]) {
      this._items[id] = Math.max(0, Math.floor(Number(items?.[id]) || 0));
    }
    this.save();
    this._onChange?.(this._coins, false);
  }

  save(): void {
    try {
      sys.localStorage.setItem(STORAGE_KEY, JSON.stringify({ coins: this._coins, items: this._items }));
      notifyPlayerDirty();
    } catch (e) {
      console.warn('[PlayerWallet] save failed', e);
    }
  }

  reset(): void {
    this._coins = GOLD.start;
    this._items = { ...EMPTY_ITEMS };
    this.save();
    this._onChange?.(this._coins, false);
  }

  get coins(): number {
    return this._coins;
  }

  watch(fn: ((coins: number, animate: boolean) => void) | null): void {
    this._onChange = fn;
  }

  canAfford(n: number): boolean {
    return this._coins >= Math.max(0, Math.floor(n));
  }

  setCoins(n: number, animate = false): void {
    const next = Math.max(0, Math.floor(n));
    if (next === this._coins) return;
    this._coins = next;
    this.save();
    this._onChange?.(this._coins, animate);
  }

  add(n: number, animate = true, persist = true): number {
    const gain = Math.max(0, Math.floor(n));
    if (gain <= 0) return this._coins;
    this._coins += gain;
    if (persist) this.save();
    this._onChange?.(this._coins, animate);
    return this._coins;
  }

  spend(n: number): boolean {
    const cost = Math.max(0, Math.floor(n));
    if (cost <= 0) return true;
    if (this._coins < cost) return false;
    this.setCoins(this._coins - cost, false);
    return true;
  }

  itemCount(id: ItemId): number {
    return this._items[id] ?? 0;
  }

  addItem(id: ItemId, n = 1): number {
    const gain = Math.max(0, Math.floor(n));
    if (gain <= 0) return this.itemCount(id);
    this._items[id] = this.itemCount(id) + gain;
    this.save();
    this._onChange?.(this._coins, false);
    return this._items[id];
  }

  consumeItem(id: ItemId): boolean {
    if (this.itemCount(id) <= 0) return false;
    this._items[id] -= 1;
    this.save();
    this._onChange?.(this._coins, false);
    return true;
  }
}
