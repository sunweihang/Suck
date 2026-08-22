import { LINK_UNLOCK_AFTER } from './LinkPlay';
import {
  FREEZE_TURRET_FROM,
  HIDDEN_QUEUE_AFTER_LEVEL,
  ITEM_UNLOCK_LEVEL,
  freezeDeployNeed,
  itemUnlocked,
  type ItemId,
} from './LevelCatalog';

export type LoadTipKind = 'play' | 'item' | 'hint';

export type LoadTipIcon =
  | 'icFreeSpin'
  | 'icLink'
  | 'icShuffle'
  | 'icHook'
  | 'icShovel'
  | 'icBomb'
  | 'icHidden'
  | 'iceOverlay'
  | 'iron';

export type LoadTip = {
  kind: LoadTipKind;
  debut: boolean;
  title: string;
  body: string;
  icon?: LoadTipIcon;
};

export type PlayPreview = {
  title: string;
  remain: number;
  unlocked: boolean;
  icon?: LoadTipIcon;
};

const IRON_FROM = 31;
const ITEMS: readonly ItemId[] = ['shuffle', 'hook', 'shovel', 'bomb'];

const ITEM_COPY: Record<ItemId, Pick<LoadTip, 'title' | 'body' | 'icon'>> = {
  shuffle: {
    title: '洗牌',
    body: '随机打乱备战区炮塔位置，方便重新安排上场顺序。',
    icon: 'icShuffle',
  },
  hook: {
    title: '机械爪',
    body: '点选后方炮塔，直接拉上场上坑位。',
    icon: 'icHook',
  },
  shovel: {
    title: '铲子',
    body: '把场上炮塔铲回备战区，腾出坑位再上阵。',
    icon: 'icShovel',
  },
  bomb: {
    title: '炸弹',
    body: '点墙上的同色连通区域，一次炸掉整片方块。',
    icon: 'icBomb',
  },
};

/** Extra item copy once the tool is unlocked — rotates with load tips. */
const ITEM_TIPS: Record<ItemId, Pick<LoadTip, 'title' | 'body'>> = {
  shuffle: {
    title: '洗牌妙用',
    body: '备战区顺序不对？洗牌换一换，常能凑出更顺的上阵组合。',
  },
  hook: {
    title: '机械爪妙用',
    body: '后方藏着能对上的炮？机械爪可以直接把它拉到场上。',
  },
  shovel: {
    title: '铲子妙用',
    body: '坑位满了或炮放错了？铲子先收回备战区，再重新安排。',
  },
  bomb: {
    title: '炸弹妙用',
    body: '墙面有大片同色砖？炸弹可以一次清掉整片连通区域。',
  },
};

type Debut = {
  at: number;
  title: string;
  body: string;
  icon?: LoadTipIcon;
};

const DEBUTS: readonly Debut[] = [
  {
    at: 2,
    title: '转动',
    body: '滑动模型，转到另一面。背面的砖也能打到。',
    icon: 'icFreeSpin',
  },
  ...ITEMS.map((id) => ({
    at: ITEM_UNLOCK_LEVEL[id],
    ...ITEM_COPY[id],
  })),
  {
    at: HIDDEN_QUEUE_AFTER_LEVEL + 1,
    title: '隐藏颜色',
    body: '备战区炮塔不再显示真实颜色，需要靠观察墙面再上阵。',
    icon: 'icHidden',
  },
  {
    at: FREEZE_TURRET_FROM,
    title: '冰冻炮塔',
    body: `部分炮塔被冻住。场上先上阵 ${freezeDeployNeed(FREEZE_TURRET_FROM)} 门，冰块才会碎。`,
    icon: 'iceOverlay',
  },
  {
    at: IRON_FROM,
    title: '铁板',
    body: '铁板挡住下方砖块。先打掉上方，铁板碎裂后才能继续。',
    icon: 'iron',
  },
];

const HINTS: readonly Pick<LoadTip, 'title' | 'body' | 'icon'>[] = [
  {
    title: '转一转',
    body: '拖动墙体，背面和侧面的砖也能打到。',
    icon: 'icFreeSpin',
  },
  {
    title: '对同色',
    body: '炮塔只吃和自己颜色一样的砖。',
  },
  {
    title: '先看墙',
    body: '先转一圈看大色块，再决定哪门炮上场。',
  },
  {
    title: '留后手',
    body: '别急着把同色炮全打光，后面可能还有更大色块。',
  },
  {
    title: '坑位规划',
    body: '场上坑位有限，先上能立刻消块的炮，别占满。',
  },
  {
    title: '后方储备',
    body: '备战区里的炮按顺序出场，提前想好下一轮谁来。',
  },
  {
    title: '连通爆炸',
    body: '炸弹会炸掉连通的同色区域，专打大片砖块。',
    icon: 'icBomb',
  },
  {
    title: '隐藏颜色',
    body: '颜色被遮住时，更要多转几圈墙面再决定上阵。',
    icon: 'icHidden',
  },
];

const LINK_DEBUT: Debut = {
  at: LINK_UNLOCK_AFTER + 1,
  title: '连线',
  body: '通关后可在设置里进入，消方块赚金币。',
  icon: 'icLink',
};

/** Official load copy: debut on introduce levels; otherwise preview / item / hint. */
export function pickLoadTip(level: number): LoadTip {
  const n = Math.max(1, level | 0);
  return pickDebutTip(n) ?? flavorTip(n);
}

/** Next official mechanic after this many clears. Always has a card so victory is never empty. */
export function playPreviewOf(cleared: number): PlayPreview {
  const n = Math.max(0, cleared | 0);
  const next = DEBUTS.find((d) => d.at > n);
  if (next) {
    return {
      title: next.title,
      remain: next.at - n,
      unlocked: false,
      icon: next.icon,
    };
  }
  return {
    title: '连线',
    remain: 0,
    unlocked: true,
    icon: 'icLink',
  };
}

function pickDebutTip(n: number): LoadTip | null {
  const hit = DEBUTS.find((d) => d.at === n);
  if (!hit) return null;
  return {
    kind: 'play',
    debut: true,
    title: hit.title,
    body: hit.body,
    icon: hit.icon,
  };
}

function flavorTip(n: number): LoadTip {
  const slot = (n - 1) % 6;
  if (slot === 0 || slot === 3) {
    const preview = previewTip(n);
    if (preview) return preview;
  }
  if (slot === 1 || slot === 4) {
    return itemTip(ITEMS[Math.floor((n - 1) / 6) % ITEMS.length], n);
  }
  return { kind: 'hint', debut: false, ...HINTS[(n - 1) % HINTS.length] };
}

function previewTip(n: number): LoadTip | null {
  const next = DEBUTS.find((d) => d.at > n) ?? (n < LINK_DEBUT.at ? LINK_DEBUT : null);
  if (!next) return null;
  const remain = next.at - n;
  return {
    kind: 'play',
    debut: false,
    title: next.title,
    body: previewBody(next.body, remain),
    icon: next.icon,
  };
}

function previewBody(body: string, remain: number): string {
  if (remain <= 1) return `下一关开启：${body}`;
  return `再过 ${remain} 关开启：${body}`;
}

function itemTip(id: ItemId, n: number): LoadTip {
  if (itemUnlocked(id, n)) {
    const deep = ITEM_TIPS[id];
    if ((n + id.length) % 2 === 0) {
      return { kind: 'item', debut: false, icon: ITEM_COPY[id].icon, ...deep };
    }
    return { kind: 'item', debut: false, ...ITEM_COPY[id] };
  }
  const at = ITEM_UNLOCK_LEVEL[id];
  return {
    kind: 'play',
    debut: false,
    title: ITEM_COPY[id].title,
    body: `${ITEM_COPY[id].body} 第 ${at} 关解锁。`,
    icon: ITEM_COPY[id].icon,
  };
}
