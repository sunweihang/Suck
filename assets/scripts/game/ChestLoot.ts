import type { ItemId } from './LevelCatalog';

export type ChestReward = {
  gold: number;
  items: ItemId[];
};

/** 通关 / 关内宝箱只给金币，不再掉道具。 */
export function rollChestReward(_level: number): ChestReward {
  const gold = 20 + ((Math.random() * 11) | 0);
  return { gold, items: [] };
}
