import { config } from './config.ts';
import { Err } from './types.ts';

export type WxSession = {
  openid: string;
  sessionKey: string;
  unionid: string;
};

type WxRaw = {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

export class WxError extends Error {
  errcode: number;
  constructor(errcode: number, errmsg: string) {
    super(errmsg);
    this.errcode = errcode;
  }
}

/** 服务端调用 auth.code2Session。session_key 不得下发客户端。 */
export async function code2Session(jsCode: string): Promise<WxSession> {
  const code = jsCode.trim();
  if (!code) throw new WxError(Err.INVALID_CODE, 'code 无效');
  if (!config.wxAppId || !config.wxSecret) {
    throw new WxError(Err.INVALID_APPID, '服务端未配置 WX_APPID / WX_SECRET');
  }

  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', config.wxAppId);
  url.searchParams.set('secret', config.wxSecret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');

  let raw: WxRaw;
  try {
    const res = await fetch(url);
    raw = (await res.json()) as WxRaw;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'wechat unreachable';
    throw new WxError(Err.WX, msg);
  }

  if (raw.errcode) {
    throw new WxError(raw.errcode, raw.errmsg || 'code2Session failed');
  }
  const openid = (raw.openid || '').trim();
  const sessionKey = (raw.session_key || '').trim();
  if (!openid || !sessionKey) {
    throw new WxError(Err.WX, 'code2Session 未返回 openid');
  }
  return {
    openid,
    sessionKey,
    unionid: (raw.unionid || '').trim(),
  };
}
