'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets/prefabs/ui/VictoryPanel.prefab');
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LAYER_UI = 33554432;

const UUID = {
  prefab: '7e22bb20-0041-4b02-8002-000000000041',
  VictoryPanel: '8a3e5221-5cb9-30f8-8713-a85239c65ab8',
  panel: 'e7f3a91c-2d84-4b6e-9c11-8a0d4f6b2e21@f9941',
  next: 'c60db3f9-8067-4a17-87f5-dad8b07c60a9@f9941',
  double: 'a43b8381-cf88-4be8-9cf6-81e475e50c06@f9941',
  gold: '7e22bb20-0076-4b02-8002-000000000076@f9941',
  ad: '7e22bb20-0078-4b02-8002-000000000078@f9941',
};

const PANEL_W = 860;
const PANEL_H = Math.round((PANEL_W * 956) / 791);
const BTN_W = 374;
const BTN_H = 145;
const BTN_GAP = 20;
const AD_ICON_W = 52;
const AD_ICON_H = 36;
const GOLD_ICON = 72;
const GOLD_Y = -Math.round(PANEL_H * 0.32);
const BTN_Y = -Math.round(PANEL_H * 0.5 + 16 + BTN_H * 0.5);
const DOUBLE_X = -Math.round((BTN_W + BTN_GAP) * 0.5);
const NEXT_X = Math.round((BTN_W + BTN_GAP) * 0.5);

function compressUuid(uuid) {
  const rest = uuid.slice(5).replace(/-/g, '');
  let out = uuid.replace(/-/g, '').slice(0, 5);
  for (let i = 0; i < rest.length; i += 3) {
    const n = parseInt(rest.slice(i, i + 3), 16);
    out += BASE64[(n >> 6) & 63] + BASE64[n & 63];
  }
  return out;
}

let fid = 1;
function fileId(tag) {
  const s = `${tag}${String(fid++).padStart(8, '0')}xxxxxxxxxxxx`;
  return s.slice(0, 22);
}

class Doc {
  constructor() {
    this.items = [];
  }
  add(obj) {
    const id = this.items.length;
    this.items.push(obj);
    return id;
  }
}

function vec3(x, y, z) {
  return { __type__: 'cc.Vec3', x, y, z };
}
function quat() {
  return { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 };
}
function color(c) {
  return { __type__: 'cc.Color', ...c };
}
function size(w, h) {
  return { __type__: 'cc.Size', width: w, height: h };
}

function addNode(doc, opts) {
  const id = doc.add({
    __type__: 'cc.Node',
    _name: opts.name,
    _objFlags: 0,
    __editorExtras__: {},
    _parent: opts.parentId == null ? null : { __id__: opts.parentId },
    _children: [],
    _active: opts.active !== false,
    _components: [],
    _prefab: null,
    _lpos: vec3(opts.x || 0, opts.y || 0, opts.z || 0),
    _lrot: quat(),
    _lscale: vec3(1, 1, 1),
    _mobility: 0,
    _layer: LAYER_UI,
    _euler: vec3(0, 0, 0),
    _id: '',
  });
  if (opts.parentId != null) doc.items[opts.parentId]._children.push({ __id__: id });
  return id;
}

function addPrefabInfo(doc, nodeId, assetRef, isRoot) {
  const infoId = doc.add({
    __type__: 'cc.PrefabInfo',
    root: { __id__: isRoot ? nodeId : 1 },
    asset: assetRef,
    fileId: fileId('f'),
    instance: null,
    targetOverrides: null,
    nestedPrefabInstanceRoots: null,
  });
  doc.items[nodeId]._prefab = { __id__: infoId };
}

function addCompPrefab(doc, comp) {
  const id = doc.add({ __type__: 'cc.CompPrefabInfo', fileId: fileId('c') });
  comp.__prefab = { __id__: id };
}

function addComp(doc, nodeId, comp) {
  const id = doc.add(comp);
  doc.items[nodeId]._components.push({ __id__: id });
  addCompPrefab(doc, comp);
  return id;
}

function addUITransform(doc, nodeId, w, h) {
  addComp(doc, nodeId, {
    __type__: 'cc.UITransform',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _contentSize: size(w, h),
    _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 },
    _id: '',
  });
}

function addWidget(doc, nodeId) {
  addComp(doc, nodeId, {
    __type__: 'cc.Widget',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _alignFlags: 45,
    _target: null,
    _left: 0,
    _right: 0,
    _top: 0,
    _bottom: 0,
    _horizontalCenter: 0,
    _verticalCenter: 0,
    _isAbsLeft: true,
    _isAbsRight: true,
    _isAbsTop: true,
    _isAbsBottom: true,
    _isAbsHorizontalCenter: true,
    _isAbsVerticalCenter: true,
    _originalWidth: 0,
    _originalHeight: 0,
    _alignMode: 2,
    _lockFlags: 0,
    _id: '',
  });
}

function addGraphics(doc, nodeId) {
  addComp(doc, nodeId, {
    __type__: 'cc.Graphics',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _customMaterial: null,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: color({ r: 255, g: 255, b: 255, a: 255 }),
    _lineWidth: 1,
    _strokeColor: color({ r: 0, g: 0, b: 0, a: 255 }),
    _lineJoin: 2,
    _lineCap: 0,
    _fillColor: color({ r: 255, g: 255, b: 255, a: 255 }),
    _miterLimit: 10,
    _id: '',
  });
}

function addSprite(doc, nodeId, frameUuid) {
  addComp(doc, nodeId, {
    __type__: 'cc.Sprite',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _customMaterial: null,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: color({ r: 255, g: 255, b: 255, a: 255 }),
    _spriteFrame: { __uuid__: frameUuid, __expectedType__: 'cc.SpriteFrame' },
    _type: 0,
    _fillType: 0,
    _sizeMode: 0,
    _fillCenter: { __type__: 'cc.Vec2', x: 0, y: 0 },
    _fillStart: 0,
    _fillRange: 0,
    _isTrimmedMode: false,
    _useGrayscale: false,
    _atlas: null,
    _id: '',
  });
}

function addLabel(doc, nodeId, text, fontSize, col, extra) {
  addComp(doc, nodeId, {
    __type__: 'cc.Label',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _customMaterial: null,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: color(col),
    _string: text,
    _horizontalAlign: 1,
    _verticalAlign: 1,
    _actualFontSize: fontSize,
    _fontSize: fontSize,
    _fontFamily: 'PingFang SC',
    _lineHeight: fontSize + 6,
    _overflow: 0,
    _enableWrapText: false,
    _font: null,
    _isSystemFontUsed: true,
    _spacingX: 0,
    _isItalic: false,
    _isBold: true,
    _isUnderline: false,
    _underlineHeight: 2,
    _cacheMode: 0,
    _enableOutline: true,
    _outlineColor: color({ r: 255, g: 255, b: 255, a: 255 }),
    _outlineWidth: Math.max(2, Math.round(fontSize * 0.08)),
    _id: '',
    ...(extra || {}),
  });
}

function addScript(doc, nodeId, uuid) {
  addComp(doc, nodeId, {
    __type__: compressUuid(uuid),
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _id: '',
  });
}

function addBox(doc, name, parentId, w, h, x, y, active) {
  const id = addNode(doc, { name, parentId, x, y, active });
  addPrefabInfo(doc, id, { __id__: 0 }, false);
  addUITransform(doc, id, w, h);
  return id;
}

function main() {
  const doc = new Doc();
  doc.add({
    __type__: 'cc.Prefab',
    _name: 'VictoryPanel',
    _objFlags: 0,
    __editorExtras__: {},
    _native: '',
    data: { __id__: 1 },
    optimizationPolicy: 0,
    persistent: false,
  });

  const root = addNode(doc, { name: 'VictoryPanel' });
  addPrefabInfo(doc, root, { __id__: 0 }, true);
  addUITransform(doc, root, 1080, 1920);
  addWidget(doc, root);
  addScript(doc, root, UUID.VictoryPanel);

  const dim = addBox(doc, 'Dim', root, 1080, 1920, 0, 0);
  addGraphics(doc, dim);
  addWidget(doc, dim);

  const card = addBox(doc, 'Card', root, PANEL_W, PANEL_H, 0, 20);
  const frame = addBox(doc, 'Frame', card, PANEL_W, PANEL_H, 0, 0);
  addSprite(doc, frame, UUID.panel);

  const goldW = GOLD_ICON + 12 + 160;
  const gold = addBox(doc, 'GoldReward', card, goldW, GOLD_ICON + 8, 0, GOLD_Y);
  const goldIcon = addBox(doc, 'GoldIcon', gold, GOLD_ICON, GOLD_ICON, -goldW * 0.5 + GOLD_ICON * 0.5, 0);
  addSprite(doc, goldIcon, UUID.gold);
  const goldLab = addBox(doc, 'GoldLabel', gold, 160, GOLD_ICON + 8, -goldW * 0.5 + GOLD_ICON + 12 + 80, 2);
  addLabel(doc, goldLab, '+25', 56, { r: 248, g: 225, b: 128, a: 255 }, {
    _outlineColor: { __type__: 'cc.Color', r: 74, g: 68, b: 128, a: 255 },
    _outlineWidth: 5,
  });

  const double = addBox(doc, 'DoubleBtn', card, BTN_W, BTN_H, DOUBLE_X, BTN_Y);
  addSprite(doc, addBox(doc, 'Skin', double, BTN_W, BTN_H, 0, 0), UUID.double);
  const contentW = AD_ICON_W + 10 + 200;
  const content = addBox(doc, 'Content', double, contentW, BTN_H - 8, 0, 2);
  const ad = addBox(doc, 'AdIcon', content, AD_ICON_W, AD_ICON_H, -contentW * 0.5 + AD_ICON_W * 0.5, 0);
  addSprite(doc, ad, UUID.ad);
  const dlab = addBox(doc, 'Label', content, 200, BTN_H - 16, -contentW * 0.5 + AD_ICON_W + 10 + 100, 0);
  addLabel(doc, dlab, '双倍领取', 40, { r: 255, g: 255, b: 255, a: 255 }, {
    _outlineColor: { __type__: 'cc.Color', r: 88, g: 48, b: 16, a: 255 },
    _outlineWidth: 4,
  });

  const next = addBox(doc, 'NextBtn', card, BTN_W, BTN_H, NEXT_X, BTN_Y);
  addSprite(doc, addBox(doc, 'Skin', next, BTN_W, BTN_H, 0, 0), UUID.next);
  const nlab = addBox(doc, 'Label', next, BTN_W - 24, BTN_H - 16, 0, 2);
  addLabel(doc, nlab, '下一关', 40, { r: 255, g: 255, b: 255, a: 255 }, {
    _outlineColor: { __type__: 'cc.Color', r: 20, g: 64, b: 32, a: 255 },
    _outlineWidth: 4,
  });

  fs.writeFileSync(OUT, `${JSON.stringify(doc.items, null, 2)}\n`);
  fs.writeFileSync(
    `${OUT}.meta`,
    `${JSON.stringify(
      {
        ver: '1.1.50',
        importer: 'prefab',
        imported: true,
        uuid: UUID.prefab,
        files: ['.json'],
        subMetas: {},
        userData: { syncNodeName: 'VictoryPanel' },
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `wrote ${path.relative(ROOT, OUT)} panel=${PANEL_W}x${PANEL_H} btn=${BTN_W}x${BTN_H}`,
  );
}

main();
