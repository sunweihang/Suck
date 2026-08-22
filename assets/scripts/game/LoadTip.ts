import {
  FREEZE_TURRET_FROM,
  HIDDEN_QUEUE_AFTER_LEVEL,
  ITEM_UNLOCK_LEVEL,
  freezeDeployNeed,
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
    icon: 'icShuffle',
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
];

export function loadTipTag(tip: LoadTip): string {
  if (tip.kind === 'hint') return '小提示';
  return tip.debut ? '本关新玩法' : '新玩法预告';
}

/** Official load copy: debut mechanic if this level introduces one, otherwise a hint. */
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
  const hint = HINTS[(n - 1) % HINTS.length];
  return { kind: 'hint', debut: false, ...hint };
}
