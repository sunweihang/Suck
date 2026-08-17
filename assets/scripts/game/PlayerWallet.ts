import { sys } from 'cc';
import type { ItemId } from './LevelCatalog';

const STORAGE_KEY = 'suck.wallet.v1';

export const GOLD = {
  start: 200,
  win: 25,
  fail: 10,
  slot: 600,
  item: {
    shuffle: 20,
    merge: 30,
    hook: 40,
    shovel: 40,
  } as Record<ItemId, number>,
};

export function itemGoldCost(id: ItemId): number {
  return GOLD.item[id];
}

export function slotGoldCost(): number {
  return GOLD.slot;
}

const EMPTY_ITEMS: Record<ItemId, number> = {
  shuffle: 0,
  merge: 0,
  hook: 0,
  shovel: 0,
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
    } catch {
      this._coins = GOLD.start;
      this._items = { ...EMPTY_ITEMS };
    }
  }

  save(): void {
    try {
      sys.localStorage.setItem(STORAGE_KEY, JSON.stringify({ coins: this._coins, items: this._items }));
    } catch (e) {
      console.warn('[PlayerWallet] save failed', e);
    }
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

  add(n: number): number {
    const gain = Math.max(0, Math.floor(n));
    if (gain <= 0) return this._coins;
    this.setCoins(this._coins + gain, true);
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
