/**
 * WeChat packages both PVR + PKM + original when useCompressTexture is on.
 * That blew resources past the 4MB / 30MB limits (two 8MB PVR backgrounds).
 *
 *   node tools/strip-wx-tex.js          # disable compress in assets + strip build
 *   node tools/strip-wx-tex.js --build  # strip current build/wechatgame only
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const BUILD = path.join(ROOT, 'build', 'wechatgame');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function disableCompressMetas() {
  let n = 0;
  for (const file of walk(ASSETS)) {
    if (!file.endsWith('.meta')) continue;
    const src = fs.readFileSync(file, 'utf8');
    if (!src.includes('"useCompressTexture": true')) continue;
    fs.writeFileSync(file, src.replace(/"useCompressTexture": true/g, '"useCompressTexture": false'));
    n += 1;
  }
  console.log(`[strip-wx-tex] disabled compress on ${n} metas`);
}

function patchWxProjectConfig() {
  const files = [
    path.join(BUILD, 'project.config.json'),
    path.join(BUILD, 'project.private.config.json'),
  ];
  const flags = {
    bigPackageSizeSupport: true,
    useStaticServer: true,
    ignoreDevUnusedFiles: true,
    ignoreUploadUnusedFiles: true,
  };
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    json.setting = { ...(json.setting || {}), ...flags };
    fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  }
}

function stripBuild() {
  if (!fs.existsSync(BUILD)) {
    console.log('[strip-wx-tex] no build/wechatgame, skip strip');
    return;
  }
  let removed = 0;
  let bytes = 0;
  for (const file of walk(BUILD)) {
    const ext = path.extname(file).toLowerCase();
    if (ext !== '.pvr' && ext !== '.pkm') continue;
    bytes += fs.statSync(file).size;
    fs.unlinkSync(file);
    removed += 1;
  }
  let patched = 0;
  for (const file of walk(BUILD)) {
    if (!file.endsWith('.json')) continue;
    const src = fs.readFileSync(file, 'utf8');
    if (!/"fmt":"1_[^"]*"/.test(src)) continue;
    fs.writeFileSync(file, src.replace(/"fmt":"1_[^"]*"/g, '"fmt":"0"'));
    patched += 1;
  }
  console.log(
    `[strip-wx-tex] removed ${removed} pvr/pkm (${(bytes / 1024 / 1024).toFixed(1)}MB), patched ${patched} fmt`,
  );
  patchWxProjectConfig();
}

const buildOnly = process.argv.includes('--build');
if (!buildOnly) disableCompressMetas();
stripBuild();
