'use strict';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = void 0;
exports.load = load;
exports.unload = unload;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const http = __importStar(require("http"));
const paths_1 = require("./paths");
const SPECIAL_TITLE = {
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
let serverProc = null;
async function dialogInfo(message) {
    try {
        await Editor.Dialog.info(message, { title: '关卡编辑器', buttons: ['确定'], default: 0 });
    }
    catch {
        console.log(`[level-editor] ${message}`);
    }
}
async function dialogWarn(message) {
    try {
        await Editor.Dialog.warn(message, { title: '关卡编辑器', buttons: ['确定'], default: 0 });
    }
    catch {
        console.warn(`[level-editor] ${message}`);
    }
}
function titleOf(id) {
    return SPECIAL_TITLE[id] || `第 ${id} 关`;
}
function pingEditor() {
    return new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${paths_1.EDITOR_PORT}/api/levels`, (res) => {
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
function openUrl(url) {
    if (process.platform === 'win32') {
        (0, child_process_1.spawn)('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
        return;
    }
    (0, child_process_1.spawn)(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}
async function ensureServer() {
    if (await pingEditor())
        return true;
    const script = (0, paths_1.serverJsPath)();
    if (!fs.existsSync(script)) {
        await dialogWarn(`找不到编辑器脚本：${script}`);
        return false;
    }
    serverProc = (0, child_process_1.spawn)(process.execPath || 'node', [script], {
        cwd: (0, paths_1.getProjectRoot)(),
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, LEVEL_EDITOR_NO_OPEN: '1' },
        windowsHide: true,
    });
    serverProc.unref();
    for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (await pingEditor())
            return true;
    }
    return pingEditor();
}
function readCatalogLevels() {
    const file = (0, paths_1.catalogFsPath)();
    if (!fs.existsSync(file))
        return [];
    try {
        const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
        return (pack.levels || []).map((lv) => ({
            id: lv.id,
            cols: lv.cols,
            rows: lv.rows,
            palette: String(lv.palette || ''),
            hand: fs.existsSync((0, paths_1.overrideFsPath)(lv.id)),
        }));
    }
    catch {
        return [];
    }
}
exports.methods = {
    async battleModuleInfo() {
        return {
            id: 'level',
            packageName: paths_1.PKG,
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
        }
        catch (e) {
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
    async openEditor(arg) {
        const id = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.levelId;
        const ok = await ensureServer();
        if (!ok) {
            await dialogWarn(`无法启动关卡编辑器。可在工程根目录手动执行：\nnode tools/level-editor/server.js`);
            return { ok: false };
        }
        openUrl((0, paths_1.editorUrl)(id));
        return { ok: true };
    },
    async openLevel(arg) {
        return exports.methods.openEditor(arg);
    },
    async locateLevel(arg) {
        const id = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.levelId;
        const override = id ? (0, paths_1.overrideFsPath)(id) : '';
        const target = override && fs.existsSync(override) ? override : (0, paths_1.catalogFsPath)();
        try {
            await Editor.Message.request('asset-db', 'open-asset', 'db://assets/resources/levels/catalog.json');
        }
        catch {
            /* ignore */
        }
        await dialogInfo(`关卡文件：\n${target}`);
        return { ok: true, path: target };
    },
    async validateLevel(arg) {
        var _a, _b, _c, _d, _e, _f;
        const id = typeof arg === 'number' ? arg : (arg === null || arg === void 0 ? void 0 : arg.levelId) || 1;
        const ok = await ensureServer();
        if (!ok) {
            await dialogWarn('编辑器服务未启动，无法验关。');
            return { ok: false };
        }
        try {
            const res = await new Promise((resolve) => {
                const req = http.request({
                    host: '127.0.0.1',
                    port: paths_1.EDITOR_PORT,
                    path: `/api/level/${id}/solve`,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                }, (r) => {
                    const chunks = [];
                    r.on('data', (c) => chunks.push(c));
                    r.on('end', () => resolve({ ok: (r.statusCode || 0) < 400, text: Buffer.concat(chunks).toString('utf8') }));
                });
                req.on('error', (e) => resolve({ ok: false, text: String(e) }));
                req.end('{}');
            });
            const data = JSON.parse(res.text || '{}');
            const pass = !!(((_a = data.order) === null || _a === void 0 ? void 0 : _a.ok) || ((_b = data.greedy) === null || _b === void 0 ? void 0 : _b.ok));
            const how = ((_c = data.order) === null || _c === void 0 ? void 0 : _c.ok)
                ? `顺序可过 ${data.order.steps} 步`
                : ((_d = data.greedy) === null || _d === void 0 ? void 0 : _d.ok)
                    ? `需策略（贪心 ${data.greedy.steps} 步）`
                    : `不过 剩 ${(_f = (_e = data.greedy) === null || _e === void 0 ? void 0 : _e.remain) !== null && _f !== void 0 ? _f : '?'}`;
            await dialogInfo(`第 ${id} 关：${pass ? '可过' : '失败'}\n${how}`);
            return { ok: pass, ...data };
        }
        catch (e) {
            await dialogWarn(`验关失败：${e}`);
            return { ok: false };
        }
    },
};
function load() {
    console.log('[level-editor] loaded');
}
function unload() {
    console.log('[level-editor] unloaded');
}
//# sourceMappingURL=main.js.map