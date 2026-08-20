import { sys } from 'cc';
import type { ItemId } from './LevelCatalog';

export type GuideId = 'tap' | 'spin' | ItemId;
export type GuidePhase = 'world' | 'icon' | 'target';

export type GuideView = {
  id: GuideId;
  phase: GuidePhase;
  tip: string;
  item?: ItemId;
};

export type GuideContext = {
  hookPick: boolean;
  shovelPick: boolean;
  bombPick: boolean;
  canShuffle: boolean;
  hasRear: boolean;
  canShovel: boolean;
  canBomb: boolean;
  itemsReady: boolean;
};

const SAVE_KEY = 'suck.guide.v1';

const ITEM_GUIDE_LEVEL: Record<ItemId, number> = {
  shuffle: 3,
  hook: 4,
  shovel: 5,
  bomb: 6,
};

const TIPS: Record<string, string> = {
  tap: '点击炮塔，吸走砖块',
  spin: '滑动模型，转到另一面',
  shuffle: '点击洗牌，打乱炮塔位置',
  hook: '点击钩子，让后方炮塔上场',
  hookTarget: '点击后方的炮塔',
  shovel: '点击铲子，铲回场上炮塔',
  shovelWait: '先点击炮塔上场',
  shovelTarget: '点击场上的炮塔',
  bomb: '点击炸弹，炸掉同色砖块',
  bombTarget: '点击一块砖',
};

let _done: Partial<Record<GuideId, boolean>> | null = null;

function loadDone(): Partial<Record<GuideId, boolean>> {
  if (_done) return _done;
  try {
    const raw = sys.localStorage.getItem(SAVE_KEY);
    _done = raw ? JSON.parse(raw) as Partial<Record<GuideId, boolean>> : {};
  } catch {
    _done = {};
  }
  return _done;
}

function saveDone(): void {
  try {
    sys.localStorage.setItem(SAVE_KEY, JSON.stringify(loadDone()));
  } catch (e) {
    console.warn('[TutorialGuide] save failed', e);
  }
}

export function guideIdForLevel(level: number): GuideId | null {
  const id = level | 0;
  if (id === 1) return 'tap';
  if (id === 2) return 'spin';
  for (const item of Object.keys(ITEM_GUIDE_LEVEL) as ItemId[]) {
    if (ITEM_GUIDE_LEVEL[item] === id) return item;
  }
  return null;
}

export function isGuideDone(id: GuideId | null): boolean {
  if (!id) return true;
  return !!loadDone()[id];
}

export function completeGuide(id: GuideId | null): void {
  if (!id || isGuideDone(id)) return;
  loadDone()[id] = true;
  saveDone();
}

export function resetGuideProgress(): void {
  _done = {};
  try {
    sys.localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    console.warn('[TutorialGuide] reset failed', e);
  }
}

export function isItemGuide(id: GuideId | null): id is ItemId {
  return id === 'shuffle' || id === 'hook' || id === 'shovel' || id === 'bomb';
}

export function shouldSkipItemShop(id: ItemId, level: number): boolean {
  return guideIdForLevel(level) === id && !isGuideDone(id);
}

export function grantGuideItem(
  wallet: { itemCount(id: ItemId): number; addItem(id: ItemId, n?: number): number },
  level: number,
): ItemId[] {
  const id = guideIdForLevel(level);
  if (!isItemGuide(id) || isGuideDone(id)) return [];
  const need = 2 - wallet.itemCount(id);
  if (need <= 0) return [];
  wallet.addItem(id, need);
  const ids: ItemId[] = [];
  for (let i = 0; i < need; i++) ids.push(id);
  return ids;
}

export function activeGuide(level: number, ctx: GuideContext): GuideView | null {
  const id = guideIdForLevel(level);
  if (!id || isGuideDone(id)) return null;
  if (id === 'tap') return { id, phase: 'world', tip: TIPS.tap };
  if (id === 'spin') return { id, phase: 'world', tip: TIPS.spin };
  if (!ctx.itemsReady) return null;
  if (id === 'shuffle') {
    if (!ctx.canShuffle) return null;
    return { id, phase: 'icon', tip: TIPS.shuffle, item: id };
  }
  if (id === 'hook') {
    if (ctx.hookPick) return { id, phase: 'target', tip: TIPS.hookTarget, item: id };
    if (!ctx.hasRear) return null;
    return { id, phase: 'icon', tip: TIPS.hook, item: id };
  }
  if (id === 'shovel') {
    if (ctx.shovelPick) return { id, phase: 'target', tip: TIPS.shovelTarget, item: id };
    if (!ctx.canShovel) return { id: 'tap', phase: 'world', tip: TIPS.shovelWait };
    return { id, phase: 'icon', tip: TIPS.shovel, item: id };
  }
  if (ctx.bombPick) return { id, phase: 'target', tip: TIPS.bombTarget, item: id };
  if (!ctx.canBomb) return null;
  return { id, phase: 'icon', tip: TIPS.bomb, item: id };
}
