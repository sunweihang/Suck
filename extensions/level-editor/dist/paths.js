"use strict";
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
exports.EDITOR_PORT = exports.PKG = void 0;
exports.getProjectRoot = getProjectRoot;
exports.catalogFsPath = catalogFsPath;
exports.overrideDir = overrideDir;
exports.overrideFsPath = overrideFsPath;
exports.serverJsPath = serverJsPath;
exports.editorUrl = editorUrl;
const path = __importStar(require("path"));
exports.PKG = 'level-editor';
exports.EDITOR_PORT = 3780;
function getProjectRoot() {
    var _a;
    if (typeof Editor !== 'undefined' && ((_a = Editor.Project) === null || _a === void 0 ? void 0 : _a.path)) {
        return Editor.Project.path;
    }
    return path.resolve(__dirname, '../../..');
}
function catalogFsPath() {
    return path.join(getProjectRoot(), 'assets', 'resources', 'levels', 'catalog.json');
}
function overrideDir() {
    return path.join(getProjectRoot(), 'levels');
}
function overrideFsPath(id) {
    return path.join(overrideDir(), `L${String(id).padStart(3, '0')}.json`);
}
function serverJsPath() {
    return path.join(getProjectRoot(), 'tools', 'level-editor', 'server.js');
}
function editorUrl(id) {
    const q = id && id > 0 ? `?id=${id}` : '';
    return `http://127.0.0.1:${exports.EDITOR_PORT}/${q}`;
}
//# sourceMappingURL=paths.js.map