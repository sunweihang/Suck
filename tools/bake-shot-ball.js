'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LAYER_UI3D = 33554432;
const INK_SHOT = '8c01a1b0-4e21-4f3a-9c11-010000000034';
const PREFAB = '7e22bb20-0035-4b02-8002-000000000035';
const MAT = '9d11aa10-00d0-4a01-8001-0000000000d0';
const MAT_TAIL = '9d11aa10-00d1-4a01-8001-0000000000d1';
const MESH_BALL = '7e22bb20-0313-4b02-8002-000000000003@642dc';
const FX_STD = 'c8f66d17-351a-48da-a12c-0212d28575c4';

function compressUuid(uuid) {
  const rest = uuid.slice(5).replace(/-/g, '');
  let out = uuid.replace(/-/g, '').slice(0, 5);
  for (let i = 0; i < rest.length; i += 3) {
    const n = parseInt(rest.slice(i, i + 3), 16);
    out += BASE64[(n >> 6) & 63] + BASE64[n & 63];
  }
  return out;
}

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`);
}

function glowMat(name, emit) {
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
        mainColor: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
        roughness: 0.1,
        metallic: 0,
        emissive: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
        emissiveScale: { __type__: 'cc.Vec3', x: emit, y: emit, z: emit },
      },
      {},
      {},
    ],
  };
}

class Doc {
  constructor() { this.items = []; }
  add(obj) { const id = this.items.length; this.items.push(obj); return id; }
  json() { return `${JSON.stringify(this.items, null, 2)}\n`; }
}

function vec3(x, y, z) { return { __type__: 'cc.Vec3', x, y, z }; }
function quat(x, y, z, w) { return { __type__: 'cc.Quat', x, y, z, w }; }
let fid = 1;
function fileId(tag) { return `${tag}${String(fid++).padStart(8, '0')}xxxxxxxxxxxx`.slice(0, 22); }

function addNode(doc, opts) {
  const id = doc.add({
    __type__: 'cc.Node',
    _name: opts.name,
    _objFlags: 0,
    __editorExtras__: {},
    _parent: opts.parentId == null ? null : { __id__: opts.parentId },
    _children: [],
    _active: true,
    _components: [],
    _prefab: null,
    _lpos: vec3(opts.x || 0, opts.y || 0, opts.z || 0),
    _lrot: quat(0, 0, 0, 1),
    _lscale: vec3(opts.sx ?? 1, opts.sy ?? 1, opts.sz ?? 1),
    _mobility: 0,
    _layer: LAYER_UI3D,
    _euler: vec3(0, 0, 0),
    _id: '',
  });
  if (opts.parentId != null) doc.items[opts.parentId]._children.push({ __id__: id });
  return { id };
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

function addMeshRenderer(doc, nodeId, mesh, mat) {
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
    _shadowReceivingMode: 0,
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
  addCompPrefab(doc, mr);
}

function addScript(doc, nodeId, uuid) {
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
  addCompPrefab(doc, comp);
}

write(path.join(ASSETS, 'materials/MatShot.mtl'), glowMat('MatShot', 1.35));
write(path.join(ASSETS, 'materials/MatShot.mtl.meta'), {
  ver: '1.0.21', importer: 'material', imported: true, uuid: MAT, files: ['.json'], subMetas: {}, userData: {},
});
write(path.join(ASSETS, 'materials/MatShotTail.mtl'), glowMat('MatShotTail', 1.55));
write(path.join(ASSETS, 'materials/MatShotTail.mtl.meta'), {
  ver: '1.0.21', importer: 'material', imported: true, uuid: MAT_TAIL, files: ['.json'], subMetas: {}, userData: {},
});

const doc = new Doc();
const prefabId = doc.add({
  __type__: 'cc.Prefab',
  _name: 'InkShot',
  _objFlags: 0,
  __editorExtras__: {},
  _native: '',
  data: { __id__: 1 },
  optimizationPolicy: 0,
  persistent: false,
});
const root = addNode(doc, { name: 'InkShot' });
const assetRef = { __id__: prefabId };
addPrefabInfo(doc, root.id, assetRef, true);
addScript(doc, root.id, INK_SHOT);

const ball = addNode(doc, { name: 'Ball', parentId: root.id, sx: 0.16, sy: 0.16, sz: 0.16 });
addPrefabInfo(doc, ball.id, assetRef, false);
addMeshRenderer(doc, ball.id, MESH_BALL, MAT);

const trail = addNode(doc, { name: 'Trail', parentId: root.id, z: -0.22, sx: 0.08, sy: 0.08, sz: 0.55 });
addPrefabInfo(doc, trail.id, assetRef, false);
addMeshRenderer(doc, trail.id, MESH_BALL, MAT_TAIL);

write(path.join(ASSETS, 'prefabs/fx/InkShot.prefab'), doc.json());
write(path.join(ASSETS, 'prefabs/fx/InkShot.prefab.meta'), {
  ver: '1.1.50',
  importer: 'prefab',
  imported: true,
  uuid: PREFAB,
  files: ['.json'],
  subMetas: {},
  userData: { syncNodeName: 'InkShot' },
});
console.log('wrote InkShot ball+trail prefab');
