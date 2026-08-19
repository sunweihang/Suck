import { itemUnlocked, type ItemId } from './LevelCatalog';

export type ChestReward = {
  gold: number;
  items: ItemId[];
};

const ITEM_POOL: readonly ItemId[] = ['shuffle', 'hook', 'shovel', 'bomb'];

export function rollChestReward(level: number): ChestReward {
  const gold = 40 + ((Math.random() * 41) | 0);
  const pool = ITEM_POOL.filter((id) => itemUnlocked(id, level));
  if (!pool.length) return { gold: gold + 30, items: [] };
  const n = Math.random() < 0.4 ? 2 : 1;
  const items: ItemId[] = [];
  for (let i = 0; i < n; i++) {
    items.push(pool[(Math.random() * pool.length) | 0]);
  }
  return { gold, items };
}
