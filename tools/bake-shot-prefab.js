'use strict';

/**
 * Bake the video-matching white tracer bullet: glow texture, unlit mats, crossed-quad mesh, InkShot prefab.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const FX_UNLIT = 'a3cd009f-0ab0-420d-9278-b9fdab939bbc';
const LAYER_UI3D = 33554432;
const INK_SHOT = '8c01a1b0-4e21-4f3a-9c11-010000000034';

const UUID = {
  prefab: '7e22bb20-0035-4b02-8002-000000000035',
  tex: '9d12cc10-0400-4a01-8001-000000000040',
  mat: '9d11aa10-00d0-4a01-8001-0000000000d0',
  matTail: '9d11aa10-00d1-4a01-8001-0000000000d1',
  gltf: '7e22bb20-0317-4b02-8002-000000000007',
};

const MESH_ID = 'a7e21';
const MESH = `${UUID.gltf}@${MESH_ID}`;

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
  if (Buffer.isBuffer(data) || typeof data === 'string') {
    fs.writeFileSync(file, data);
    return;
  }
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function writeRgbaPng(file, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  write(file, png);
}

function drawStreak(w, h) {
  const rgba = Buffer.alloc(w * h * 4);
  const cx = (w - 1) * 0.5;
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    const tip = Math.min(v / 0.1, (1 - v) / 0.22);
    const along = Math.max(0, Math.min(1, tip));
    const core = Math.pow(along, 0.55);
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / (w * 0.16);
      const radial = Math.exp(-dx * dx * 3.4);
      const a = Math.min(255, Math.round(255 * radial * core * 1.2));
      const o = (y * w + x) * 4;
      rgba[o] = 255;
      rgba[o + 1] = 255;
      rgba[o + 2] = 255;
      rgba[o + 3] = a;
    }
  }
  return rgba;
}

function imageMeta(uuid, name) {
  const tex = `${uuid}@6c48a`;
  return {
    ver: '1.0.27',
    importer: 'image',
    imported: true,
    uuid,
    files: ['.json', '.png'],
    subMetas: {
      '6c48a': {
        importer: 'texture',
        uuid: tex,
        displayName: name,
        id: '6c48a',
        name: 'texture',
        userData: {
          wrapModeS: 'clamp-to-edge',
          wrapModeT: 'clamp-to-edge',
          minfilter: 'linear',
          magfilter: 'linear',
          mipfilter: 'none',
          anisotropy: 0,
          isUuid: true,
          imageUuidOrDatabaseUri: uuid,
          visible: false,
        },
        ver: '1.0.22',
        imported: true,
        files: ['.json'],
        subMetas: {},
      },
    },
    userData: {
      type: 'texture',
      fixAlphaTransparencyArtifacts: false,
      hasAlpha: true,
      redirect: tex,
    },
  };
}

function unlitMat(name, alpha) {
  return {
    __type__: 'cc.Material',
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _native: '',
    _effectAsset: { __uuid__: FX_UNLIT, __expectedType__: 'cc.EffectAsset' },
    _techIdx: 1,
    _defines: [{}, { USE_TEXTURE: true }, {}],
    _states: [
      {},
      {
        rasterizerState: { cullMode: 0 },
        depthStencilState: { depthTest: true, depthWrite: false },
        blendState: { targets: [{ blend: true, blendSrc: 2, blendDst: 1 }] },
      },
      {},
    ],
    _props: [
      {},
      {
        mainTexture: { __uuid__: `${UUID.tex}@6c48a`, __expectedType__: 'cc.Texture2D' },
        mainColor: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: alpha },
      },
      {},
    ],
  };
}

function mtlMeta(uuid) {
  return { ver: '1.0.21', importer: 'material', imported: true, uuid, files: ['.json'], subMetas: {}, userData: {} };
}

function prefabMeta(uuid, name) {
  return { ver: '1.1.50', importer: 'prefab', imported: true, uuid, files: ['.json'], subMetas: {}, userData: { syncNodeName: name } };
}

function gltfMeta(uuid) {
  const meshUuid = `${uuid}@${MESH_ID}`;
  return {
    ver: '2.3.14',
    importer: 'gltf',
    imported: true,
    uuid,
    files: ['.json'],
    subMetas: {
      [MESH_ID]: {
        importer: 'gltf-mesh',
        uuid: meshUuid,
        displayName: 'ShotStreak',
        id: MESH_ID,
        name: 'ShotStreak.mesh',
        userData: { gltfIndex: 0, triangleCount: 4 },
        ver: '1.1.1',
        imported: true,
        files: ['.bin', '.json'],
        subMetas: {},
      },
    },
    userData: {
      imageUuids: [],
      imageMetas: [],
      allowMeshDataAccess: true,
      addVertexColor: false,
      assetFinder: {
        meshes: [meshUuid],
        skeletons: [],
        textures: [],
        materials: [],
        scenes: [],
      },
    },
  };
}

function bakeCrossQuad(halfW, tail, head) {
  const p = [];
  const n = [];
  const u = [];
  const i = [];
  function quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz) {
    const b = p.length / 3;
    p.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
    n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
    u.push(0, 0, 1, 0, 0, 1, 1, 1);
    i.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  quad(-halfW, 0, -tail, halfW, 0, -tail, -halfW, 0, head, halfW, 0, head, 0, 1, 0);
  quad(0, -halfW, -tail, 0, halfW, -tail, 0, -halfW, head, 0, halfW, head, 1, 0, 0);
  return {
    p,
    n,
    u,
    i,
    min: [-halfW, -halfW, -tail],
    max: [halfW, halfW, head],
    r: Math.hypot(halfW, halfW, Math.max(tail, head)),
  };
}

function writeGltf(fileBase, name, mesh, uuid) {
  const vcount = mesh.p.length / 3;
  const pos = Buffer.alloc(vcount * 12);
  const nrm = Buffer.alloc(vcount * 12);
  const uv = Buffer.alloc(vcount * 8);
  const idx = Buffer.alloc(mesh.i.length * 2);
  for (let i = 0; i < vcount; i++) {
    pos.writeFloatLE(mesh.p[i * 3], i * 12);
    pos.writeFloatLE(mesh.p[i * 3 + 1], i * 12 + 4);
    pos.writeFloatLE(mesh.p[i * 3 + 2], i * 12 + 8);
    nrm.writeFloatLE(mesh.n[i * 3], i * 12);
    nrm.writeFloatLE(mesh.n[i * 3 + 1], i * 12 + 4);
    nrm.writeFloatLE(mesh.n[i * 3 + 2], i * 12 + 8);
    uv.writeFloatLE(mesh.u[i * 2], i * 8);
    uv.writeFloatLE(mesh.u[i * 2 + 1], i * 8 + 4);
  }
  for (let i = 0; i < mesh.i.length; i++) idx.writeUInt16LE(mesh.i[i], i * 2);
  const pad = (4 - (idx.length % 4)) % 4;
  const bin = Buffer.concat([pos, nrm, uv, idx, Buffer.alloc(pad)]);
  const gltf = {
    asset: { version: '2.0', generator: 'bake-shot-prefab' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [{
      name,
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3 }],
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: vcount, type: 'VEC3', min: mesh.min, max: mesh.max },
      { bufferView: 1, componentType: 5126, count: vcount, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: vcount, type: 'VEC2' },
      { bufferView: 3, componentType: 5123, count: mesh.i.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.length, target: 34962 },
      { buffer: 0, byteOffset: pos.length, byteLength: nrm.length, target: 34962 },
      { buffer: 0, byteOffset: pos.length + nrm.length, byteLength: uv.length, target: 34962 },
      { buffer: 0, byteOffset: pos.length + nrm.length + uv.length, byteLength: idx.length, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length, uri: `data:application/octet-stream;base64,${bin.toString('base64')}` }],
  };
  write(`${fileBase}.gltf`, `${JSON.stringify(gltf, null, 2)}\n`);
  write(`${fileBase}.gltf.meta`, gltfMeta(uuid));
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

let fid = 1;
function fileId(tag) {
  return `${tag}${String(fid++).padStart(8, '0')}xxxxxxxxxxxx`.slice(0, 22);
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
    _prefab: null,
    _lpos: vec3(opts.x || 0, opts.y || 0, opts.z || 0),
    _lrot: quat(0, 0, 0, 1),
    _lscale: vec3(opts.sx == null ? 1 : opts.sx, opts.sy == null ? 1 : opts.sy, opts.sz == null ? 1 : opts.sz),
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

function buildPrefab() {
  fid = 1;
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

  const body = addNode(doc, { name: 'Body', parentId: root.id, sx: 1, sy: 1, sz: 1 });
  addPrefabInfo(doc, body.id, assetRef, false);
  addMeshRenderer(doc, body.id, MESH, UUID.mat);

  const tail = addNode(doc, { name: 'Tail', parentId: root.id, z: -0.07, sx: 0.72, sy: 0.72, sz: 1.55 });
  addPrefabInfo(doc, tail.id, assetRef, false);
  addMeshRenderer(doc, tail.id, MESH, UUID.matTail);

  write(path.join(ASSETS, 'prefabs/fx/InkShot.prefab'), doc.json());
  write(path.join(ASSETS, 'prefabs/fx/InkShot.prefab.meta'), prefabMeta(UUID.prefab, 'InkShot'));
}

const texW = 64;
const texH = 256;
writeRgbaPng(path.join(ASSETS, 'art/vfx/textures/shot-streak.png'), texW, texH, drawStreak(texW, texH));
write(path.join(ASSETS, 'art/vfx/textures/shot-streak.png.meta'), imageMeta(UUID.tex, 'shot-streak'));

write(path.join(ASSETS, 'materials/MatShot.mtl'), unlitMat('MatShot', 255));
write(path.join(ASSETS, 'materials/MatShot.mtl.meta'), mtlMeta(UUID.mat));
write(path.join(ASSETS, 'materials/MatShotTail.mtl'), unlitMat('MatShotTail', 150));
write(path.join(ASSETS, 'materials/MatShotTail.mtl.meta'), mtlMeta(UUID.matTail));

writeGltf(path.join(ASSETS, 'models/shot-streak'), 'ShotStreak', bakeCrossQuad(0.02, 0.14, 0.08), UUID.gltf);
buildPrefab();

console.log('wrote InkShot prefab + streak mesh/mats');
