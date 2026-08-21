'use strict';

const fs = require('fs');
const path = require('path');
const { slimWechatBuild } = require('../../tools/wx-slim');

function projectRoot() {
  try {
    if (typeof Editor !== 'undefined' && Editor.Project && Editor.Project.path) {
      return Editor.Project.path;
    }
  } catch {
    /* build worker may not have Editor */
  }
  return path.resolve(__dirname, '../..');
}

function destOf(options, result) {
  if (result && result.dest) return result.dest;
  const name = (options && options.outputName) || 'wechatgame';
  const buildPath = (options && options.buildPath) || '';
  const root = projectRoot();
  if (buildPath.indexOf('project://') === 0) {
    return path.join(root, buildPath.replace(/^project:\/\//, ''), name);
  }
  if (buildPath) return path.join(buildPath, name);
  return path.join(root, 'build', name);
}

exports.throwError = false;

exports.onBeforeBuild = async function onBeforeBuild(options) {
  if (!options || options.platform !== 'wechatgame') return;
  options.skipCompressTexture = true;
};

function readAppVersion(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (pkg && typeof pkg.version === 'string' && pkg.version.trim()) return pkg.version.trim();
  } catch {
    /* keep fallback */
  }
  return '1.0.0';
}

function stampAppVersion(dest, version) {
  const gameJs = path.join(dest, 'game.js');
  if (!fs.existsSync(gameJs)) return;
  const stamp = `if(typeof GameGlobal!=='undefined')GameGlobal.__APP_VERSION=${JSON.stringify(version)};\n`;
  let src = fs.readFileSync(gameJs, 'utf8');
  if (/GameGlobal\.__APP_VERSION\s*=/.test(src)) {
    src = src.replace(/if\(typeof GameGlobal!=='undefined'\)GameGlobal\.__APP_VERSION=.*?;\n?/, stamp);
  } else {
    src = stamp + src;
  }
  fs.writeFileSync(gameJs, src);
}

exports.onAfterBuild = async function onAfterBuild(options, result) {
  if (!options || options.platform !== 'wechatgame') return;
  const dest = destOf(options, result);
  const version = readAppVersion(projectRoot());
  stampAppVersion(dest, version);
  const info = slimWechatBuild(dest);
  console.log(`[wx-pack] ${info} version=${version}`);
};
