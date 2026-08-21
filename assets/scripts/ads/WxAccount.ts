/**
 * 微信版本展示。
 * 正式版：getAccountInfoSync().miniProgram.version（后台填写的线上号）。
 * 体验版 / 开发版：官方不回 version，改用工程 APP_VERSION（及构建写入的 GameGlobal.__APP_VERSION）。
 */

import { APP_VERSION } from '../game/AppVersion';

declare const wx: undefined | {
  getAccountInfoSync?: () => {
    miniProgram?: {
      version?: string;
      envVersion?: string;
    };
  };
};

declare const GameGlobal: undefined | { __APP_VERSION?: string; __wxConfig?: WxCfg };

type WxCfg = {
  envVersion?: string;
  accountInfo?: {
    version?: string;
    miniProgram?: { version?: string; envVersion?: string };
  };
};

const ENV_LABEL: Record<string, string> = {
  develop: '开发版',
  trial: '体验版',
  release: '正式版',
};

function wxOk(): boolean {
  return typeof wx !== 'undefined';
}

function readAccount(): { version: string; envVersion: string } {
  try {
    const mp = wx?.getAccountInfoSync?.()?.miniProgram;
    return {
      version: (mp?.version || '').trim(),
      envVersion: (mp?.envVersion || '').trim(),
    };
  } catch {
    return { version: '', envVersion: '' };
  }
}

function readBakedVersion(): string {
  try {
    const g = (typeof GameGlobal !== 'undefined' ? GameGlobal : undefined)
      || (typeof globalThis !== 'undefined' ? (globalThis as { GameGlobal?: { __APP_VERSION?: string; __wxConfig?: WxCfg }; __APP_VERSION?: string; __wxConfig?: WxCfg }) : undefined);
    const cfg = g && '__wxConfig' in g ? g.__wxConfig : undefined;
    const fromCfg = (cfg?.accountInfo?.miniProgram?.version || cfg?.accountInfo?.version || '').trim();
    if (fromCfg) return fromCfg;
    const baked = (g && '__APP_VERSION' in g ? g.__APP_VERSION : '') || '';
    return String(baked || '').trim();
  } catch {
    return '';
  }
}

function readEnv(accountEnv: string): string {
  if (accountEnv) return accountEnv;
  try {
    const g = typeof GameGlobal !== 'undefined' ? GameGlobal : undefined;
    return (g?.__wxConfig?.envVersion || g?.__wxConfig?.accountInfo?.miniProgram?.envVersion || '').trim();
  } catch {
    return '';
  }
}

export function getWxMiniProgramVersionText(): string {
  if (!wxOk()) return '';
  const account = readAccount();
  const version = account.version || readBakedVersion() || APP_VERSION;
  if (!version) return '';
  const env = readEnv(account.envVersion);
  if (env === 'trial') return `体验版 ${version}`;
  if (env === 'develop') return `开发版 ${version}`;
  const envLabel = ENV_LABEL[env];
  if (envLabel && env !== 'release') return `${envLabel} ${version}`;
  return `版本 ${version}`;
}
