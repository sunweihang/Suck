import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotEnv(file: string): void {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv(resolve(process.cwd(), '.env'));

function num(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function flag(name: string): boolean {
  const v = (process.env[name] || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export const config = {
  port: num('PORT', 8787),
  wxAppId: (process.env.WX_APPID || '').trim(),
  wxSecret: (process.env.WX_SECRET || '').trim(),
  allowGuest: flag('ALLOW_GUEST'),
  tokenTtlSec: num('TOKEN_TTL_SEC', 7 * 24 * 3600),
  dataDir: resolve(process.cwd(), process.env.DATA_DIR || './data'),
};
