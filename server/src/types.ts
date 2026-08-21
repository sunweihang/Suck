export const ITEM_IDS = ['shuffle', 'hook', 'shovel', 'bomb'] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export type PlayerItems = Record<ItemId, number>;

/** 客户端可见的存档。不含 openid / session_key。 */
export type PlayerSave = {
  level: number;
  coins: number;
  items: PlayerItems;
  rev: number;
  updatedAt: number;
};

export type PlayerRow = {
  openid: string;
  unionid: string;
  sessionKey: string;
  createdAt: number;
  save: PlayerSave;
};

export type SessionRow = {
  token: string;
  openid: string;
  expiresAt: number;
};

export type ApiOk<T> = {
  errcode: 0;
  errmsg: 'ok';
  data: T;
};

export type ApiErr = {
  errcode: number;
  errmsg: string;
};

export const Err = {
  OK: 0,
  BAD_REQUEST: 40000,
  TOKEN: 40001,
  INVALID_CODE: 40029,
  INVALID_APPID: 40013,
  REV_CONFLICT: 40901,
  GUEST_OFF: 40301,
  WX: 50010,
  SERVER: 50000,
} as const;

export const LIMITS = {
  maxLevel: 200,
  maxCoins: 1_000_000_000,
  maxItem: 9999,
};
