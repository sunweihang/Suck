import { sys } from 'cc';
import type { ItemId } from '../game/LevelCatalog';
import { GAME_SERVER_TIMEOUT_MS, gameServerBaseUrl } from './GameServerConfig';

export type CloudItems = Record<ItemId, number>;

export type CloudSave = {
  level: number;
  coins: number;
  items: CloudItems;
  rev: number;
  updatedAt: number;
};

export type CloudSnapshot = {
  level: number;
  coins: number;
  items: CloudItems;
};

type CloudHooks = {
  snapshot: () => CloudSnapshot;
  apply: (save: CloudSave) => void;
};

type ApiRes<T> = {
  errcode: number;
  errmsg: string;
  data?: T;
};

type LoginData = {
  token: string;
  expiresIn: number;
  player: CloudSave;
};

type PlayerData = {
  player: CloudSave;
};

const SESSION_KEY = 'suck.cloud.session.v1';
const GUEST_KEY = 'suck.cloud.guest.v1';
const PUSH_WAIT_MS = 700;

declare const wx: undefined | {
  login?: (opts: {
    success?: (res: { code?: string; errMsg?: string }) => void;
    fail?: (err: { errMsg?: string }) => void;
  }) => void;
};

type SessionCache = {
  token: string;
  rev: number;
  expiresAt: number;
};

let _hooks: CloudHooks | null = null;
let _token = '';
let _rev = 0;
let _ready = false;
let _applying = false;
let _pushTimer = 0;
let _pushing = false;
let _dirty = false;

function emptyItems(): CloudItems {
  return { shuffle: 0, hook: 0, shovel: 0, bomb: 0 };
}

function readSession(): SessionCache | null {
  try {
    const raw = sys.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SessionCache;
    if (!data?.token || !data.expiresAt || data.expiresAt <= Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function writeSession(token: string, rev: number, expiresIn: number): void {
  _token = token;
  _rev = rev;
  try {
    sys.localStorage.setItem(SESSION_KEY, JSON.stringify({
      token,
      rev,
      expiresAt: Date.now() + Math.max(60, expiresIn) * 1000,
    } satisfies SessionCache));
  } catch {
    /* ignore */
  }
}

function guestId(): string {
  try {
    const exist = (sys.localStorage.getItem(GUEST_KEY) || '').trim();
    if (/^[a-zA-Z0-9_-]{8,64}$/.test(exist)) return exist;
    const id = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    sys.localStorage.setItem(GUEST_KEY, id);
    return id;
  } catch {
    return `g${Date.now().toString(36)}fallback`;
  }
}

function wxLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof wx === 'undefined' || typeof wx.login !== 'function') {
      reject(new Error('no wx.login'));
      return;
    }
    wx.login({
      success: (res) => {
        if (res.code) resolve(res.code);
        else reject(new Error(res.errMsg || 'no code'));
      },
      fail: (err) => reject(new Error(err?.errMsg || 'wx.login fail')),
    });
  });
}

function request<T>(method: string, path: string, body?: unknown, token = _token): Promise<ApiRes<T>> {
  const base = gameServerBaseUrl();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${base}${path}`, true);
    xhr.timeout = GAME_SERVER_TIMEOUT_MS;
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText) as ApiRes<T>);
      } catch {
        reject(new Error('bad json'));
      }
    };
    xhr.onerror = () => reject(new Error('network'));
    xhr.ontimeout = () => reject(new Error('timeout'));
    xhr.send(body === undefined ? null : JSON.stringify(body));
  });
}

function mergeSaves(local: CloudSnapshot, remote: CloudSave): { save: CloudSnapshot; push: boolean; apply: boolean } {
  if (remote.rev <= 0) {
    return { save: local, push: true, apply: false };
  }
  const items = emptyItems();
  for (const id of Object.keys(items) as ItemId[]) {
    items[id] = Math.max(local.items[id] ?? 0, remote.items[id] ?? 0);
  }
  const save = {
    level: Math.max(local.level, remote.level),
    coins: Math.max(local.coins, remote.coins),
    items,
  };
  const same = (a: CloudSnapshot, b: CloudSnapshot): boolean => (
    a.level === b.level
    && a.coins === b.coins
    && (Object.keys(items) as ItemId[]).every((id) => (a.items[id] ?? 0) === (b.items[id] ?? 0))
  );
  return {
    save,
    push: !same(save, remote),
    apply: !same(save, local),
  };
}

function toCloudSave(snap: CloudSnapshot, rev: number): CloudSave {
  return {
    level: snap.level,
    coins: snap.coins,
    items: { ...emptyItems(), ...snap.items },
    rev,
    updatedAt: Date.now(),
  };
}

async function login(): Promise<CloudSave | null> {
  const cached = readSession();
  if (cached) {
    _token = cached.token;
    _rev = cached.rev;
    try {
      const pulled = await request<PlayerData>('GET', '/v1/player');
      if (pulled.errcode === 0 && pulled.data?.player) {
        _rev = pulled.data.player.rev;
        writeSession(_token, _rev, Math.ceil((cached.expiresAt - Date.now()) / 1000));
        return pulled.data.player;
      }
    } catch {
      /* re-login */
    }
  }

  let body: { code?: string; guest?: boolean; guestId?: string };
  try {
    body = { code: await wxLoginCode() };
  } catch {
    body = { guest: true, guestId: guestId() };
  }

  let res = await request<LoginData>('POST', '/v1/auth/login', body, '');
  if ((res.errcode !== 0 || !res.data?.token) && !body.guest) {
    res = await request<LoginData>('POST', '/v1/auth/login', { guest: true, guestId: guestId() }, '');
  }
  if (res.errcode !== 0 || !res.data?.token || !res.data.player) {
    throw new Error(res.errmsg || 'login failed');
  }
  writeSession(res.data.token, res.data.player.rev, res.data.expiresIn);
  return res.data.player;
}

async function pushNow(): Promise<void> {
  if (!_hooks || !_token || _applying) return;
  if (_pushing) {
    _dirty = true;
    return;
  }
  _pushing = true;
  _dirty = false;
  const snap = _hooks.snapshot();
  try {
    const res = await request<PlayerData>('PUT', '/v1/player', {
      ...snap,
      rev: _rev,
    });
    if (res.errcode === 40001) {
      _token = '';
      const remote = await login();
      _pushing = false;
      if (remote) await pushNow();
      return;
    }
    if (res.errcode === 40901 && res.data?.player) {
      _rev = res.data.player.rev;
      const merged = mergeSaves(snap, res.data.player);
      if (merged.apply) applyRemote(toCloudSave(merged.save, res.data.player.rev));
      _pushing = false;
      if (merged.push) void pushNow();
      return;
    }
    if (res.errcode !== 0 || !res.data?.player) {
      console.warn('[PlayerCloud] push failed', res.errmsg);
      _pushing = false;
      return;
    }
    _rev = res.data.player.rev;
    writeSession(_token, _rev, 7 * 24 * 3600);
  } catch (err) {
    console.warn('[PlayerCloud] push failed', err);
  }
  _pushing = false;
  if (_dirty) void pushNow();
}

function applyRemote(remote: CloudSave): void {
  if (!_hooks) return;
  _applying = true;
  _rev = remote.rev;
  try {
    _hooks.apply(remote);
  } finally {
    _applying = false;
  }
}

export function notifyPlayerDirty(): void {
  if (!_ready || _applying || !gameServerBaseUrl()) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = 0;
    void pushNow();
  }, PUSH_WAIT_MS) as unknown as number;
}

export function initPlayerCloud(hooks: CloudHooks): void {
  _hooks = hooks;
  const base = gameServerBaseUrl();
  if (!base) {
    console.log('[PlayerCloud] off');
    return;
  }
  void (async () => {
    try {
      const remote = await login();
      if (!remote || !_hooks) return;
      const local = _hooks.snapshot();
      const merged = mergeSaves(local, remote);
      if (merged.apply) applyRemote(toCloudSave(merged.save, remote.rev));
      _ready = true;
      if (merged.push) notifyPlayerDirty();
      else {
        _rev = remote.rev;
        if (_token) writeSession(_token, _rev, 7 * 24 * 3600);
      }
      console.log('[PlayerCloud] ready', { level: merged.save.level, coins: merged.save.coins, rev: _rev });
    } catch (err) {
      console.warn('[PlayerCloud] login skipped', err);
    }
  })();
}
