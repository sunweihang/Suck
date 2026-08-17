'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const MESH = {
  cube: '1263d74c-8167-4928-91a6-4e2672411f47@a804a',
  sphere: '1263d74c-8167-4928-91a6-4e2672411f47@8abdc',
};
const FX_STD = 'c8f66d17-351a-48da-a12c-0212d28575c4';
const SPRITE = '7d8f9b89-4fd1-4c9f-a3ab-38ec7cded7ca@f9941';
const LAYER_3D = 1073741824;
const LAYER_UI = 33554432;

const UUID = {
  MatOrange: '9d11aa10-0001-4a01-8001-000000000001',
  MatCyan: '9d11aa10-0002-4a01-8001-000000000002',
  MatBlack: '9d11aa10-0003-4a01-8001-000000000003',
  MatGround: '9d11aa10-0004-4a01-8001-000000000004',
  MatSlot: '9d11aa10-0005-4a01-8001-000000000005',
  MatEye: '9d11aa10-0006-4a01-8001-000000000006',
  MatPupil: '9d11aa10-0007-4a01-8001-000000000007',
  MatSkin: '9d11aa10-0008-4a01-8001-000000000008',
  MatPad: '9d11aa10-0009-4a01-8001-000000000009',
  BlockOrange: '7e22bb20-0001-4b02-8002-000000000001',
  BlockCyan: '7e22bb20-0002-4b02-8002-000000000002',
  BlockBlack: '7e22bb20-0003-4b02-8002-000000000003',
  UnitOrange: '7e22bb20-0004-4b02-8002-000000000004',
  UnitCyan: '7e22bb20-0005-4b02-8002-000000000005',
  UnitBlack: '7e22bb20-0006-4b02-8002-000000000006',
  Slot: '7e22bb20-0007-4b02-8002-000000000007',
  Ground: '7e22bb20-0008-4b02-8002-000000000008',
  Debris: '7e22bb20-0009-4b02-8002-000000000009',
  HintHand: '7e22bb20-000a-4b02-8002-00000000000a',
  BlockCell: '8c01a1b0-4e21-4f3a-9c11-010000000001',
  UnitActor: '8c01a1b0-4e21-4f3a-9c11-010000000002',
  SlotPad: '8c01a1b0-4e21-4f3a-9c11-010000000003',
  DebrisBit: '8c01a1b0-4e21-4f3a-9c11-010000000004',
  BattleDirector: '8c01a1b0-4e21-4f3a-9c11-010000000005',
  PlayHud: '8c01a1b0-4e21-4f3a-9c11-010000000006',
  HintHandScript: '8c01a1b0-4e21-4f3a-9c11-010000000007',
  GameBootstrap: 'b172b340-2fd0-cc1b-c8a2-37355a416da9',
  HomePanel: '8a3e5221-5cb9-30f8-8713-a85239c65ab7',
  SettingsPanel: 'af0a732d-536e-d722-9f0c-0977d0e20b59',
  Scene: '4528bbb6-d6a3-a0b2-f729-9b144877ab60',
  dirMaterials: 'c0110001-0001-4001-8001-000000000001',
  dirPrefabs: 'c0110001-0001-4001-8001-000000000002',
  dirPrefabsUi: 'c0110001-0001-4001-8001-000000000003',
  dirBattle: 'c0110001-0001-4001-8001-000000000004',
};

const COLOR = {
  o: { r: 245, g: 165, b: 74, a: 255 },
  c: { r: 62, g: 200, b: 208, a: 255 },
  k: { r: 42, g: 42, b: 50, a: 255 },
  ground: { r: 142, g: 200, b: 224, a: 255 },
  slot: { r: 120, g: 168, b: 184, a: 255 },
  eye: { r: 250, g: 250, b: 252, a: 255 },
  pupil: { r: 20, g: 22, b: 28, a: 255 },
  skin: { r: 240, g: 200, b: 160, a: 255 },
  pad: { r: 118, g: 186, b: 210, a: 255 },
  sky: { r: 158, g: 210, b: 230, a: 255 },
};

const UNITS = [
  ['o', 40], ['k', 49], ['c', 80], ['k', 136], ['o', 40], ['c', 49],
  ['c', 20], ['o', 316], ['k', 40], ['o', 80], ['c', 136], ['k', 49],
  ['k', 80], ['c', 40], ['o', 20], ['c', 40], ['k', 200], ['o', 80],
  ['o', 49], ['k', 20], ['c', 80], ['o', 40], ['c', 20], ['k', 40],
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

function quatFromEuler(x, y, z) {
  const rx = (x * Math.PI) / 360;
  const ry = (y * Math.PI) / 360;
  const rz = (z * Math.PI) / 360;
  const sx = Math.sin(rx); const cx = Math.cos(rx);
  const sy = Math.sin(ry); const cy = Math.cos(ry);
  const sz = Math.sin(rz); const cz = Math.cos(rz);
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  };
}

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`);
}

function dirMeta(uuid) {
  return { ver: '1.2.0', importer: 'directory', imported: true, uuid, files: [], subMetas: {}, userData: {} };
}

function tsMeta(uuid) {
  return { ver: '4.0.24', importer: 'typescript', imported: true, uuid, files: [], subMetas: {}, userData: {} };
}

function mtlMeta(uuid) {
  return { ver: '1.0.21', importer: 'material', imported: true, uuid, files: ['.json'], subMetas: {}, userData: {} };
}

function prefabMeta(uuid) {
  return { ver: '1.1.50', importer: 'prefab', imported: true, uuid, files: ['.json'], subMetas: {}, userData: { syncNodeName: true } };
}

function material(name, color) {
  return {
    __type__: 'cc.Material',
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _native: '',
    _effectAsset: { __uuid__: FX_STD, __expectedType__: 'cc.EffectAsset' },
    _techIdx: 0,
    _defines: [{}, {}, {}],
    _states: [
      { rasterizerState: {}, depthStencilState: {}, blendState: { targets: [{}] } },
      {},
      {},
    ],
    _props: [
      {
        mainColor: { __type__: 'cc.Color', ...color },
        roughness: 0.64,
        metallic: 0.04,
      },
      {},
      {},
    ],
  };
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
  json() {
    return `${JSON.stringify(this.items, null, 2)}\n`;
  }
}

function vec3(x, y, z) {
  return { __type__: 'cc.Vec3', x, y, z };
}
function quat(x, y, z, w) {
  return { __type__: 'cc.Quat', x, y, z, w };
}
function color(c) {
  return { __type__: 'cc.Color', ...c };
}
function size(w, h) {
  return { __type__: 'cc.Size', width: w, height: h };
}

function addNode(doc, opts) {
  const children = [];
  const components = [];
  const id = doc.add({
    __type__: 'cc.Node',
    _name: opts.name,
    _objFlags: 0,
    __editorExtras__: {},
    _parent: opts.parentId == null ? null : { __id__: opts.parentId },
    _children: children,
    _active: opts.active !== false,
    _components: components,
    _prefab: opts.prefabId ? { __id__: opts.prefabId } : null,
    _lpos: vec3(opts.x || 0, opts.y || 0, opts.z || 0),
    _lrot: quat(opts.qx || 0, opts.qy || 0, opts.qz || 0, opts.qw == null ? 1 : opts.qw),
    _lscale: vec3(opts.sx == null ? 1 : opts.sx, opts.sy == null ? 1 : opts.sy, opts.sz == null ? 1 : opts.sz),
    _mobility: 0,
    _layer: opts.layer == null ? LAYER_3D : opts.layer,
    _euler: vec3(opts.ex || 0, opts.ey || 0, opts.ez || 0),
    _id: opts.id || '',
  });
  if (opts.parentId != null) {
    doc.items[opts.parentId]._children.push({ __id__: id });
  }
  return { id, children, components };
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
  return infoId;
}

function addCompPrefab(doc, comp) {
  const id = doc.add({ __type__: 'cc.CompPrefabInfo', fileId: fileId('c') });
  comp.__prefab = { __id__: id };
}

function addMeshRenderer(doc, nodeId, mesh, mat, asPrefab) {
  const bakeId = doc.add({
    __type__: 'cc.ModelBakeSettings',
    texture: null,
    uvParam: { __type__: 'cc.Vec4', x: 0, y: 0, z: 0, w: 0 },
    _bakeable: false,
    _castShadow: false,
    _receiveShadow: false,
    _recieveShadow: false,
    _lightmapSize: 64,
    _useLightProbe: false,
    _bakeToLightProbe: true,
    _reflectionProbeType: 0,
    _bakeToReflectionProbe: true,
  });
  const mr = {
    __type__: 'cc.MeshRenderer',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _materials: [{ __uuid__: mat, __expectedType__: 'cc.Material' }],
    _visFlags: 0,
    bakeSettings: { __id__: bakeId },
    _mesh: { __uuid__: mesh, __expectedType__: 'cc.Mesh' },
    _shadowCastingMode: 0,
    _shadowReceivingMode: 1,
    _shadowBias: 0,
    _shadowNormalBias: 0,
    _reflectionProbeId: -1,
    _reflectionProbeBlendId: -1,
    _reflectionProbeBlendWeight: 0,
    _enabledGlobalStandardSkinObject: false,
    _enableMorph: true,
    _id: '',
  };
  const id = doc.add(mr);
  doc.items[nodeId]._components.push({ __id__: id });
  if (asPrefab) addCompPrefab(doc, mr);
  return id;
}

function addScript(doc, nodeId, uuid, asPrefab) {
  const comp = {
    __type__: compressUuid(uuid),
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _id: '',
  };
  const id = doc.add(comp);
  doc.items[nodeId]._components.push({ __id__: id });
  if (asPrefab) addCompPrefab(doc, comp);
  return id;
}

function addUITransform(doc, nodeId, w, h, asPrefab) {
  const comp = {
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
  };
  const id = doc.add(comp);
  doc.items[nodeId]._components.push({ __id__: id });
  if (asPrefab) addCompPrefab(doc, comp);
  return id;
}

function addSprite(doc, nodeId, col, asPrefab) {
  const comp = {
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
    _color: color(col),
    _spriteFrame: { __uuid__: SPRITE, __expectedType__: 'cc.SpriteFrame' },
    _type: 0,
    _fillType: 0,
    _sizeMode: 0,
    _fillCenter: { __type__: 'cc.Vec2', x: 0, y: 0 },
    _fillStart: 0,
    _fillRange: 0,
    _isTrimmedMode: true,
    _useGrayscale: false,
    _atlas: null,
    _id: '',
  };
  const id = doc.add(comp);
  doc.items[nodeId]._components.push({ __id__: id });
  if (asPrefab) addCompPrefab(doc, comp);
  return id;
}

function addLabel(doc, nodeId, text, fontSize, col, asPrefab, extra) {
  const comp = {
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
    _fontFamily: 'Arial',
    _lineHeight: fontSize + 8,
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
    _outlineColor: color({ r: 8, g: 12, b: 20, a: 200 }),
    _outlineWidth: 3,
    _id: '',
    ...(extra || {}),
  };
  const id = doc.add(comp);
  doc.items[nodeId]._components.push({ __id__: id });
  if (asPrefab) addCompPrefab(doc, comp);
  return id;
}

function addWidget(doc, nodeId, asPrefab) {
  const comp = {
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
  };
  const id = doc.add(comp);
  doc.items[nodeId]._components.push({ __id__: id });
  if (asPrefab) addCompPrefab(doc, comp);
  return id;
}

function matUuid(token) {
  if (token === 'c') return UUID.MatCyan;
  if (token === 'k') return UUID.MatBlack;
  return UUID.MatOrange;
}

function buildBlockPrefab(token, name, uuid) {
  const doc = new Doc();
  const prefabId = doc.add({
    __type__: 'cc.Prefab',
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _native: '',
    data: { __id__: 1 },
    optimizationPolicy: 0,
    persistent: false,
  });
  const root = addNode(doc, { name, sx: 0.42, sy: 0.42, sz: 0.42 });
  addPrefabInfo(doc, root.id, { __id__: prefabId }, true);
  addMeshRenderer(doc, root.id, MESH.cube, matUuid(token), true);
  addScript(doc, root.id, UUID.BlockCell, true);
  write(path.join(ASSETS, `prefabs/${name}.prefab`), doc.json());
  write(path.join(ASSETS, `prefabs/${name}.prefab.meta`), prefabMeta(uuid));
}

function addOctopusParts(doc, rootId, token, asPrefab, assetRef) {
  const mat = matUuid(token);
  const body = addNode(doc, { name: 'Body', parentId: rootId, y: 0.02, sx: 0.4, sy: 0.36, sz: 0.4 });
  if (asPrefab) addPrefabInfo(doc, body.id, assetRef, false);
  addMeshRenderer(doc, body.id, MESH.sphere, mat, asPrefab);
  const bits = [
    { name: 'EyeL', x: -0.09, y: 0.1, z: 0.15, s: 0.09, m: UUID.MatEye },
    { name: 'EyeR', x: 0.09, y: 0.1, z: 0.15, s: 0.09, m: UUID.MatEye },
    { name: 'PupilL', x: -0.09, y: 0.1, z: 0.2, s: 0.045, m: UUID.MatPupil },
    { name: 'PupilR', x: 0.09, y: 0.1, z: 0.2, s: 0.045, m: UUID.MatPupil },
  ];
  for (const p of bits) {
    const n = addNode(doc, { name: p.name, parentId: rootId, x: p.x, y: p.y, z: p.z, sx: p.s, sy: p.s, sz: p.s });
    if (asPrefab) addPrefabInfo(doc, n.id, assetRef, false);
    addMeshRenderer(doc, n.id, MESH.sphere, p.m, asPrefab);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.2;
    const n = addNode(doc, {
      name: `Leg${i}`,
      parentId: rootId,
      x: Math.cos(a) * 0.18,
      y: -0.14,
      z: Math.sin(a) * 0.16,
      sx: 0.12,
      sy: 0.16,
      sz: 0.12,
    });
    if (asPrefab) addPrefabInfo(doc, n.id, assetRef, false);
    addMeshRenderer(doc, n.id, MESH.sphere, mat, asPrefab);
  }
}

function buildUnitPrefab(token, name, uuid) {
  const doc = new Doc();
  const prefabId = doc.add({
    __type__: 'cc.Prefab',
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _native: '',
    data: { __id__: 1 },
    optimizationPolicy: 0,
    persistent: false,
  });
  const root = addNode(doc, { name, sx: 1, sy: 1, sz: 1 });
  const assetRef = { __id__: prefabId };
  addPrefabInfo(doc, root.id, assetRef, true);
  addOctopusParts(doc, root.id, token, true, assetRef);
  addScript(doc, root.id, UUID.UnitActor, true);
  write(path.join(ASSETS, `prefabs/${name}.prefab`), doc.json());
  write(path.join(ASSETS, `prefabs/${name}.prefab.meta`), prefabMeta(uuid));
}

function buildSimplePrefab(name, uuid, builder) {
  const doc = new Doc();
  const prefabId = doc.add({
    __type__: 'cc.Prefab',
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _native: '',
    data: { __id__: 1 },
    optimizationPolicy: 0,
    persistent: false,
  });
  builder(doc, prefabId);
  write(path.join(ASSETS, `prefabs/${name}.prefab`), doc.json());
  write(path.join(ASSETS, `prefabs/${name}.prefab.meta`), prefabMeta(uuid));
}

function wallColor(x, y) {
  if (x <= 2) return 'o';
  if (x <= 4) return 'c';
  if (x <= 8) return 'k';
  if (x <= 10) return 'c';
  return 'o';
}

function buildScene() {
  const doc = new Doc();
  doc.add({
    __type__: 'cc.SceneAsset',
    _name: 'Main',
    _objFlags: 0,
    _native: '',
    scene: { __id__: 1 },
  });
  const sceneKids = [];
  const sceneId = doc.add({
    __type__: 'cc.Scene',
    _name: 'Main',
    _objFlags: 0,
    _parent: null,
    _children: sceneKids,
    _active: true,
    _components: [],
    _prefab: null,
    _lpos: vec3(0, 0, 0),
    _lrot: quat(0, 0, 0, 1),
    _lscale: vec3(1, 1, 1),
    _mobility: 0,
    _layer: LAYER_3D,
    _euler: vec3(0, 0, 0),
    autoReleaseAssets: false,
    _globals: { __id__: 0 },
    _reflectionProbeId: 0,
    _id: UUID.Scene,
  });

  const camQ = quatFromEuler(-32, 28, 0);
  const cam = addNode(doc, {
    name: 'Main Camera',
    parentId: sceneId,
    x: 6.57,
    y: 10.84,
    z: 10.95,
    qx: camQ.x,
    qy: camQ.y,
    qz: camQ.z,
    qw: camQ.w,
    ex: -32,
    ey: 28,
    id: 'skMainCameraNode000001',
  });
  const camComp = {
    __type__: 'cc.Camera',
    _name: '',
    _objFlags: 0,
    node: { __id__: cam.id },
    _enabled: true,
    __prefab: null,
    _projection: 1,
    _priority: 0,
    _fov: 40,
    _fovAxis: 0,
    _orthoHeight: 10,
    _near: 0.1,
    _far: 220,
    _color: color(COLOR.sky),
    _depth: 1,
    _stencil: 0,
    _clearFlags: 7,
    _rect: { __type__: 'cc.Rect', x: 0, y: 0, width: 1, height: 1 },
    _aperture: 19,
    _shutter: 7,
    _iso: 0,
    _screenScale: 1,
    _visibility: 1822425087,
    _targetTexture: null,
    _cameraType: -1,
    _trackingType: 0,
    _id: 'skMainCameraComp00001',
  };
  const camCompId = doc.add(camComp);
  doc.items[cam.id]._components.push({ __id__: camCompId });

  const lightQ = quatFromEuler(-36, 20, 0);
  const light = addNode(doc, {
    name: 'Directional Light',
    parentId: sceneId,
    x: 4,
    y: 10,
    z: 2,
    qx: lightQ.x,
    qy: lightQ.y,
    qz: lightQ.z,
    qw: lightQ.w,
    ex: -36,
    ey: 20,
    id: 'skDirLightNode0000001',
  });
  const staticId = doc.add({
    __type__: 'cc.StaticLightSettings',
    _baked: false,
    _editorOnly: false,
    _bakeable: false,
    _castShadow: false,
  });
  const lightComp = {
    __type__: 'cc.DirectionalLight',
    _name: '',
    _objFlags: 0,
    node: { __id__: light.id },
    _enabled: true,
    __prefab: null,
    _color: color({ r: 255, g: 244, b: 220, a: 255 }),
    _useColorTemperature: false,
    _colorTemperature: 6550,
    _staticSettings: { __id__: staticId },
    _visibility: -325058561,
    _illuminanceHDR: 140000,
    _illuminance: 140000,
    _illuminanceLDR: 4.2,
    _shadowEnabled: false,
    _shadowPcf: 0,
    _shadowBias: 0.00001,
    _shadowNormalBias: 0,
    _shadowSaturation: 1,
    _shadowDistance: 50,
    _shadowInvisibleOcclusionRange: 200,
    _csmLevel: 1,
    _csmLayerLambda: 0.75,
    _csmOptimizationMode: 2,
    _shadowFixedArea: false,
    _shadowNear: 0.1,
    _shadowFar: 10,
    _shadowOrthoSize: 5,
    _id: 'skDirLightComp0000001',
  };
  const lightCompId = doc.add(lightComp);
  doc.items[light.id]._components.push({ __id__: lightCompId });

  const letter = addNode(doc, { name: 'LetterboxCam', parentId: sceneId, id: 'skLetterboxCam0000001' });
  const letterComp = {
    __type__: 'cc.Camera',
    _name: '',
    _objFlags: 0,
    node: { __id__: letter.id },
    _enabled: true,
    __prefab: null,
    _projection: 0,
    _priority: -100,
    _fov: 45,
    _fovAxis: 0,
    _orthoHeight: 10,
    _near: 1,
    _far: 2000,
    _color: color({ r: 0, g: 0, b: 0, a: 255 }),
    _depth: 1,
    _stencil: 0,
    _clearFlags: 7,
    _rect: { __type__: 'cc.Rect', x: 0, y: 0, width: 1, height: 1 },
    _aperture: 19,
    _shutter: 7,
    _iso: 0,
    _screenScale: 1,
    _visibility: 0,
    _targetTexture: null,
    _cameraType: -1,
    _trackingType: 0,
    _id: 'skLetterboxCamComp0001',
  };
  const letterCompId = doc.add(letterComp);
  doc.items[letter.id]._components.push({ __id__: letterCompId });

  const root = addNode(doc, { name: 'GameRoot', parentId: sceneId, id: 'skGameRootNode0000001' });
  addScript(doc, root.id, UUID.GameBootstrap, false);
  doc.items[doc.items[root.id]._components[0].__id__]._id = 'skGameBootstrap000001';

  const world = addNode(doc, { name: 'PlayWorld', parentId: sceneId, id: 'skPlayWorldNode0000001' });
  addScript(doc, world.id, UUID.BattleDirector, false);

  const ground = addNode(doc, {
    name: 'Ground',
    parentId: world.id,
    y: -0.12,
    sx: 22,
    sy: 0.24,
    sz: 24,
  });
  addMeshRenderer(doc, ground.id, MESH.cube, UUID.MatGround, false);

  const pad = addNode(doc, {
    name: 'ArmyPad',
    parentId: world.id,
    y: 0.02,
    z: 3.1,
    sx: 6.4,
    sy: 0.08,
    sz: 4.2,
  });
  addMeshRenderer(doc, pad.id, MESH.cube, UUID.MatPad, false);

  const wall = addNode(doc, { name: 'Wall', parentId: world.id });
  const cols = 13;
  const rows = 9;
  const depth = 2;
  const step = 0.44;
  const startX = -((cols - 1) * step) / 2;
  for (let z = 0; z < depth; z++) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const token = wallColor(x, y + z);
        const n = addNode(doc, {
          name: `Blk_${token}_${x}_${y}_${z}`,
          parentId: wall.id,
          x: startX + x * step,
          y: 0.22 + y * step,
          z: -5.55 - z * step,
          sx: 0.42,
          sy: 0.42,
          sz: 0.42,
        });
        addMeshRenderer(doc, n.id, MESH.cube, matUuid(token), false);
        addScript(doc, n.id, UUID.BlockCell, false);
      }
    }
  }

  const bench = addNode(doc, { name: 'Bench', parentId: world.id });
  const ucols = 4;
  const urows = 4;
  const usx = 0.78;
  const usz = 0.72;
  const uStartX = -((ucols - 1) * usx) / 2;
  let hintX = 0;
  let hintZ = 0;
  UNITS.forEach((pair, i) => {
    const [token, power] = pair;
    const cx = i % ucols;
    const cz = Math.floor(i / ucols);
    const x = uStartX + cx * usx;
    const z = 2.05 + cz * usz;
    if (i === 3) {
      hintX = x;
      hintZ = z;
    }
    const n = addNode(doc, {
      name: `Unit_${String(i).padStart(2, '0')}_${token}_${power}`,
      parentId: bench.id,
      x,
      y: 0.38,
      z,
      sx: 0.5,
      sy: 0.5,
      sz: 0.5,
    });
    addOctopusParts(doc, n.id, token, false, null);
    addScript(doc, n.id, UUID.UnitActor, false);
  });

  const slots = addNode(doc, { name: 'Slots', parentId: world.id });
  for (let i = 0; i < 5; i++) {
    const n = addNode(doc, {
      name: `Slot_${i}`,
      parentId: slots.id,
      x: -2.1 + i * 1.05,
      y: 0.03,
      z: 0.82,
      sx: 0.78,
      sy: 0.045,
      sz: 0.78,
    });
    addMeshRenderer(doc, n.id, MESH.cube, UUID.MatSlot, false);
    addScript(doc, n.id, UUID.SlotPad, false);
  }

  const pool = addNode(doc, { name: 'DebrisPool', parentId: world.id });
  const debrisMats = [UUID.MatOrange, UUID.MatCyan, UUID.MatBlack];
  for (let i = 0; i < 18; i++) {
    const n = addNode(doc, {
      name: `Debris_${i}`,
      parentId: pool.id,
      y: -2,
      sx: 0.12,
      sy: 0.12,
      sz: 0.12,
      active: false,
    });
    addMeshRenderer(doc, n.id, MESH.cube, debrisMats[i % 3], false);
    addScript(doc, n.id, UUID.DebrisBit, false);
  }

  const hand = addNode(doc, {
    name: 'HintHand',
    parentId: world.id,
    x: hintX + 0.18,
    y: 0.92,
    z: hintZ + 0.22,
    ex: -20,
    ey: 15,
    id: 'skHintHandNode0000001',
  });
  const hq = quatFromEuler(-20, 15, 0);
  doc.items[hand.id]._lrot = quat(hq.x, hq.y, hq.z, hq.w);
  addScript(doc, hand.id, UUID.HintHandScript, false);
  const palm = addNode(doc, { name: 'Palm', parentId: hand.id, sx: 0.22, sy: 0.08, sz: 0.28 });
  addMeshRenderer(doc, palm.id, MESH.cube, UUID.MatSkin, false);
  for (let i = 0; i < 4; i++) {
    const f = addNode(doc, {
      name: `Finger${i}`,
      parentId: hand.id,
      x: -0.09 + i * 0.06,
      y: 0.02,
      z: 0.22,
      sx: 0.045,
      sy: 0.045,
      sz: 0.16,
    });
    addMeshRenderer(doc, f.id, MESH.cube, UUID.MatSkin, false);
  }

  const canvas = addNode(doc, {
    name: 'Canvas',
    parentId: sceneId,
    x: 540,
    y: 960,
    layer: LAYER_UI,
    id: 'skCanvasNode000000001',
  });
  addUITransform(doc, canvas.id, 1080, 1920, false);
  const canvasComp = {
    __type__: 'cc.Canvas',
    _name: '',
    _objFlags: 0,
    node: { __id__: canvas.id },
    _enabled: true,
    __prefab: null,
    _cameraComponent: null,
    _alignCanvasWithScreen: false,
    _id: 'skCanvasComp000000001',
  };
  const canvasCompId = doc.add(canvasComp);
  doc.items[canvas.id]._components.push({ __id__: canvasCompId });
  // Canvas Widget on a 3D scene parent zeros the UI size — size is set in GameBootstrap.

  const uiCam = addNode(doc, {
    name: 'UiCamera',
    parentId: canvas.id,
    z: 1000,
    layer: LAYER_UI,
    id: 'skUiCameraNode0000001',
  });
  const uiCamComp = {
    __type__: 'cc.Camera',
    _name: '',
    _objFlags: 0,
    node: { __id__: uiCam.id },
    _enabled: true,
    __prefab: null,
    _projection: 0,
    _priority: 10,
    _fov: 45,
    _fovAxis: 0,
    _orthoHeight: 960,
    _near: 0,
    _far: 2000,
    _color: color({ r: 0, g: 0, b: 0, a: 255 }),
    _depth: 1,
    _stencil: 0,
    _clearFlags: 6,
    _rect: { __type__: 'cc.Rect', x: 0, y: 0, width: 1, height: 1 },
    _aperture: 19,
    _shutter: 7,
    _iso: 0,
    _screenScale: 1,
    _visibility: LAYER_UI,
    _targetTexture: null,
    _cameraType: -1,
    _trackingType: 0,
    _id: 'skUiCameraComp0000001',
  };
  const uiCamCompId = doc.add(uiCamComp);
  doc.items[uiCam.id]._components.push({ __id__: uiCamCompId });
  canvasComp._cameraComponent = { __id__: uiCamCompId };

  const touch = addNode(doc, { name: 'TouchPad', parentId: canvas.id, layer: LAYER_UI });
  addUITransform(doc, touch.id, 1080, 1920, false);

  const home = addNode(doc, { name: 'HomePanel', parentId: canvas.id, layer: LAYER_UI });
  addUITransform(doc, home.id, 1080, 1920, false);
  addWidget(doc, home.id, false);
  addScript(doc, home.id, UUID.HomePanel, false);
  const veil = addNode(doc, { name: 'Veil', parentId: home.id, layer: LAYER_UI });
  addUITransform(doc, veil.id, 1080, 1920, false);
  addSprite(doc, veil.id, { r: 12, g: 28, b: 40, a: 120 }, false);
  const content = addNode(doc, { name: 'Content', parentId: home.id, layer: LAYER_UI });
  addUITransform(doc, content.id, 1080, 1920, false);
  const title = addNode(doc, { name: 'Title', parentId: content.id, y: 680, layer: LAYER_UI });
  addUITransform(doc, title.id, 720, 120, false);
  addLabel(doc, title.id, 'SUCK', 96, { r: 255, g: 248, b: 230, a: 255 }, false);
  const sub = addNode(doc, { name: 'Subtitle', parentId: content.id, y: 580, layer: LAYER_UI });
  addUITransform(doc, sub.id, 800, 56, false);
  addLabel(doc, sub.id, '同色拆墙  ·  拖到圆圈出击', 34, { r: 40, g: 70, b: 88, a: 230 }, false);
  const play = addNode(doc, { name: 'PlayBtn', parentId: content.id, y: -140, layer: LAYER_UI });
  addUITransform(doc, play.id, 420, 140, false);
  addSprite(doc, play.id, { r: 245, g: 165, b: 74, a: 255 }, false);
  const playLab = addNode(doc, { name: 'Label', parentId: play.id, layer: LAYER_UI });
  addUITransform(doc, playLab.id, 420, 140, false);
  addLabel(doc, playLab.id, 'PLAY', 64, { r: 42, g: 28, b: 16, a: 255 }, false);
  const setBtn = addNode(doc, { name: 'SettingsBtn', parentId: content.id, x: 452, y: 872, layer: LAYER_UI });
  addUITransform(doc, setBtn.id, 112, 112, false);
  addSprite(doc, setBtn.id, { r: 36, g: 58, b: 72, a: 230 }, false);
  const setLab = addNode(doc, { name: 'Label', parentId: setBtn.id, layer: LAYER_UI });
  addUITransform(doc, setLab.id, 112, 112, false);
  addLabel(doc, setLab.id, 'SET', 32, { r: 230, g: 244, b: 248, a: 255 }, false);
  const foot = addNode(doc, { name: 'Footer', parentId: content.id, y: -900, layer: LAYER_UI });
  addUITransform(doc, foot.id, 800, 40, false);
  addLabel(doc, foot.id, '拖拽合成  ·  对色加倍', 24, { r: 70, g: 100, b: 116, a: 220 }, false);

  const settings = addNode(doc, { name: 'SettingsPanel', parentId: canvas.id, layer: LAYER_UI, active: false });
  addUITransform(doc, settings.id, 1080, 1920, false);
  addWidget(doc, settings.id, false);
  addScript(doc, settings.id, UUID.SettingsPanel, false);
  const dim = addNode(doc, { name: 'Dim', parentId: settings.id, layer: LAYER_UI });
  addUITransform(doc, dim.id, 1080, 1920, false);
  addSprite(doc, dim.id, { r: 12, g: 28, b: 40, a: 150 }, false);
  const card = addNode(doc, { name: 'Card', parentId: settings.id, y: 40, layer: LAYER_UI });
  addUITransform(doc, card.id, 860, 720, false);
  addSprite(doc, card.id, { r: 20, g: 40, b: 54, a: 235 }, false);
  const st = addNode(doc, { name: 'Title', parentId: card.id, y: 260, layer: LAYER_UI });
  addUITransform(doc, st.id, 700, 80, false);
  addLabel(doc, st.id, 'SETTINGS', 56, { r: 255, g: 248, b: 230, a: 255 }, false);
  const sb = addNode(doc, { name: 'Body', parentId: card.id, y: 40, layer: LAYER_UI });
  addUITransform(doc, sb.id, 760, 160, false);
  addLabel(doc, sb.id, '拖章鱼到圆圈开始拆墙\n同色合成，对色伤害更高', 32, { r: 180, g: 210, b: 220, a: 230 }, false);
  const close = addNode(doc, { name: 'CloseBtn', parentId: settings.id, x: 452, y: 872, layer: LAYER_UI });
  addUITransform(doc, close.id, 112, 112, false);
  addSprite(doc, close.id, { r: 36, g: 58, b: 72, a: 230 }, false);
  const cl = addNode(doc, { name: 'Label', parentId: close.id, layer: LAYER_UI });
  addUITransform(doc, cl.id, 112, 112, false);
  addLabel(doc, cl.id, 'BACK', 28, { r: 230, g: 244, b: 248, a: 255 }, false);

  const hud = addNode(doc, { name: 'PlayHud', parentId: canvas.id, layer: LAYER_UI, active: false });
  addUITransform(doc, hud.id, 0, 0, false);
  addScript(doc, hud.id, UUID.PlayHud, false);
  const back = addNode(doc, { name: 'BackBtn', parentId: hud.id, x: -420, y: 860, layer: LAYER_UI });
  addUITransform(doc, back.id, 160, 80, false);
  addSprite(doc, back.id, { r: 36, g: 58, b: 72, a: 230 }, false);
  const bl = addNode(doc, { name: 'Label', parentId: back.id, layer: LAYER_UI });
  addUITransform(doc, bl.id, 160, 80, false);
  addLabel(doc, bl.id, 'HOME', 32, { r: 230, g: 244, b: 248, a: 255 }, false);
  const tip = addNode(doc, { name: 'Tip', parentId: hud.id, y: 860, layer: LAYER_UI });
  addUITransform(doc, tip.id, 720, 48, false);
  addLabel(doc, tip.id, '拖到圆圈出击  ·  同色合成', 28, { r: 40, g: 70, b: 88, a: 230 }, false);
  const win = addNode(doc, { name: 'WinLabel', parentId: hud.id, y: 80, layer: LAYER_UI, active: false });
  addUITransform(doc, win.id, 800, 80, false);
  addLabel(doc, win.id, '墙体已拆完', 56, { r: 255, g: 248, b: 230, a: 255 }, false);
  const powers = addNode(doc, { name: 'Powers', parentId: hud.id, layer: LAYER_UI });
  addUITransform(doc, powers.id, 0, 0, false);
  UNITS.forEach((pair, i) => {
    const n = addNode(doc, {
      name: `Power_${String(i).padStart(2, '0')}`,
      parentId: powers.id,
      layer: LAYER_UI,
    });
    addUITransform(doc, n.id, 80, 36, false);
    addLabel(doc, n.id, String(pair[1]), 26, { r: 255, g: 255, b: 255, a: 255 }, false);
  });

  const globalsId = doc.add({
    __type__: 'cc.SceneGlobals',
    ambient: { __id__: 0 },
    shadows: { __id__: 0 },
    _skybox: { __id__: 0 },
    fog: { __id__: 0 },
    octree: { __id__: 0 },
    lightProbeInfo: { __id__: 0 },
    skin: { __id__: 0 },
  });
  const ambientId = doc.add({
    __type__: 'cc.AmbientInfo',
    _skyColorHDR: { __type__: 'cc.Vec4', x: 0.62, y: 0.82, z: 0.9, w: 0.55 },
    _skyIllumHDR: 60000,
    _skyIllum: 60000,
    _groundAlbedoHDR: { __type__: 'cc.Vec4', x: 0.45, y: 0.62, z: 0.7, w: 1 },
    _skyColorLDR: { __type__: 'cc.Vec4', x: 0.62, y: 0.82, z: 0.9, w: 1 },
    _skyIllumLDR: 2.6,
    _groundAlbedoLDR: { __type__: 'cc.Vec4', x: 0.45, y: 0.62, z: 0.7, w: 1 },
  });
  const shadowsId = doc.add({
    __type__: 'cc.ShadowsInfo',
    _enabled: false,
    _type: 0,
    _normal: vec3(0, 1, 0),
    _distance: 0,
    _shadowColor: color({ r: 0, g: 0, b: 0, a: 255 }),
    _maxReceived: 4,
    _size: { __type__: 'cc.Vec2', x: 512, y: 512 },
  });
  const skyId = doc.add({
    __type__: 'cc.SkyboxInfo',
    _envLightingType: 0,
    _envmapHDR: null,
    _envmap: null,
    _envmapLDR: null,
    _diffuseMapHDR: null,
    _diffuseMapLDR: null,
    _enabled: false,
    _useHDR: true,
    _editableMaterial: null,
    _reflectionHDR: null,
    _reflectionLDR: null,
    _rotationAngle: 0,
  });
  const fogId = doc.add({
    __type__: 'cc.FogInfo',
    _type: 0,
    _fogColor: color({ r: 0, g: 0, b: 0, a: 255 }),
    _enabled: false,
    _fogDensity: 0.3,
    _fogStart: 0.5,
    _fogEnd: 300,
    _fogAtten: 5,
    _fogTop: 1.5,
    _fogRange: 1.2,
    _accurate: false,
  });
  const octreeId = doc.add({
    __type__: 'cc.OctreeInfo',
    _enabled: false,
    _minPos: vec3(-1024, -1024, -1024),
    _maxPos: vec3(1024, 1024, 1024),
    _depth: 8,
  });
  const probeId = doc.add({
    __type__: 'cc.LightProbeInfo',
    _giScale: 1,
    _giSamples: 1024,
    _bounces: 2,
    _reduceRinging: 0,
    _showProbe: true,
    _showWireframe: true,
    _showConvex: false,
    _data: null,
    _lightProbeSphereVolume: 1,
  });
  const skinId = doc.add({
    __type__: 'cc.SkinInfo',
    _enabled: false,
    _scale: 5,
  });
  doc.items[globalsId].ambient = { __id__: ambientId };
  doc.items[globalsId].shadows = { __id__: shadowsId };
  doc.items[globalsId]._skybox = { __id__: skyId };
  doc.items[globalsId].fog = { __id__: fogId };
  doc.items[globalsId].octree = { __id__: octreeId };
  doc.items[globalsId].lightProbeInfo = { __id__: probeId };
  doc.items[globalsId].skin = { __id__: skinId };
  doc.items[sceneId]._globals = { __id__: globalsId };

  write(path.join(ASSETS, 'scenes/Main.scene'), doc.json());
}

function main() {
  write(path.join(ASSETS, 'materials.meta'), dirMeta(UUID.dirMaterials));
  write(path.join(ASSETS, 'prefabs.meta'), dirMeta(UUID.dirPrefabs));
  write(path.join(ASSETS, 'prefabs/ui.meta'), dirMeta(UUID.dirPrefabsUi));
  write(path.join(ASSETS, 'scripts/battle.meta'), dirMeta(UUID.dirBattle));

  const mats = [
    ['MatOrange', UUID.MatOrange, COLOR.o],
    ['MatCyan', UUID.MatCyan, COLOR.c],
    ['MatBlack', UUID.MatBlack, COLOR.k],
    ['MatGround', UUID.MatGround, COLOR.ground],
    ['MatSlot', UUID.MatSlot, COLOR.slot],
    ['MatEye', UUID.MatEye, COLOR.eye],
    ['MatPupil', UUID.MatPupil, COLOR.pupil],
    ['MatSkin', UUID.MatSkin, COLOR.skin],
    ['MatPad', UUID.MatPad, COLOR.pad],
  ];
  if (!process.argv.includes('--prefabs-only')) {
    for (const [name, uuid, col] of mats) {
      write(path.join(ASSETS, `materials/${name}.mtl`), material(name, col));
      write(path.join(ASSETS, `materials/${name}.mtl.meta`), mtlMeta(uuid));
    }
  }

  write(path.join(ASSETS, 'scripts/battle/BlockCell.ts.meta'), tsMeta(UUID.BlockCell));
  write(path.join(ASSETS, 'scripts/battle/UnitActor.ts.meta'), tsMeta(UUID.UnitActor));
  write(path.join(ASSETS, 'scripts/battle/SlotPad.ts.meta'), tsMeta(UUID.SlotPad));
  write(path.join(ASSETS, 'scripts/battle/DebrisBit.ts.meta'), tsMeta(UUID.DebrisBit));
  write(path.join(ASSETS, 'scripts/battle/BattleDirector.ts.meta'), tsMeta(UUID.BattleDirector));
  write(path.join(ASSETS, 'scripts/battle/HintHand.ts.meta'), tsMeta(UUID.HintHandScript));
  write(path.join(ASSETS, 'scripts/view/PlayHud.ts.meta'), tsMeta(UUID.PlayHud));

  // Block/Unit prefabs are baked by tools/bake-toy-prefabs.js (real meshes, all colors).

  buildSimplePrefab('Slot', UUID.Slot, (doc, prefabId) => {
    const root = addNode(doc, { name: 'Slot', sx: 0.78, sy: 0.045, sz: 0.78 });
    addPrefabInfo(doc, root.id, { __id__: prefabId }, true);
    addMeshRenderer(doc, root.id, MESH.cube, UUID.MatSlot, true);
    addScript(doc, root.id, UUID.SlotPad, true);
  });
  buildSimplePrefab('Ground', UUID.Ground, (doc, prefabId) => {
    const root = addNode(doc, { name: 'Ground', sx: 22, sy: 0.24, sz: 24 });
    addPrefabInfo(doc, root.id, { __id__: prefabId }, true);
    addMeshRenderer(doc, root.id, MESH.cube, UUID.MatGround, true);
  });
  buildSimplePrefab('Debris', UUID.Debris, (doc, prefabId) => {
    const root = addNode(doc, { name: 'Debris', sx: 0.12, sy: 0.12, sz: 0.12 });
    addPrefabInfo(doc, root.id, { __id__: prefabId }, true);
    addMeshRenderer(doc, root.id, MESH.cube, UUID.MatOrange, true);
    addScript(doc, root.id, UUID.DebrisBit, true);
  });
  buildSimplePrefab('HintHand', UUID.HintHand, (doc, prefabId) => {
    const root = addNode(doc, { name: 'HintHand' });
    const assetRef = { __id__: prefabId };
    addPrefabInfo(doc, root.id, assetRef, true);
    addScript(doc, root.id, UUID.HintHandScript, true);
    const palm = addNode(doc, { name: 'Palm', parentId: root.id, sx: 0.22, sy: 0.08, sz: 0.28 });
    addPrefabInfo(doc, palm.id, assetRef, false);
    addMeshRenderer(doc, palm.id, MESH.cube, UUID.MatSkin, true);
    for (let i = 0; i < 4; i++) {
      const f = addNode(doc, {
        name: `Finger${i}`,
        parentId: root.id,
        x: -0.09 + i * 0.06,
        y: 0.02,
        z: 0.22,
        sx: 0.045,
        sy: 0.045,
        sz: 0.16,
      });
      addPrefabInfo(doc, f.id, assetRef, false);
      addMeshRenderer(doc, f.id, MESH.cube, UUID.MatSkin, true);
    }
  });

  if (!process.argv.includes('--prefabs-only')) {
    buildScene();
    console.log('generated materials, prefabs, Main.scene');
  } else {
    console.log('generated prefabs only');
  }
}

main();
