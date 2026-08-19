'use strict';

/** CLI for tools/wx-slim.js. Creator 构建走 extensions/ui-bind 的 onAfterBuild，一般不用跑这个。 */
const path = require('path');
const { slimWechatBuild } = require('./wx-slim');

const dest = path.resolve(__dirname, '..', 'build', 'wechatgame');
console.log(`[strip-wx-tex] ${slimWechatBuild(dest)}`);
