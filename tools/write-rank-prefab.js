'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const UI_DIR = path.join(ROOT, 'assets/prefabs/ui');
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LAYER_UI = 33554432;

const UUID = {
  panelPrefab: '7e22bb20-0045-4b02-8002-000000000045',
  itemPrefab: '7e22bb20-0046-4b02-8002-000000000046',
  RankingPanel: '8a3e5221-5cb9-30f8-8713-a85239c65ab9',
  RankingItem: '8a3e5221-5cb9-30f8-8713-a85239c65aba',
  itemBg: '7e22bb20-0090-4b02-8002-000000000090@f9941',
  numBg: '7e22bb20-0091-4b02-8002-000000000091@f9941',
  gold: '7e22bb20-0092-4b02-8002-000000000092@f9941',
  silver: '7e22bb20-0093-4b02-8002-000000000093@f9941',
  bronze: '7e22bb20-0094-4b02-8002-000000000094@f9941',
  plate: '7e22bb20-0095-4b02-8002-000000000095@f9941',
  avatar: '7e22bb20-0096-4b02-8002-000000000096@f9941',
  dim: '7e22bb20-006e-4b02-8002-00000000006e@f9941',
  panel: '7e22bb20-0083-4b02-8002-000000000083@f9941',
  close: '7e22bb20-0065-4b02-8002-000000000065@f9941',
};

const NAME_INK = { r: 90, g: 130, b: 190, a: 255 };
const SCORE_INK = { r: 44, g: 58, b: 80, a: 255 };
const RANK_INK = { r: 255, g: 255, b: 255, a: 255 };
const TITLE_INK = { r: 74, g: 68, b: 128, a: 255 };

const PANEL_W = 860;
const PANEL_H = 1700;
const PANEL_Y = 20;
const TITLE_Y = 680;
const CLOSE = 72;
const CLOSE_X = 340;
const CLOSE_Y = 775;
const SELF_Y = 558;
const SCROLL_H = 1284;
const SCROLL_Y = -160;
const ROW_W = 760;
const SELF_H = 119;
const ROW_H = 114;
const ROW_GAP = 16;
const MEDAL_W = 76;
const MEDAL_H = 103;
const NUM = 66;
const AVATAR = 88;
const INFO_W = 400;
const NAME_H = 34;
const SCORE_H = 42;

const PLATES = [
  { r: 244, g: 176, b: 188, a: 255 },
  { r: 154, g: 220, b: 228, a: 255 },
  { r: 196, g: 176, b: 226, a: 255 },
  { r: 210, g: 228, b: 118, a: 255 },
  { r: 198, g: 226, b: 96, a: 255 },
];
const DEMO = [
  { rank: 195, level: 4, name: 'Brown(Me)', plate: { r: 198, g: 226, b: 96, a: 255 }, self: true },
  { rank: 1, level: 29, name: 'Erica', plate: PLATES[0] },
  { rank: 2, level: 26, name: 'Jack', plate: PLATES[1] },
  { rank: 3, level: 23, name: 'Owen', plate: PLATES[2] },
  { rank: 4, level: 18, name: 'Emma', plate: PLATES[3] },
  { rank: 5, level: 16, name: 'Lily', plate: PLATES[4] },
  { rank: 6, level: 15, name: 'Noah', plate: PLATES[0] },
  { rank: 7, level: 14, name: 'Mia', plate: PLATES[1] },
  { rank: 8, level: 12, name: 'Leo', plate: PLATES[2] },
  { rank: 9, level: 11, name: 'Ava', plate: PLATES[3] },
  { rank: 10, level: 10, name: 'Ethan', plate: PLATES[4] },
];

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

function addUITransform(doc, nodeId, w, h, ax, ay) {
  addComp(doc, nodeId, {
    __type__: 'cc.UITransform',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _contentSize: size(w, h),
    _anchorPoint: { __type__: 'cc.Vec2', x: ax == null ? 0.5 : ax, y: ay == null ? 0.5 : ay },
    _id: '',
  });
}

function addWidget(doc, nodeId, opts) {
  const o = opts || {};
  addComp(doc, nodeId, {
    __type__: 'cc.Widget',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _alignFlags: o.alignFlags == null ? 45 : o.alignFlags,
    _target: null,
    _left: o.left || 0,
    _right: o.right || 0,
    _top: o.top || 0,
    _bottom: o.bottom || 0,
    _horizontalCenter: o.horizontalCenter || 0,
    _verticalCenter: o.verticalCenter || 0,
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

function addSprite(doc, nodeId, frameUuid, tint, sliced) {
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
    _color: color(tint || { r: 255, g: 255, b: 255, a: 255 }),
    _spriteFrame: frameUuid ? { __uuid__: frameUuid, __expectedType__: 'cc.SpriteFrame' } : null,
    _type: sliced ? 1 : 0,
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

function addMask(doc, nodeId, opts) {
  const o = opts || {};
  addComp(doc, nodeId, {
    __type__: 'cc.Mask',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _type: o.type == null ? 0 : o.type,
    _inverted: false,
    _segments: 64,
    _alphaThreshold: 0.1,
    _spriteFrame: o.frameUuid ? { __uuid__: o.frameUuid, __expectedType__: 'cc.SpriteFrame' } : null,
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
    _enableOutline: false,
    _outlineColor: color({ r: 0, g: 0, b: 0, a: 0 }),
    _outlineWidth: 0,
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

function addBlockInput(doc, nodeId) {
  addComp(doc, nodeId, {
    __type__: 'cc.BlockInputEvents',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _id: '',
  });
}

function addScrollView(doc, nodeId, contentId) {
  addComp(doc, nodeId, {
    __type__: 'cc.ScrollView',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    bounceDuration: 0.23,
    brake: 0.75,
    elastic: true,
    inertia: true,
    horizontal: false,
    vertical: true,
    cancelInnerEvents: true,
    scrollEvents: [],
    _content: { __id__: contentId },
    _horizontalScrollBar: null,
    _verticalScrollBar: null,
    _id: '',
  });
}

function addLayout(doc, nodeId) {
  addComp(doc, nodeId, {
    __type__: 'cc.Layout',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _resizeMode: 1,
    _layoutType: 2,
    _cellSize: size(40, 40),
    _startAxis: 0,
    _paddingLeft: 0,
    _paddingRight: 0,
    _paddingTop: 4,
    _paddingBottom: 8,
    _spacingX: 0,
    _spacingY: ROW_GAP,
    _verticalDirection: 1,
    _horizontalDirection: 0,
    _constraint: 0,
    _constraintNum: 2,
    _affectedByScale: true,
    _isAlign: false,
    _id: '',
  });
}

function addBox(doc, name, parentId, w, h, x, y, active, ax, ay) {
  const id = addNode(doc, { name, parentId, x, y, active });
  addPrefabInfo(doc, id, { __id__: 0 }, false);
  addUITransform(doc, id, w, h, ax, ay);
  return id;
}

function medalUuid(rank) {
  if (rank === 1) return UUID.gold;
  if (rank === 2) return UUID.silver;
  if (rank === 3) return UUID.bronze;
  return '';
}

function addRankRow(doc, parentId, name, data, x, y) {
  const showBg = !!data.self;
  const showMedal = data.rank >= 1 && data.rank <= 3;
  const h = showBg ? SELF_H : ROW_H;
  const root = addBox(doc, name, parentId, ROW_W, h, x, y);
  addScript(doc, root, UUID.RankingItem);

  const bg = addBox(doc, 'Bg', root, ROW_W, SELF_H, 0, 0, showBg);
  addSprite(doc, bg, UUID.itemBg);

  const rankX = -ROW_W * 0.5 + 24 + MEDAL_W * 0.5;
  const medal = addBox(doc, 'RankMedal', root, MEDAL_W, MEDAL_H, rankX, 2, showMedal);
  addSprite(doc, medal, medalUuid(data.rank) || UUID.gold);

  const num = addBox(doc, 'RankNum', root, NUM, NUM, rankX, 0, !showMedal);
  addSprite(doc, addBox(doc, 'Skin', num, NUM, NUM, 0, 0), UUID.numBg);
  const numLab = addBox(doc, 'Label', num, NUM, NUM, 0, 1);
  addLabel(doc, numLab, String(data.rank), data.rank >= 100 ? 22 : 28, RANK_INK);

  const avatarX = rankX + MEDAL_W * 0.5 + 12 + AVATAR * 0.5;
  const box = addBox(doc, 'AvatarBox', root, AVATAR, AVATAR, avatarX, 0);
  addSprite(doc, addBox(doc, 'Plate', box, AVATAR, AVATAR, 0, 0), UUID.plate, data.plate);
  const clip = addBox(doc, 'Clip', box, AVATAR, AVATAR, 0, 0);
  addMask(doc, clip, { type: 3, frameUuid: UUID.plate });
  addSprite(doc, addBox(doc, 'Avatar', clip, AVATAR, AVATAR, 0, 0), UUID.avatar);

  const infoX = avatarX + AVATAR * 0.5 + 14 + INFO_W * 0.5;
  const info = addBox(doc, 'Info', root, INFO_W, 86, infoX, 2);
  const nameN = addBox(doc, 'Name', info, INFO_W, NAME_H, 0, 22);
  addLabel(doc, nameN, data.name, 26, NAME_INK, {
    _horizontalAlign: 0,
    _overflow: 2,
  });
  const scoreN = addBox(doc, 'Level', info, INFO_W, SCORE_H, 0, -20);
  addLabel(doc, scoreN, `Level ${data.level}`, 34, SCORE_INK, {
    _horizontalAlign: 0,
    _overflow: 2,
  });
  return root;
}

function writePrefab(fileName, uuid, syncName, build) {
  fid = 1;
  const doc = new Doc();
  doc.add({
    __type__: 'cc.Prefab',
    _name: syncName,
    _objFlags: 0,
    __editorExtras__: {},
    _native: '',
    data: { __id__: 1 },
    optimizationPolicy: 0,
    persistent: false,
  });
  build(doc);
  const out = path.join(UI_DIR, fileName);
  fs.writeFileSync(out, `${JSON.stringify(doc.items, null, 2)}\n`);
  fs.writeFileSync(
    `${out}.meta`,
    `${JSON.stringify(
      {
        ver: '1.1.50',
        importer: 'prefab',
        imported: true,
        uuid,
        files: ['.json'],
        subMetas: {},
        userData: { syncNodeName: syncName },
      },
      null,
      2,
    )}\n`,
  );
  const nodes = doc.items.filter((i) => i.__type__ === 'cc.Node').length;
  console.log(`wrote assets/prefabs/ui/${fileName} nodes=${nodes}`);
}

function writeItem() {
  writePrefab('RankingItem.prefab', UUID.itemPrefab, 'RankingItem', (doc) => {
    addRankRow(doc, null, 'RankingItem', { ...DEMO[1], self: true }, 0, 0);
    doc.items[1]._parent = null;
  });
}

function writePanel() {
  writePrefab('RankingPanel.prefab', UUID.panelPrefab, 'RankingPanel', (doc) => {
    const root = addNode(doc, { name: 'RankingPanel' });
    addPrefabInfo(doc, root, { __id__: 0 }, true);
    addUITransform(doc, root, 1080, 1920);
    addWidget(doc, root);
    addBlockInput(doc, root);
    addScript(doc, root, UUID.RankingPanel);

    const dim = addBox(doc, 'Dim', root, 1080, 1920, 0, 0);
    addSprite(doc, dim, UUID.dim);
    addWidget(doc, dim);
    addBlockInput(doc, dim);

    const card = addBox(doc, 'Card', root, PANEL_W, PANEL_H, 0, PANEL_Y);
    addBlockInput(doc, card);

    addSprite(doc, addBox(doc, 'Frame', card, PANEL_W, PANEL_H, 0, 0), UUID.panel, null, true);

    const title = addBox(doc, 'Title', card, PANEL_W - 160, 88, 0, TITLE_Y);
    addLabel(doc, title, '排行', 64, TITLE_INK, {
      _enableOutline: false,
      _outlineWidth: 0,
    });

    const close = addBox(doc, 'CloseBtn', card, CLOSE, CLOSE, CLOSE_X, CLOSE_Y);
    addSprite(doc, close, UUID.close);

    addRankRow(doc, card, 'Self', DEMO[0], 0, SELF_Y);

    const scroll = addBox(doc, 'Scroll', card, ROW_W, SCROLL_H, 0, SCROLL_Y);
    const view = addBox(doc, 'View', scroll, ROW_W, SCROLL_H, 0, 0);
    addMask(doc, view, { type: 0 });
    addWidget(doc, view);
    const listN = DEMO.length - 1;
    const contentH = listN * ROW_H + Math.max(0, listN - 1) * ROW_GAP + 12;
    const content = addBox(doc, 'Content', view, ROW_W, contentH, 0, SCROLL_H * 0.5, true, 0.5, 1);
    addLayout(doc, content);
    addScrollView(doc, scroll, content);

    for (let i = 1; i < DEMO.length; i++) {
      addRankRow(doc, content, `Item${i}`, DEMO[i], 0, 0);
    }

    const tmpl = addRankRow(doc, card, 'ItemTemplate', DEMO[4], 0, 0);
    doc.items[tmpl]._active = false;
  });
}

function main() {
  fs.mkdirSync(UI_DIR, { recursive: true });
  writeItem();
  writePanel();
}

main();
