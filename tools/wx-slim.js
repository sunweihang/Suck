'use strict';

/**
 * Slim a WeChat mini-game output: drop unused ASTC/PKM/PVR copies,
 * crush leftover fat PNGs, pin ImageAsset fmt to the remaining native
 * file (jpg stays jpg — do not force png), and pin project flags.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const COMPRESS_EXT = new Set(['.pvr', '.pkm', '.astc']);
const JUNK_NAME = new Set(['.ds_store', 'thumbs.db']);
const FMT_BY_EXT = {
  '.png': '0',
  '.jpg': '1',
  '.jpeg': '2',
  '.bmp': '3',
  '.webp': '4',
};
const NATIVE_PREFER = ['.jpg', '.jpeg', '.webp', '.png', '.bmp'];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function which(bin) {
  const extras = ['/opt/homebrew/bin', '/usr/local/bin'];
  const dirs = (process.env.PATH || '').split(path.delimiter).concat(extras);
  for (const dir of dirs) {
    const full = path.join(dir, bin);
    if (fs.existsSync(full)) return full;
  }
  return '';
}

function dirSize(dir) {
  let n = 0;
  for (const file of walk(dir)) {
    try {
      n += fs.statSync(file).size;
    } catch {
      /* ignore */
    }
  }
  return n;
}

function patchWxProjectConfig(dest) {
  const flags = {
    bigPackageSizeSupport: true,
    useStaticServer: true,
    ignoreDevUnusedFiles: true,
    ignoreUploadUnusedFiles: true,
    uploadWithSourceMap: false,
    minified: true,
  };
  for (const name of ['project.config.json', 'project.private.config.json']) {
    const file = path.join(dest, name);
    if (!fs.existsSync(file)) continue;
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    json.compileType = 'game';
    json.setting = { ...(json.setting || {}), ...flags };
    fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  }
}

function patchGameJson(dest) {
  const file = path.join(dest, 'game.json');
  if (!fs.existsSync(file)) return;
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const packs = json.subpackages || json.subPackages;
  if (!packs || !packs.length) return;
  json.subpackages = packs;
  json.subPackages = packs;
  fs.writeFileSync(file, `${JSON.stringify(json, null, 4)}\n`);
}

function nativeDirOf(importFile) {
  const parts = path.dirname(importFile).split(path.sep);
  const i = parts.lastIndexOf('import');
  if (i < 0) return '';
  parts[i] = 'native';
  return parts.join(path.sep);
}

function nativeFmtForImport(importFile) {
  const uuid = path.basename(importFile, '.json');
  if (!uuid || uuid.includes('@')) return '';
  const nativeDir = nativeDirOf(importFile);
  if (!nativeDir || !fs.existsSync(nativeDir)) return '';
  let names = [];
  try {
    names = fs.readdirSync(nativeDir);
  } catch {
    return '';
  }
  const hits = names.filter((name) => name.startsWith(`${uuid}.`));
  for (const ext of NATIVE_PREFER) {
    if (hits.some((name) => name.toLowerCase().endsWith(ext))) return FMT_BY_EXT[ext];
  }
  return '';
}

function patchImageFmt(dest) {
  let patched = 0;
  for (const file of walk(dest)) {
    if (!file.endsWith('.json') || path.basename(file).includes('@')) continue;
    const src = fs.readFileSync(file, 'utf8');
    if (!src.includes('cc.ImageAsset') || !/"fmt":"[^"]*"/.test(src)) continue;
    const fmt = nativeFmtForImport(file);
    if (!fmt) continue;
    const next = src.replace(/"fmt":"[^"]*"/g, `"fmt":"${fmt}"`);
    if (next === src) continue;
    fs.writeFileSync(file, next);
    patched += 1;
  }
  return patched;
}

function quantPngs(dest) {
  const pngquant = which('pngquant');
  if (!pngquant) return { n: 0, saved: 0 };
  let n = 0;
  let saved = 0;
  for (const file of walk(dest)) {
    if (path.extname(file).toLowerCase() !== '.png') continue;
    const before = fs.statSync(file).size;
    if (before < 24 * 1024) continue;
    try {
      execFileSync(pngquant, ['--quality=60-80', '--speed=1', '--force', '--ext', '.png', file], {
        stdio: 'ignore',
      });
      const after = fs.statSync(file).size;
      if (after < before) {
        saved += before - after;
        n += 1;
      }
    } catch {
      /* pngquant 99 = cannot beat original */
    }
  }
  return { n, saved };
}

function slimWechatBuild(dest) {
  if (!dest || !fs.existsSync(dest)) {
    return `skip, missing ${dest || '(no dest)'}`;
  }
  let removed = 0;
  let bytes = 0;
  for (const file of walk(dest)) {
    const ext = path.extname(file).toLowerCase();
    const name = path.basename(file).toLowerCase();
    if (!COMPRESS_EXT.has(ext) && !JUNK_NAME.has(name) && ext !== '.map') continue;
    bytes += fs.statSync(file).size;
    fs.unlinkSync(file);
    removed += 1;
  }
  const patched = patchImageFmt(dest);
  const quant = quantPngs(dest);
  patchWxProjectConfig(dest);
  patchGameJson(dest);
  const total = dirSize(dest);
  return (
    `removed ${removed} unused tex/junk (${(bytes / 1024 / 1024).toFixed(1)}MB), ` +
    `fmt ${patched}, pngquant ${quant.n} (-${(quant.saved / 1024 / 1024).toFixed(1)}MB), ` +
    `total ${(total / 1024 / 1024).toFixed(1)}MB`
  );
}

module.exports = { slimWechatBuild };
