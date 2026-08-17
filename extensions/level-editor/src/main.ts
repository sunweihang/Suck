'use strict';

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import {
  EDITOR_PORT,
  PKG,
  catalogFsPath,
  editorUrl,
  getProjectRoot,
  overrideFsPath,
  serverJsPath,
} from './paths';

const SPECIAL_TITLE: Record<number, string> = {
  1: '新手引导',
  2: '两种颜色',
  3: '解锁洗牌',
  5: '解锁合并',
  8: '解锁钩子',
  10: '解锁铲子',
  11: '挡板',
  21: '染色',
  41: '钉子锁',
  51: '炸弹',
  61: '拯救宝箱',
};

let serverProc: ReturnType<typeof spawn> | null = null;

async function dialogInfo(message: string): Promise<void> {
  try {
    await Editor.Dialog.info(message, { title: '关卡编辑器', buttons: ['确定'], default: 0 });
  } catch {
    console.log(`[level-editor] ${message}`);
  }
}

async function dialogWarn(message: string): Promise<void> {
  try {
    await Editor.Dialog.warn(message, { title: '关卡编辑器', buttons: ['确定'], default: 0 });
  } catch {
    console.warn(`[level-editor] ${message}`);
  }
}

function titleOf(id: number): string {
  return SPECIAL_TITLE[id] || `第 ${id} 关`;
}

function pingEditor(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${EDITOR_PORT}/api/levels`, (res) => {
      res.resume();
      resolve((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function openUrl(url: string): void {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

async function ensureServer(): Promise<boolean> {
  if (await pingEditor()) return true;
  const script = serverJsPath();
  if (!fs.existsSync(script)) {
    await dialogWarn(`找不到编辑器脚本：${script}`);
    return false;
  }
  serverProc = spawn(process.execPath || 'node', [script], {
    cwd: getProjectRoot(),
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, LEVEL_EDITOR_NO_OPEN: '1' },
    windowsHide: true,
  });
  serverProc.unref();
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await pingEditor()) return true;
  }
  return pingEditor();
}

function readCatalogLevels(): Array<{ id: number; cols: number; rows: number; palette: string; hand: boolean }> {
  const file = catalogFsPath();
  if (!fs.existsSync(file)) return [];
  try {
    const pack = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      levels?: Array<{ id: number; cols: number; rows: number; palette?: string }>;
    };
    return (pack.levels || []).map((lv) => ({
      id: lv.id,
      cols: lv.cols,
      rows: lv.rows,
      palette: String(lv.palette || ''),
      hand: fs.existsSync(overrideFsPath(lv.id)),
    }));
  } catch {
    return [];
  }
}

export const methods = {
  async battleModuleInfo() {
    return {
      id: 'level',
      packageName: PKG,
      title: '关卡配置',
      order: 10,
      group: 'level',
      groupTitle: '关卡编辑器',
      groupOrder: 8,
      itemIdKey: 'levelId',
      openArgKey: 'levelId',
      emptyHint: '没有关卡。请先运行 node tools/bake-levels.js',
      openLabel: '编辑',
      hideCreate: true,
      hideExport: true,
      messages: {
        list: 'list-levels',
        open: 'open-level',
        exportOne: 'validate-level',
        exportBatch: 'validate-level',
        create: 'open-editor',
        locate: 'locate-level',
      },
    };
  },

  async openHost() {
    try {
      await Editor.Message.request('battle-manager', 'select-module', { moduleId: 'level' });
    } catch (e) {
      await dialogWarn(`无法打开 Game编辑器宿主。\n${e}`);
    }
  },

  async listLevels() {
    return readCatalogLevels().map((lv) => ({
      id: lv.id,
      name: titleOf(lv.id),
      subtitle: `${lv.cols}×${lv.rows} ${lv.palette}${lv.hand ? ' · 手改' : ''}`,
      raw: lv,
    }));
  },

  async openEditor(arg?: { levelId?: number } | number) {
    const id = typeof arg === 'number' ? arg : arg?.levelId;
    const ok = await ensureServer();
    if (!ok) {
      await dialogWarn(
        `无法启动关卡编辑器。可在工程根目录手动执行：\nnode tools/level-editor/server.js`,
      );
      return { ok: false };
    }
    openUrl(editorUrl(id));
    return { ok: true };
  },

  async openLevel(arg?: { levelId?: number } | number) {
    return methods.openEditor(arg);
  },

  async locateLevel(arg?: { levelId?: number } | number) {
    const id = typeof arg === 'number' ? arg : arg?.levelId;
    const override = id ? overrideFsPath(id) : '';
    const target = override && fs.existsSync(override) ? override : catalogFsPath();
    try {
      await Editor.Message.request('asset-db', 'open-asset', 'db://assets/resources/levels/catalog.json');
    } catch {
      /* ignore */
    }
    await dialogInfo(`关卡文件：\n${target}`);
    return { ok: true, path: target };
  },

  async validateLevel(arg?: { levelId?: number } | number) {
    const id = typeof arg === 'number' ? arg : arg?.levelId || 1;
    const ok = await ensureServer();
    if (!ok) {
      await dialogWarn('编辑器服务未启动，无法验关。');
      return { ok: false };
    }
    try {
      const res = await new Promise<{ ok: boolean; text: string }>((resolve) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port: EDITOR_PORT,
            path: `/api/level/${id}/solve`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          },
          (r) => {
            const chunks: Buffer[] = [];
            r.on('data', (c) => chunks.push(c as Buffer));
            r.on('end', () => resolve({ ok: (r.statusCode || 0) < 400, text: Buffer.concat(chunks).toString('utf8') }));
          },
        );
        req.on('error', (e) => resolve({ ok: false, text: String(e) }));
        req.end('{}');
      });
      const data = JSON.parse(res.text || '{}') as {
        order?: { ok?: boolean; steps?: number };
        greedy?: { ok?: boolean; steps?: number; remain?: number };
      };
      const pass = !!(data.order?.ok || data.greedy?.ok);
      const how = data.order?.ok
        ? `顺序可过 ${data.order.steps} 步`
        : data.greedy?.ok
          ? `需策略（贪心 ${data.greedy.steps} 步）`
          : `不过 剩 ${data.greedy?.remain ?? '?'}`;
      await dialogInfo(`第 ${id} 关：${pass ? '可过' : '失败'}\n${how}`);
      return { ok: pass, ...data };
    } catch (e) {
      await dialogWarn(`验关失败：${e}`);
      return { ok: false };
    }
  },
};

export function load(): void {
  console.log('[level-editor] loaded');
}

export function unload(): void {
  console.log('[level-editor] unloaded');
}
