'use strict';

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

exports.onAfterBuild = async function onAfterBuild(options, result) {
  if (!options || options.platform !== 'wechatgame') return;
  const dest = destOf(options, result);
  const info = slimWechatBuild(dest);
  console.log(`[wx-pack] ${info}`);
};
