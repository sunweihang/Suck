import { sys } from 'cc';

/**
 * 正式环境填 HTTPS 域名（须在微信后台配 request 合法域名）。
 * 空着则开发版 / 预览走本地，正式版关掉云存档。
 */
const PROD_BASE_URL = '';
const LOCAL_BASE_URL = 'http://127.0.0.1:8787';

declare const wx: undefined | {
  getAccountInfoSync?: () => { miniProgram?: { envVersion?: string } };
};

function wxEnv(): string {
  try {
    return (wx?.getAccountInfoSync?.()?.miniProgram?.envVersion || '').trim();
  } catch {
    return '';
  }
}

export function gameServerBaseUrl(): string {
  if (PROD_BASE_URL) return PROD_BASE_URL.replace(/\/+$/, '');
  if (sys.platform === sys.Platform.WECHAT_GAME && wxEnv() === 'release') return '';
  return LOCAL_BASE_URL;
}

export const GAME_SERVER_TIMEOUT_MS = 8000;
