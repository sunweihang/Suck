import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { config } from './config.ts';
import { fail, methodOf, ok, pathOf, preflight, readJson, readToken, badJson } from './http.ts';
import { Store, clampSave, defaultSave, publicSave } from './store.ts';
import { Err, type PlayerSave } from './types.ts';
import { WxError, code2Session } from './wechat.ts';

const store = new Store();

function issueToken(openid: string): { token: string; expiresIn: number } {
  const token = randomBytes(32).toString('hex');
  const expiresIn = config.tokenTtlSec;
  store.putSession({
    token,
    openid,
    expiresAt: Date.now() + expiresIn * 1000,
  });
  return { token, expiresIn };
}

function authPlayer(req: IncomingMessage, res: ServerResponse) {
  const token = readToken(req);
  if (!token) {
    fail(res, Err.TOKEN, '未登录', 401);
    return null;
  }
  const session = store.getSession(token);
  if (!session) {
    fail(res, Err.TOKEN, '登录态失效', 401);
    return null;
  }
  const player = store.getPlayer(session.openid);
  if (!player) {
    fail(res, Err.TOKEN, '用户不存在', 401);
    return null;
  }
  return { token, player };
}

function ensurePlayer(openid: string, patch: { sessionKey?: string; unionid?: string }) {
  const now = Date.now();
  const prev = store.getPlayer(openid);
  if (!prev) {
    return store.upsertPlayer({
      openid,
      unionid: patch.unionid || '',
      sessionKey: patch.sessionKey || '',
      createdAt: now,
      save: defaultSave(now),
    });
  }
  let dirty = false;
  if (patch.sessionKey && patch.sessionKey !== prev.sessionKey) {
    prev.sessionKey = patch.sessionKey;
    dirty = true;
  }
  if (patch.unionid && patch.unionid !== prev.unionid) {
    prev.unionid = patch.unionid;
    dirty = true;
  }
  return dirty ? store.upsertPlayer(prev) : prev;
}

async function login(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: { code?: unknown; guest?: unknown; guestId?: unknown };
  try {
    body = (await readJson(req)) as typeof body;
  } catch {
    badJson(res);
    return;
  }

  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const guestOn = body.guest === true;
  const guestId = typeof body.guestId === 'string' ? body.guestId.trim() : '';

  let openid = '';
  let sessionKey = '';
  let unionid = '';

  if (code) {
    try {
      const wx = await code2Session(code);
      openid = wx.openid;
      sessionKey = wx.sessionKey;
      unionid = wx.unionid;
    } catch (err) {
      if (err instanceof WxError) {
        const http = err.errcode === Err.INVALID_CODE || err.errcode === 40029 ? 400 : 502;
        fail(res, err.errcode, err.message, http);
        return;
      }
      fail(res, Err.WX, '微信登录失败', 502);
      return;
    }
  } else if (guestOn) {
    if (!config.allowGuest) {
      fail(res, Err.GUEST_OFF, '未开放游客登录', 403);
      return;
    }
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(guestId)) {
      fail(res, Err.BAD_REQUEST, 'guestId 无效');
      return;
    }
    openid = `guest:${guestId}`;
  } else {
    fail(res, Err.BAD_REQUEST, '缺少 code');
    return;
  }

  const player = ensurePlayer(openid, { sessionKey, unionid });
  const session = issueToken(player.openid);
  ok(res, {
    token: session.token,
    expiresIn: session.expiresIn,
    player: publicSave(player),
  });
}

async function putPlayer(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const authed = authPlayer(req, res);
  if (!authed) return;

  let body: Partial<PlayerSave> & { rev?: unknown };
  try {
    body = (await readJson(req)) as typeof body;
  } catch {
    badJson(res);
    return;
  }

  const next = clampSave(body, authed.player.save);
  if (!next) {
    fail(res, Err.BAD_REQUEST, '存档字段无效');
    return;
  }

  const clientRev = Math.floor(Number(body.rev));
  if (!Number.isFinite(clientRev) || clientRev !== authed.player.save.rev) {
    sendConflict(res, authed.player.save);
    return;
  }

  authed.player.save = {
    ...next,
    rev: authed.player.save.rev + 1,
    updatedAt: Date.now(),
  };
  store.upsertPlayer(authed.player);
  ok(res, { player: publicSave(authed.player) });
}

function sendConflict(res: ServerResponse, save: PlayerSave): void {
  res.writeHead(409, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  });
  res.end(JSON.stringify({
    errcode: Err.REV_CONFLICT,
    errmsg: '存档版本冲突',
    data: { player: save },
  }));
}

const server = createServer((req, res) => {
  void handle(req, res).catch((err) => {
    console.error('[suck-server]', err);
    if (!res.headersSent) fail(res, Err.SERVER, '服务器错误', 500);
  });
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = methodOf(req);
  const path = pathOf(req);

  if (method === 'OPTIONS') {
    preflight(res);
    return;
  }

  if (method === 'GET' && path === '/v1/health') {
    ok(res, {
      ok: true,
      wx: Boolean(config.wxAppId && config.wxSecret),
      guest: config.allowGuest,
    });
    return;
  }

  if (method === 'POST' && path === '/v1/auth/login') {
    await login(req, res);
    return;
  }

  if (method === 'GET' && path === '/v1/player') {
    const authed = authPlayer(req, res);
    if (!authed) return;
    ok(res, { player: publicSave(authed.player) });
    return;
  }

  if (method === 'PUT' && path === '/v1/player') {
    await putPlayer(req, res);
    return;
  }

  fail(res, Err.BAD_REQUEST, '接口不存在', 404);
}

server.listen(config.port, '0.0.0.0', () => {
  console.log(`[suck-server] http://127.0.0.1:${config.port}`);
  console.log(`[suck-server] wx=${config.wxAppId ? 'on' : 'off'} guest=${config.allowGuest ? 'on' : 'off'}`);
});
