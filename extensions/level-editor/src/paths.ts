import * as path from 'path';

export const PKG = 'level-editor';
export const EDITOR_PORT = 3780;

export function getProjectRoot(): string {
  if (typeof Editor !== 'undefined' && Editor.Project?.path) {
    return Editor.Project.path;
  }
  return path.resolve(__dirname, '../../..');
}

export function catalogFsPath(): string {
  return path.join(getProjectRoot(), 'levels', 'catalog.json');
}

export function overrideDir(): string {
  return path.join(getProjectRoot(), 'levels');
}

export function overrideFsPath(id: number): string {
  return path.join(overrideDir(), `L${String(id).padStart(3, '0')}.json`);
}

export function serverJsPath(): string {
  return path.join(getProjectRoot(), 'tools', 'level-editor', 'server.js');
}

export function editorUrl(id?: number): string {
  const q = id && id > 0 ? `?id=${id}` : '';
  return `http://127.0.0.1:${EDITOR_PORT}/${q}`;
}
