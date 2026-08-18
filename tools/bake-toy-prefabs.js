'use strict';

/**
 * Bake candy block + octopus meshes into assets and per-color prefabs.
 * Runtime should instantiate these prefabs instead of generating meshes.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const FX_STD = 'c8f66d17-351a-48da-a12c-0212d28575c4';
const FX_UNLIT = 'a3cd009f-0ab0-420d-9278-b9fdab939bbc';
const LAYER_3D = 1073741824;

const UUID = {
  BlockCell: '8c01a1b0-4e21-4f3a-9c11-010000000001',
  UnitActor: '8c01a1b0-4e21-4f3a-9c11-010000000002',
  ToyLook: '8c01a1b0-4e21-4f3a-9c11-01000000000b',
  MatEye: '9d11aa10-0006-4a01-8001-000000000006',
  MatPupil: '9d11aa10-0007-4a01-8001-000000000007',
  MatSucker: '9d11aa10-0008-4a01-8001-000000000008',
  MatCheek: '9d11aa10-0009-4a01-8001-000000000009',
  MatHighlight: '9d11aa10-000a-4a01-8001-00000000000a',
  MeshBlockJson: '7e22bb20-0301-4b02-8002-000000000001',
  MeshOctopusJson: '7e22bb20-0302-4b02-8002-000000000002',
  MeshBallJson: '7e22bb20-0303-4b02-8002-000000000003',
  MeshPowerJson: '7e22bb20-0304-4b02-8002-000000000004',
  MeshBellyJson: '7e22bb20-0305-4b02-8002-000000000005',
  MeshSuckersJson: '7e22bb20-0306-4b02-8002-000000000006',
  MeshCylinderJson: '7e22bb20-0307-4b02-8002-000000000007',
  MeshMouthJson: '7e22bb20-0308-4b02-8002-000000000008',
  GltfBlock: '7e22bb20-0311-4b02-8002-000000000001',
  GltfOctopus: '7e22bb20-0312-4b02-8002-000000000002',
  GltfBall: '7e22bb20-0313-4b02-8002-000000000003',
  GltfPower: '7e22bb20-0314-4b02-8002-000000000004',
  GltfBelly: '7e22bb20-0315-4b02-8002-000000000005',
  GltfSuckers: '7e22bb20-0316-4b02-8002-000000000006',
  GltfCylinder: '7e22bb20-0317-4b02-8002-000000000007',
  GltfMouth: '7e22bb20-0318-4b02-8002-000000000008',
  dirModels: 'c0110001-0001-4001-8001-000000000010',
  dirMeshes: 'c0110001-0001-4001-8001-000000000011',
};

const MESH_BLOCK = `${UUID.GltfBlock}@e1d15`;
const MESH_OCTOPUS = `${UUID.GltfOctopus}@9d64e`;
const MESH_BALL = `${UUID.GltfBall}@642dc`;
const MESH_POWER = `${UUID.GltfPower}@cc693`;
const MESH_BELLY = `${UUID.GltfBelly}@a2b3c`;
const MESH_SUCKERS = `${UUID.GltfSuckers}@b3c4d`;
const MESH_CYLINDER = `${UUID.GltfCylinder}@c711d`;
const MESH_MOUTH = `${UUID.GltfMouth}@d822e`;
const MESH_ID = {
  [UUID.GltfBlock]: { id: 'e1d15', name: 'ToyBlock', tris: 300 },
  [UUID.GltfOctopus]: { id: '9d64e', name: 'ToyOctopus', tris: 1800 },
  [UUID.GltfBall]: { id: '642dc', name: 'ToyBall', tris: 192 },
  [UUID.GltfPower]: { id: 'cc693', name: 'ToyPower', tris: 2 },
  [UUID.GltfBelly]: { id: 'a2b3c', name: 'ToyBelly', tris: 224 },
  [UUID.GltfSuckers]: { id: 'b3c4d', name: 'ToySuckers', tris: 480 },
  [UUID.GltfCylinder]: { id: 'c711d', name: 'ToyCylinder', tris: 64 },
  [UUID.GltfMouth]: { id: 'd822e', name: 'ToyMouth', tris: 320 },
};

function bellyMatUuid(i) {
  const h = i.toString(16);
  return `9d11aa10-00e${h}-4a01-8001-0000000000e${h}`;
}

function bellyRgb(rgb) {
  const cream = [255, 236, 214];
  return [
    Math.round(rgb[0] * 0.4 + cream[0] * 0.6),
    Math.round(rgb[1] * 0.4 + cream[1] * 0.6),
    Math.round(rgb[2] * 0.4 + cream[2] * 0.6),
  ];
}

function powerImgUuid(d) {
  return `9d12cc10-030${d}-4a01-8001-00000000003${d}`;
}
function powerMatUuid(d) {
  return `9d11aa10-00c${d}-4a01-8001-0000000000c${d}`;
}

const COLORS = [
  { token: 'o', name: 'Orange', rgb: [255, 132, 28], block: '7e22bb20-0001-4b02-8002-000000000001', unit: '7e22bb20-0004-4b02-8002-000000000004', mat: '9d11aa10-0001-4a01-8001-000000000001', skin: '9d12cc10-0100-4a01-8001-000000000001' },
  { token: 'y', name: 'Yellow', rgb: [255, 158, 72], block: '7e22bb20-0011-4b02-8002-000000000011', unit: '7e22bb20-0021-4b02-8002-000000000021', mat: '9d11aa10-0011-4a01-8001-000000000011', skin: '9d12cc10-0100-4a01-8001-000000000002' },
  { token: 'c', name: 'Cyan', rgb: [24, 228, 236], block: '7e22bb20-0002-4b02-8002-000000000002', unit: '7e22bb20-0005-4b02-8002-000000000005', mat: '9d11aa10-0002-4a01-8001-000000000002', skin: '9d12cc10-0100-4a01-8001-000000000003' },
  { token: 'g', name: 'Lime', rgb: [96, 224, 48], block: '7e22bb20-0012-4b02-8002-000000000012', unit: '7e22bb20-0022-4b02-8002-000000000022', mat: '9d11aa10-0012-4a01-8001-000000000012', skin: '9d12cc10-0100-4a01-8001-000000000004' },
  { token: 'p', name: 'Pink', rgb: [255, 84, 164], block: '7e22bb20-0013-4b02-8002-000000000013', unit: '7e22bb20-0023-4b02-8002-000000000023', mat: '9d11aa10-0013-4a01-8001-000000000013', skin: '9d12cc10-0100-4a01-8001-000000000005' },
  { token: 'v', name: 'Violet', rgb: [164, 92, 255], block: '7e22bb20-0014-4b02-8002-000000000014', unit: '7e22bb20-0024-4b02-8002-000000000024', mat: '9d11aa10-0014-4a01-8001-000000000014', skin: '9d12cc10-0100-4a01-8001-000000000006' },
  { token: 'r', name: 'Red', rgb: [255, 60, 76], block: '7e22bb20-0015-4b02-8002-000000000015', unit: '7e22bb20-0025-4b02-8002-000000000025', mat: '9d11aa10-0015-4a01-8001-000000000015', skin: '9d12cc10-0100-4a01-8001-000000000007' },
  { token: 's', name: 'Sky', rgb: [72, 176, 255], block: '7e22bb20-0016-4b02-8002-000000000016', unit: '7e22bb20-0026-4b02-8002-000000000026', mat: '9d11aa10-0016-4a01-8001-000000000016', skin: '9d12cc10-0100-4a01-8001-000000000008' },
  { token: 'k', name: 'Coral', rgb: [255, 124, 100], block: '7e22bb20-0003-4b02-8002-000000000003', unit: '7e22bb20-0006-4b02-8002-000000000006', mat: '9d11aa10-0017-4a01-8001-000000000017', skin: '9d12cc10-0100-4a01-8001-000000000009' },
  { token: 'm', name: 'Mint', rgb: [0, 212, 128], block: '7e22bb20-0018-4b02-8002-000000000018', unit: '7e22bb20-0028-4b02-8002-000000000028', mat: '9d11aa10-0018-4a01-8001-000000000018', skin: '9d12cc10-0100-4a01-8001-00000000000a' },
  { token: 'a', name: 'Magenta', rgb: [240, 56, 216], block: '7e22bb20-0019-4b02-8002-000000000019', unit: '7e22bb20-0029-4b02-8002-000000000029', mat: '9d11aa10-0019-4a01-8001-000000000019', skin: '9d12cc10-0100-4a01-8001-00000000000b' },
  { token: 'd', name: 'Gold', rgb: [255, 196, 44], block: '7e22bb20-001a-4b02-8002-00000000001a', unit: '7e22bb20-002a-4b02-8002-00000000002a', mat: '9d11aa10-001a-4a01-8001-00000000001a', skin: '9d12cc10-0100-4a01-8001-00000000000c' },
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

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (Buffer.isBuffer(data) || typeof data === 'string') {
    fs.writeFileSync(file, data);
    return;
  }
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
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

function prefabMeta(uuid, name) {
  return { ver: '1.1.50', importer: 'prefab', imported: true, uuid, files: ['.json'], subMetas: {}, userData: { syncNodeName: name } };
}

function jsonMeta(uuid) {
  return { ver: '1.0.8', importer: 'json', imported: true, uuid, files: ['.json'], subMetas: {}, userData: {} };
}

function gltfMeta(uuid) {
  const mesh = MESH_ID[uuid];
  const meshUuid = `${uuid}@${mesh.id}`;
  return {
    ver: '2.3.14',
    importer: 'gltf',
    imported: true,
    uuid,
    files: ['.json'],
    subMetas: {
      [mesh.id]: {
        importer: 'gltf-mesh',
        uuid: meshUuid,
        displayName: mesh.name,
        id: mesh.id,
        name: `${mesh.name}.mesh`,
        userData: { gltfIndex: 0, triangleCount: mesh.tris },
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

function imageMeta(uuid, name, w, h, extra) {
  const tex = `${uuid}@6c48a`;
  const opt = extra || {};
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
          mipfilter: opt.mipfilter || 'none',
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
      fixAlphaTransparencyArtifacts: !!opt.fixAlpha,
      hasAlpha: true,
      redirect: tex,
    },
  };
}

function powerDigitMaterial(name, texUuid) {
  const tex = `${texUuid}@6c48a`;
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
        blendState: { targets: [{ blend: true, blendSrc: 2, blendDst: 4 }] },
      },
      {},
    ],
    _props: [
      {},
      {
        mainTexture: { __uuid__: tex, __expectedType__: 'cc.Texture2D' },
        mainColor: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
      },
      {},
    ],
  };
}

function clayMaterial(name, rgb, roughness, emit) {
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
        mainColor: { __type__: 'cc.Color', r: rgb[0], g: rgb[1], b: rgb[2], a: 255 },
        roughness,
        metallic: 0.04,
        emissive: { __type__: 'cc.Color', r: rgb[0], g: rgb[1], b: rgb[2], a: 255 },
        emissiveScale: { __type__: 'cc.Vec3', x: emit, y: emit, z: emit },
      },
      {},
      {},
    ],
  };
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
  const s = `${tag}${String(fid++).padStart(8, '0')}xxxxxxxxxxxx`;
  return s.slice(0, 22);
}

function eulerToQuat(xDeg, yDeg, zDeg) {
  const hx = (xDeg * Math.PI) / 360;
  const hy = (yDeg * Math.PI) / 360;
  const hz = (zDeg * Math.PI) / 360;
  const sx = Math.sin(hx);
  const cx = Math.cos(hx);
  const sy = Math.sin(hy);
  const cy = Math.cos(hy);
  const sz = Math.sin(hz);
  const cz = Math.cos(hz);
  return quat(
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  );
}

function addNode(doc, opts) {
  const children = [];
  const components = [];
  const rx = opts.rx || 0;
  const ry = opts.ry || 0;
  const rz = opts.rz || 0;
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
    _lrot: eulerToQuat(rx, ry, rz),
    _lscale: vec3(opts.sx == null ? 1 : opts.sx, opts.sy == null ? 1 : opts.sy, opts.sz == null ? 1 : opts.sz),
    _mobility: 0,
    _layer: LAYER_3D,
    _euler: vec3(rx, ry, rz),
    _id: '',
  });
  if (opts.parentId != null) doc.items[opts.parentId]._children.push({ __id__: id });
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
}

function addCompPrefab(doc, comp) {
  const id = doc.add({ __type__: 'cc.CompPrefabInfo', fileId: fileId('c') });
  comp.__prefab = { __id__: id };
}

function addMeshRenderer(doc, nodeId, mesh, mat, asPrefab, cast) {
  const bakeId = doc.add({
    __type__: 'cc.ModelBakeSettings',
    texture: null,
    uvParam: { __type__: 'cc.Vec4', x: 0, y: 0, z: 0, w: 0 },
    _bakeable: false,
    _castShadow: !!cast,
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
    _mesh: mesh ? { __uuid__: mesh, __expectedType__: 'cc.Mesh' } : null,
    _shadowCastingMode: cast ? 1 : 0,
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
  if (asPrefab) addCompPrefab(doc, mr);
  return id;
}

function addScript(doc, nodeId, uuid, asPrefab, extra) {
  const comp = {
    __type__: compressUuid(uuid),
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _id: '',
    ...(extra || {}),
  };
  const id = doc.add(comp);
  doc.items[nodeId]._components.push({ __id__: id });
  if (asPrefab) addCompPrefab(doc, comp);
  return id;
}

/* ---------- mesh bake (ported from ToyBlockMesh / ToyOctopusMesh) ---------- */

function bakeBlock() {
  const HALF = 0.5;
  const RADIUS = 0.2;
  const SEG = 5;
  const pos = [];
  const nrm = [];
  const uvs = [];
  const idx = [];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function project(x, y, z) {
    const lim = HALF - RADIUS;
    const ix = clamp(x, -lim, lim);
    const iy = clamp(y, -lim, lim);
    const iz = clamp(z, -lim, lim);
    let dx = x - ix;
    let dy = y - iy;
    let dz = z - iz;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) {
      const ax = Math.abs(x);
      const ay = Math.abs(y);
      const az = Math.abs(z);
      if (ax >= ay && ax >= az) {
        dx = Math.sign(x);
        dy = 0;
        dz = 0;
      } else if (ay >= az) {
        dx = 0;
        dy = Math.sign(y);
        dz = 0;
      } else {
        dx = 0;
        dy = 0;
        dz = Math.sign(z);
      }
    } else {
      dx /= len;
      dy /= len;
      dz /= len;
    }
    pos.push(ix + dx * RADIUS, iy + dy * RADIUS, iz + dz * RADIUS);
    nrm.push(dx, dy, dz);
  }

  function addFace(axis, sign) {
    const n = SEG + 1;
    const base = pos.length / 3;
    const a1 = (axis + 1) % 3;
    const a2 = (axis + 2) % 3;
    const p = [0, 0, 0];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        p[axis] = sign * HALF;
        p[a1] = ((i / SEG) * 2 - 1) * HALF;
        p[a2] = ((j / SEG) * 2 - 1) * HALF;
        project(p[0], p[1], p[2]);
        const ni = nrm.length - 3;
        uvs.push(nrm[ni] * 0.5 + 0.5, nrm[ni + 1] * 0.5 + 0.5);
      }
    }
    for (let j = 0; j < SEG; j++) {
      for (let i = 0; i < SEG; i++) {
        const i0 = base + j * n + i;
        const i1 = i0 + 1;
        const i2 = i0 + n;
        const i3 = i2 + 1;
        if (sign > 0) idx.push(i0, i1, i3, i0, i3, i2);
        else idx.push(i0, i3, i1, i0, i2, i3);
      }
    }
  }

  for (let axis = 0; axis < 3; axis++) {
    addFace(axis, 1);
    addFace(axis, -1);
  }
  return packMesh(pos, nrm, uvs, idx, [-HALF, -HALF, -HALF], [HALF, HALF, HALF], Math.SQRT1_2);
}

function bakeBall() {
  const su = 12;
  const sv = 8;
  const pos = [];
  const nrm = [];
  const uvs = [];
  const idx = [];
  for (let v = 0; v <= sv; v++) {
    const phi = (v / sv) * Math.PI;
    const cy = Math.cos(phi);
    const r = Math.sin(phi);
    for (let u = 0; u <= su; u++) {
      const th = (u / su) * Math.PI * 2;
      const cx = r * Math.cos(th);
      const cz = r * Math.sin(th);
      pos.push(cx * 0.5, cy * 0.5, cz * 0.5);
      nrm.push(cx, cy, cz);
      uvs.push(cx * 0.5 + 0.5, cy * 0.5 + 0.5);
    }
  }
  const stride = su + 1;
  for (let v = 0; v < sv; v++) {
    for (let u = 0; u < su; u++) {
      const i0 = v * stride + u;
      const i1 = i0 + 1;
      const i2 = i0 + stride;
      const i3 = i2 + 1;
      idx.push(i0, i2, i1, i1, i2, i3);
    }
  }
  return packMesh(pos, nrm, uvs, idx, [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5], 0.5);
}

/** Unit cylinder along +Z, radius 0.5, length 1, centered at origin. */
function bakeCylinder() {
  const su = 16;
  const pos = [];
  const nrm = [];
  const uvs = [];
  const idx = [];
  const r = 0.5;
  const hz = 0.5;

  for (let i = 0; i <= su; i++) {
    const th = (i / su) * Math.PI * 2;
    const cx = Math.cos(th);
    const cy = Math.sin(th);
    pos.push(cx * r, cy * r, -hz);
    nrm.push(cx, cy, 0);
    uvs.push(i / su, 0);
    pos.push(cx * r, cy * r, hz);
    nrm.push(cx, cy, 0);
    uvs.push(i / su, 1);
  }
  for (let i = 0; i < su; i++) {
    const i0 = i * 2;
    idx.push(i0, i0 + 2, i0 + 1, i0 + 1, i0 + 2, i0 + 3);
  }

  const backCenter = pos.length / 3;
  pos.push(0, 0, -hz);
  nrm.push(0, 0, -1);
  uvs.push(0.5, 0.5);
  const backRing = pos.length / 3;
  for (let i = 0; i <= su; i++) {
    const th = (i / su) * Math.PI * 2;
    const cx = Math.cos(th);
    const cy = Math.sin(th);
    pos.push(cx * r, cy * r, -hz);
    nrm.push(0, 0, -1);
    uvs.push(cx * 0.5 + 0.5, cy * 0.5 + 0.5);
  }
  for (let i = 0; i < su; i++) idx.push(backCenter, backRing + i + 1, backRing + i);

  const frontCenter = pos.length / 3;
  pos.push(0, 0, hz);
  nrm.push(0, 0, 1);
  uvs.push(0.5, 0.5);
  const frontRing = pos.length / 3;
  for (let i = 0; i <= su; i++) {
    const th = (i / su) * Math.PI * 2;
    const cx = Math.cos(th);
    const cy = Math.sin(th);
    pos.push(cx * r, cy * r, hz);
    nrm.push(0, 0, 1);
    uvs.push(cx * 0.5 + 0.5, cy * 0.5 + 0.5);
  }
  for (let i = 0; i < su; i++) idx.push(frontCenter, frontRing + i, frontRing + i + 1);

  return packMesh(pos, nrm, uvs, idx, [-r, -r, -hz], [r, r, hz], Math.hypot(r, hz));
}

/** Chubby O sucker along +Z. Reads as a cute nozzle from a 28° overhead camera. */
function bakeMouth() {
  const segs = 20;
  const profile = [
    { z: -0.42, r: 0.20 },
    { z: -0.16, r: 0.30 },
    { z: 0.04, r: 0.36 },
    { z: 0.20, r: 0.46 },
    { z: 0.34, r: 0.50 },
    { z: 0.44, r: 0.40 },
    { z: 0.48, r: 0.24 },
    { z: 0.26, r: 0.18 },
    { z: -0.04, r: 0.15 },
    { z: -0.08, r: 0.00 },
  ];
  const pos = [];
  const nrm = [];
  const uvs = [];
  const idx = [];
  const rings = profile.length;
  const ring = segs + 1;
  for (let i = 0; i < rings; i++) {
    const prev = profile[Math.max(0, i - 1)];
    const next = profile[Math.min(rings - 1, i + 1)];
    const tz = next.z - prev.z;
    const tr = next.r - prev.r;
    const len = Math.hypot(tz, -tr) || 1;
    const nR = tz / len;
    const nZ = -tr / len;
    for (let s = 0; s <= segs; s++) {
      const th = (s / segs) * Math.PI * 2;
      const c = Math.cos(th);
      const si = Math.sin(th);
      pos.push(c * profile[i].r, si * profile[i].r, profile[i].z);
      nrm.push(c * nR, si * nR, nZ);
      uvs.push(s / segs, i / (rings - 1));
    }
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let s = 0; s < segs; s++) {
      const a = i * ring + s;
      const b = a + 1;
      const c = a + ring;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  let x0 = 1e9;
  let y0 = 1e9;
  let z0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  let z1 = -1e9;
  for (let i = 0; i < pos.length; i += 3) {
    x0 = Math.min(x0, pos[i]);
    y0 = Math.min(y0, pos[i + 1]);
    z0 = Math.min(z0, pos[i + 2]);
    x1 = Math.max(x1, pos[i]);
    y1 = Math.max(y1, pos[i + 1]);
    z1 = Math.max(z1, pos[i + 2]);
  }
  return packMesh(pos, nrm, uvs, idx, [x0, y0, z0], [x1, y1, z1], 0.62);
}

function bakePowerQuad() {
  return packMesh(
    [-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0],
    [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    [0, 0, 1, 0, 0, 1, 1, 1],
    [0, 1, 2, 1, 3, 2],
    [-0.5, -0.5, 0],
    [0.5, 0.5, 0],
    0.71,
  );
}

function bakeOctopus() {
  const ISO = 1;
  const NX = 26;
  const NY = 24;
  const NZ = 26;
  const blobs = [];
  const add = (x, y, z, r) => blobs.push([x, y, z, r]);

  add(0, 0.082, 0.01, 0.148);
  add(0, 0.138, 0.016, 0.112);
  add(0, 0.046, 0.004, 0.122);
  add(0.068, 0.076, 0.068, 0.072);
  add(-0.068, 0.076, 0.068, 0.072);
  add(0, 0.034, 0.064, 0.064);
  add(0, 0.02, -0.02, 0.086);
  add(0.04, 0.116, 0.108, 0.038);
  add(-0.04, 0.116, 0.108, 0.038);
  add(0, 0.052, 0.096, 0.04);

  const D = Math.PI / 180;
  const tents = [
    { a: 24 * D, reach: 0.158, drop: 0.136, curl: 0.02, fat: 0.052 },
    { a: 66 * D, reach: 0.172, drop: 0.144, curl: 0.014, fat: 0.056 },
    { a: 110 * D, reach: 0.18, drop: 0.148, curl: -0.01, fat: 0.058 },
    { a: 156 * D, reach: 0.186, drop: 0.15, curl: 0.012, fat: 0.058 },
    { a: 204 * D, reach: 0.186, drop: 0.15, curl: -0.012, fat: 0.058 },
    { a: 250 * D, reach: 0.18, drop: 0.148, curl: 0.01, fat: 0.058 },
    { a: 294 * D, reach: 0.172, drop: 0.144, curl: -0.014, fat: 0.056 },
    { a: 336 * D, reach: 0.158, drop: 0.136, curl: -0.02, fat: 0.052 },
  ];
  for (const t of tents) addTentacle(add, t.a, t.reach, t.drop, t.curl, t.fat);

  let lo = 1e9;
  for (const [, y, , r] of blobs) lo = Math.min(lo, y - r);
  const lift = -lo + 0.004;
  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i];
    blobs[i] = [b[0], b[1] + lift, b[2], b[3]];
  }

  let x0 = 1e9;
  let y0 = 1e9;
  let z0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  let z1 = -1e9;
  for (const [x, y, z, r] of blobs) {
    const pad = r * 1.35 + 0.1;
    x0 = Math.min(x0, x - pad);
    y0 = Math.min(y0, y - pad);
    z0 = Math.min(z0, z - pad);
    x1 = Math.max(x1, x + pad);
    y1 = Math.max(y1, y + pad);
    z1 = Math.max(z1, z + pad);
  }

  function field(x, y, z) {
    let v = 0;
    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];
      const dx = x - b[0];
      const dy = y - b[1];
      const dz = z - b[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      const R = b[3] * 1.62;
      if (d2 >= R * R) continue;
      v += (b[3] * b[3]) / Math.max(d2, 1e-5);
    }
    return v;
  }

  const nrmOut = [0, 0, 0];
  function gradOut(x, y, z) {
    const e = 0.0035;
    let nx = field(x - e, y, z) - field(x + e, y, z);
    let ny = field(x, y - e, z) - field(x, y + e, z);
    let nz = field(x, y, z - e) - field(x, y, z + e);
    const len = Math.hypot(nx, ny, nz) || 1;
    nrmOut[0] = nx / len;
    nrmOut[1] = ny / len;
    nrmOut[2] = nz / len;
  }

  const dx = (x1 - x0) / NX;
  const dy = (y1 - y0) / NY;
  const dz = (z1 - z0) / NZ;
  const sx = NX + 1;
  const sy = NY + 1;
  const values = new Float32Array(sx * sy * (NZ + 1));
  const gi = (i, j, k) => i + j * sx + k * sx * sy;
  for (let k = 0; k <= NZ; k++) {
    const z = z0 + k * dz;
    for (let j = 0; j <= NY; j++) {
      const y = y0 + j * dy;
      for (let i = 0; i < sx; i++) values[gi(i, j, k)] = field(x0 + i * dx, y, z);
    }
  }

  const cell = (i, j, k) => i + j * NX + k * NX * NY;
  const vertOf = new Int32Array(NX * NY * NZ).fill(-1);
  const positions = [];
  const normals = [];
  const uvs = [];
  const C = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ];
  const E = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];

  for (let k = 0; k < NZ; k++) {
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const cv = new Array(8);
        let inside = 0;
        for (let c = 0; c < 8; c++) {
          const p = C[c];
          cv[c] = values[gi(i + p[0], j + p[1], k + p[2])];
          if (cv[c] >= ISO) inside++;
        }
        if (inside === 0 || inside === 8) continue;
        let ax = 0;
        let ay = 0;
        let az = 0;
        let hits = 0;
        for (let e = 0; e < 12; e++) {
          const a = E[e][0];
          const b = E[e][1];
          const va = cv[a];
          const vb = cv[b];
          if ((va >= ISO) === (vb >= ISO)) continue;
          const t = (ISO - va) / (vb - va || 1e-6);
          ax += x0 + (i + C[a][0] + (C[b][0] - C[a][0]) * t) * dx;
          ay += y0 + (j + C[a][1] + (C[b][1] - C[a][1]) * t) * dy;
          az += z0 + (k + C[a][2] + (C[b][2] - C[a][2]) * t) * dz;
          hits++;
        }
        if (!hits) continue;
        ax /= hits;
        ay /= hits;
        az /= hits;
        vertOf[cell(i, j, k)] = positions.length / 3;
        positions.push(ax, ay, az);
        gradOut(ax, ay, az);
        normals.push(nrmOut[0], nrmOut[1], nrmOut[2]);
        uvs.push(nrmOut[0] * 0.5 + 0.5, nrmOut[1] * 0.5 + 0.5);
      }
    }
  }

  const indices = [];
  const pushTri = (a, b, c) => {
    if (a < 0 || b < 0 || c < 0) return;
    const ax = positions[b * 3] - positions[a * 3];
    const ay = positions[b * 3 + 1] - positions[a * 3 + 1];
    const az = positions[b * 3 + 2] - positions[a * 3 + 2];
    const bx = positions[c * 3] - positions[a * 3];
    const by = positions[c * 3 + 1] - positions[a * 3 + 1];
    const bz = positions[c * 3 + 2] - positions[a * 3 + 2];
    const fx = ay * bz - az * by;
    const fy = az * bx - ax * bz;
    const fz = ax * by - ay * bx;
    const nx = normals[a * 3] + normals[b * 3] + normals[c * 3];
    const ny = normals[a * 3 + 1] + normals[b * 3 + 1] + normals[c * 3 + 1];
    const nz = normals[a * 3 + 2] + normals[b * 3 + 2] + normals[c * 3 + 2];
    if (fx * nx + fy * ny + fz * nz < 0) indices.push(a, c, b);
    else indices.push(a, b, c);
  };
  const quad = (a, b, c, d) => {
    pushTri(a, b, c);
    pushTri(a, c, d);
  };

  for (let k = 1; k < NZ; k++) {
    for (let j = 1; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const va = values[gi(i, j, k)];
        const vb = values[gi(i + 1, j, k)];
        if ((va >= ISO) === (vb >= ISO)) continue;
        quad(vertOf[cell(i, j - 1, k - 1)], vertOf[cell(i, j, k - 1)], vertOf[cell(i, j, k)], vertOf[cell(i, j - 1, k)]);
      }
    }
  }
  for (let k = 1; k < NZ; k++) {
    for (let j = 0; j < NY; j++) {
      for (let i = 1; i < NX; i++) {
        const va = values[gi(i, j, k)];
        const vb = values[gi(i, j + 1, k)];
        if ((va >= ISO) === (vb >= ISO)) continue;
        quad(vertOf[cell(i - 1, j, k - 1)], vertOf[cell(i, j, k - 1)], vertOf[cell(i, j, k)], vertOf[cell(i - 1, j, k)]);
      }
    }
  }
  for (let k = 0; k < NZ; k++) {
    for (let j = 1; j < NY; j++) {
      for (let i = 1; i < NX; i++) {
        const va = values[gi(i, j, k)];
        const vb = values[gi(i, j, k + 1)];
        if ((va >= ISO) === (vb >= ISO)) continue;
        quad(vertOf[cell(i - 1, j - 1, k)], vertOf[cell(i, j - 1, k)], vertOf[cell(i, j, k)], vertOf[cell(i - 1, j, k)]);
      }
    }
  }

  smooth(positions, indices, 2, 0.38);
  for (let i = 0; i < positions.length; i += 3) {
    gradOut(positions[i], positions[i + 1], positions[i + 2]);
    normals[i] = nrmOut[0];
    normals[i + 1] = nrmOut[1];
    normals[i + 2] = nrmOut[2];
    const ui = (i / 3) * 2;
    uvs[ui] = nrmOut[0] * 0.5 + 0.5;
    uvs[ui + 1] = nrmOut[1] * 0.5 + 0.5;
  }

  return {
    mesh: packMesh(positions, normals, uvs, indices, [x0, y0, z0], [x1, y1, z1], 0.55),
    lift,
  };
}

function addTentacle(add, a, reach, drop, curl, fat) {
  const sx = Math.sin(a);
  const sz = Math.cos(a);
  const px = Math.cos(a);
  const pz = -Math.sin(a);
  const p0 = [sx * 0.04, 0.042, sz * 0.04];
  const p1 = [sx * reach * 0.42, 0.01, sz * reach * 0.42];
  const p2 = [sx * reach * 0.78 + px * curl, -drop * 0.78, sz * reach * 0.78 + pz * curl];
  const p3 = [sx * reach * 1.02 + px * curl * 0.28, -drop, sz * reach * 1.02 + pz * curl * 0.28];
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const u = 1 - t;
    const b0 = u * u * u;
    const b1 = 3 * u * u * t;
    const b2 = 3 * u * t * t;
    const b3 = t * t * t;
    add(
      b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
      b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1],
      b0 * p0[2] + b1 * p1[2] + b2 * p2[2] + b3 * p3[2],
      fat * (0.94 - 0.48 * t * t),
    );
  }
  add(p3[0], p3[1] - fat * 0.12, p3[2], fat * 0.5);
}

function smooth(pos, idx, iters, t) {
  const n = pos.length / 3;
  const adj = Array.from({ length: n }, () => []);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i];
    const b = idx[i + 1];
    const c = idx[i + 2];
    adj[a].push(b, c);
    adj[b].push(a, c);
    adj[c].push(a, b);
  }
  const next = new Float32Array(pos.length);
  for (let pass = 0; pass < iters; pass++) {
    for (let v = 0; v < n; v++) {
      const nb = adj[v];
      if (!nb.length) {
        next[v * 3] = pos[v * 3];
        next[v * 3 + 1] = pos[v * 3 + 1];
        next[v * 3 + 2] = pos[v * 3 + 2];
        continue;
      }
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let k = 0; k < nb.length; k++) {
        const o = nb[k] * 3;
        sx += pos[o];
        sy += pos[o + 1];
        sz += pos[o + 2];
      }
      const inv = 1 / nb.length;
      next[v * 3] = pos[v * 3] + (sx * inv - pos[v * 3]) * t;
      next[v * 3 + 1] = pos[v * 3 + 1] + (sy * inv - pos[v * 3 + 1]) * t;
      next[v * 3 + 2] = pos[v * 3 + 2] + (sz * inv - pos[v * 3 + 2]) * t;
    }
    for (let i = 0; i < pos.length; i++) pos[i] = next[i];
  }
}

function packMesh(p, n, u, i, min, max, r) {
  return { p, n, u, i, min, max, r };
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
    asset: { version: '2.0', generator: 'bake-toy-prefabs' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [{
      name,
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
        indices: 3,
      }],
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
    buffers: [{
      byteLength: bin.length,
      uri: `data:application/octet-stream;base64,${bin.toString('base64')}`,
    }],
  };
  write(`${fileBase}.gltf`, `${JSON.stringify(gltf, null, 2)}\n`);
  write(`${fileBase}.gltf.meta`, gltfMeta(uuid));
  for (const extra of [`${fileBase}.bin`, `${fileBase}.bin.meta`]) {
    if (fs.existsSync(extra)) fs.unlinkSync(extra);
  }
}

function writeMeshJson(name, mesh, uuid) {
  const file = path.join(ASSETS, `resources/meshes/${name}.json`);
  write(file, {
    p: mesh.p,
    n: mesh.n,
    u: mesh.u,
    i: mesh.i,
    min: mesh.min,
    max: mesh.max,
    r: mesh.r,
  });
  write(`${file}.meta`, jsonMeta(uuid));
}

function buildBlockPrefab(color) {
  fid = 1;
  const name = `Block${color.name}`;
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
  const root = addNode(doc, { name });
  const assetRef = { __id__: prefabId };
  addPrefabInfo(doc, root.id, assetRef, true);
  addMeshRenderer(doc, root.id, MESH_BLOCK, color.mat, true, true);
  addScript(doc, root.id, UUID.BlockCell, true);
  write(path.join(ASSETS, `prefabs/blocks/${name}.prefab`), doc.json());
  write(path.join(ASSETS, `prefabs/blocks/${name}.prefab.meta`), prefabMeta(color.block, name));
}

function buildUnitPrefab(color, lift) {
  fid = 1;
  const name = `Unit${color.name}`;
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
  const root = addNode(doc, { name });
  const assetRef = { __id__: prefabId };
  addPrefabInfo(doc, root.id, assetRef, true);
  addScript(doc, root.id, UUID.UnitActor, true);

  const body = addNode(doc, { name: 'Body', parentId: root.id });
  addPrefabInfo(doc, body.id, assetRef, false);
  addMeshRenderer(doc, body.id, MESH_OCTOPUS, color.mat, true, true);

  const bits = [
    { name: 'EyeL', x: -0.052, y: 0.168 + lift, z: 0.072, sx: 0.082, sy: 0.098, sz: 0.05, m: UUID.MatEye },
    { name: 'EyeR', x: 0.052, y: 0.168 + lift, z: 0.072, sx: 0.082, sy: 0.098, sz: 0.05, m: UUID.MatEye },
    { name: 'PupilL', x: -0.046, y: 0.16 + lift, z: 0.094, sx: 0.032, sy: 0.038, sz: 0.022, m: UUID.MatPupil },
    { name: 'PupilR', x: 0.046, y: 0.16 + lift, z: 0.094, sx: 0.032, sy: 0.038, sz: 0.022, m: UUID.MatPupil },
    { name: 'HighlightL', x: -0.062, y: 0.178 + lift, z: 0.104, sx: 0.016, sy: 0.018, sz: 0.012, m: UUID.MatHighlight },
    { name: 'HighlightR', x: 0.034, y: 0.178 + lift, z: 0.104, sx: 0.016, sy: 0.018, sz: 0.012, m: UUID.MatHighlight },
    { name: 'CheekL', x: -0.078, y: 0.118 + lift, z: 0.086, sx: 0.036, sy: 0.028, sz: 0.024, m: UUID.MatCheek },
    { name: 'CheekR', x: 0.078, y: 0.118 + lift, z: 0.086, sx: 0.036, sy: 0.028, sz: 0.024, m: UUID.MatCheek },
  ];
  for (const p of bits) {
    const n = addNode(doc, { ...p, parentId: root.id });
    addPrefabInfo(doc, n.id, assetRef, false);
    addMeshRenderer(doc, n.id, MESH_BALL, p.m, true, false);
  }

  /* Face sits on the crown-front so the 28° camera and yaw-aim still read. */
  const mouth = addNode(doc, {
    name: 'Mouth',
    parentId: root.id,
    x: 0,
    y: 0.108 + lift,
    z: 0.146,
    rx: -28,
    sx: 0.058,
    sy: 0.058,
    sz: 0.05,
  });
  addPrefabInfo(doc, mouth.id, assetRef, false);
  addMeshRenderer(doc, mouth.id, MESH_MOUTH, UUID.MatSucker, true, true);
  const hole = addNode(doc, {
    name: 'MouthHole',
    parentId: mouth.id,
    x: 0,
    y: 0,
    z: 0.4,
    sx: 0.55,
    sy: 0.55,
    sz: 0.26,
  });
  addPrefabInfo(doc, hole.id, assetRef, false);
  addMeshRenderer(doc, hole.id, MESH_BALL, UUID.MatPupil, true, false);

  const power = addNode(doc, { name: 'Power', parentId: root.id, x: 0, y: 0.4, z: -0.06 });
  addPrefabInfo(doc, power.id, assetRef, false);
  for (let i = 0; i < 3; i++) {
    const slot = addNode(doc, {
      name: `D${i}`,
      parentId: power.id,
      sx: 0.13,
      sy: 0.175,
      sz: 1,
      active: i === 0,
    });
    addPrefabInfo(doc, slot.id, assetRef, false);
    addMeshRenderer(doc, slot.id, MESH_POWER, powerMatUuid(8), true, false);
  }
  const bank = addNode(doc, { name: 'Bank', parentId: power.id, active: false });
  addPrefabInfo(doc, bank.id, assetRef, false);
  for (let d = 0; d < 10; d++) {
    const n = addNode(doc, { name: `N${d}`, parentId: bank.id });
    addPrefabInfo(doc, n.id, assetRef, false);
    addMeshRenderer(doc, n.id, MESH_POWER, powerMatUuid(d), true, false);
  }

  write(path.join(ASSETS, `prefabs/units/${name}.prefab`), doc.json());
  write(path.join(ASSETS, `prefabs/units/${name}.prefab.meta`), prefabMeta(color.unit, name));
}

function writeToyLook() {
  write(path.join(ASSETS, 'scripts/battle/ToyLook.ts'), `import { Vec3 } from 'cc';
import { SPECIAL_SPAN } from '../game/GameConfig';

export const OCTOPUS_STAND_Y = 0.012;
export const OCTO_POWER_LOCAL = new Vec3(0, 0.4, -0.06);
/** Body centroid. Keep Z at 0 so the blob stays in the window, not behind the wall. */
export const OCTO_BODY_LOCAL = new Vec3(0, 0.26716, 0);
/** Main blob radius from bake-toy-prefabs. */
const OCTO_BODY_R = 0.148;
/** How much of the 4-cell cage the body should fill. */
const OCTO_CAGE_FILL = 0.86;
export const OCTO_CAGE_SCALE = (SPECIAL_SPAN * OCTO_CAGE_FILL) / (2 * OCTO_BODY_R);
`);
  write(path.join(ASSETS, 'scripts/battle/ToyLook.ts.meta'), tsMeta(UUID.ToyLook));
}

function writeCatalog() {
  const blockLines = COLORS.map((c) => `  ${c.token}: '${c.block}',`).join('\n');
  const unitLines = COLORS.map((c) => `  ${c.token}: '${c.unit}',`).join('\n');
  const src = `import { ColorToken } from '../game/GameConfig';

export const PREFAB_UUID = {
  Slot: '7e22bb20-0007-4b02-8002-000000000007',
  Ground: '7e22bb20-0008-4b02-8002-000000000008',
  Debris: '7e22bb20-0009-4b02-8002-000000000009',
  HintHand: '7e22bb20-000a-4b02-8002-00000000000a',
  HintHandSprite: '7e22bb20-000e-4b02-8002-00000000000e@f9941',
  SlotCircle: '7e22bb20-000b-4b02-8002-00000000000b@6c48a',
  PlayBtn: '7e22bb20-000d-4b02-8002-00000000000d@f9941',
  LockNails: '7e22bb20-0031-4b02-8002-000000000031',
  HomePanel: '7e22bb20-0040-4b02-8002-000000000040',
  Baozha: '758f9311-08b5-4b56-928a-b6c60a832690',
  Xingxing: 'd72d75b5-3b32-42c2-9eff-33153126dca6',
  Pingmu: 'f3acda95-f24d-4e94-a3d1-e089c980275e',
  Shuaxin: '29821b8d-1014-439d-81ef-9f11e3487797',
} as const;

export const BLOCK_PREFAB: Record<ColorToken, string> = {
${blockLines}
};

export const UNIT_PREFAB: Record<ColorToken, string> = {
${unitLines}
};

export function blockPrefabUuid(token: string): string {
  return BLOCK_PREFAB[token as ColorToken] ?? BLOCK_PREFAB.o;
}

export function unitPrefabUuid(token: string): string {
  return UNIT_PREFAB[token as ColorToken] ?? UNIT_PREFAB.o;
}
`;
  write(path.join(ASSETS, 'scripts/battle/PrefabCatalog.ts'), src);
}

function main() {
  console.log('baking toy meshes...');
  try {
    const { execFileSync } = require('child_process');
    execFileSync('python', [path.join(ROOT, 'tools/draw-power-digits.py')], { stdio: 'inherit' });
  } catch {
    console.log('skip power digits (python missing)');
  }

  const block = bakeBlock();
  const ball = bakeBall();
  const cylinder = bakeCylinder();
  const mouth = bakeMouth();
  const powerQuad = bakePowerQuad();
  const { mesh: octopus, lift } = bakeOctopus();
  MESH_ID[UUID.GltfOctopus].tris = octopus.i.length / 3;
  MESH_ID[UUID.GltfBlock].tris = block.i.length / 3;
  MESH_ID[UUID.GltfCylinder].tris = cylinder.i.length / 3;
  MESH_ID[UUID.GltfMouth].tris = mouth.i.length / 3;
  console.log(`block verts=${block.p.length / 3} tris=${block.i.length / 3}`);
  console.log(`octopus verts=${octopus.p.length / 3} tris=${octopus.i.length / 3} lift=${lift}`);
  console.log(`ball verts=${ball.p.length / 3}`);
  console.log(`cylinder verts=${cylinder.p.length / 3} tris=${cylinder.i.length / 3}`);
  console.log(`mouth verts=${mouth.p.length / 3} tris=${mouth.i.length / 3}`);

  write(path.join(ASSETS, 'models.meta'), dirMeta(UUID.dirModels));
  write(path.join(ASSETS, 'resources/meshes.meta'), dirMeta(UUID.dirMeshes));

  writeGltf(path.join(ASSETS, 'models/toy-block'), 'ToyBlock', block, UUID.GltfBlock);
  writeGltf(path.join(ASSETS, 'models/toy-octopus'), 'ToyOctopus', octopus, UUID.GltfOctopus);
  writeGltf(path.join(ASSETS, 'models/toy-ball'), 'ToyBall', ball, UUID.GltfBall);
  writeGltf(path.join(ASSETS, 'models/toy-power'), 'ToyPower', powerQuad, UUID.GltfPower);
  writeGltf(path.join(ASSETS, 'models/toy-cylinder'), 'ToyCylinder', cylinder, UUID.GltfCylinder);
  writeGltf(path.join(ASSETS, 'models/toy-mouth'), 'ToyMouth', mouth, UUID.GltfMouth);

  writeMeshJson('toy-block', block, UUID.MeshBlockJson);
  writeMeshJson('toy-octopus', octopus, UUID.MeshOctopusJson);
  writeMeshJson('toy-ball', ball, UUID.MeshBallJson);
  writeMeshJson('toy-power', powerQuad, UUID.MeshPowerJson);
  writeMeshJson('toy-cylinder', cylinder, UUID.MeshCylinderJson);
  writeMeshJson('toy-mouth', mouth, UUID.MeshMouthJson);

  for (let d = 0; d < 10; d++) {
    const imgUuid = powerImgUuid(d);
    const matUuid = powerMatUuid(d);
    write(path.join(ASSETS, `resources/toys/power-${d}.png.meta`), imageMeta(imgUuid, `power-${d}`, 256, 256, {
      mipfilter: 'none',
      fixAlpha: true,
    }));
    write(path.join(ASSETS, `materials/MatPower${d}.mtl`), powerDigitMaterial(`MatPower${d}`, imgUuid));
    write(path.join(ASSETS, `materials/MatPower${d}.mtl.meta`), mtlMeta(matUuid));
  }

  write(path.join(ASSETS, 'materials/MatHighlight.mtl'), clayMaterial('MatHighlight', [255, 255, 255], 0.1, 0.34));
  write(path.join(ASSETS, 'materials/MatHighlight.mtl.meta'), mtlMeta(UUID.MatHighlight));
  write(path.join(ASSETS, 'materials/MatEye.mtl'), clayMaterial('MatEye', [252, 252, 255], 0.14, 0.16));
  write(path.join(ASSETS, 'materials/MatEye.mtl.meta'), mtlMeta(UUID.MatEye));
  write(path.join(ASSETS, 'materials/MatPupil.mtl'), clayMaterial('MatPupil', [22, 24, 30], 0.28, 0.04));
  write(path.join(ASSETS, 'materials/MatPupil.mtl.meta'), mtlMeta(UUID.MatPupil));
  write(path.join(ASSETS, 'materials/MatSucker.mtl'), clayMaterial('MatSucker', [255, 110, 72], 0.3, 0.14));
  write(path.join(ASSETS, 'materials/MatSucker.mtl.meta'), mtlMeta(UUID.MatSucker));
  write(path.join(ASSETS, 'materials/MatCheek.mtl'), clayMaterial('MatCheek', [255, 148, 168], 0.32, 0.1));
  write(path.join(ASSETS, 'materials/MatCheek.mtl.meta'), mtlMeta(UUID.MatCheek));
  COLORS.forEach((c) => {
    write(path.join(ASSETS, `materials/Mat${c.name}.mtl`), clayMaterial(`Mat${c.name}`, c.rgb, 0.34, 0.12));
    write(path.join(ASSETS, `materials/Mat${c.name}.mtl.meta`), mtlMeta(c.mat));
  });

  writeToyLook();

  for (const stale of ['BlockBlack', 'UnitBlack']) {
    const pf = path.join(ASSETS, `prefabs/${stale}.prefab`);
    const meta = `${pf}.meta`;
    if (fs.existsSync(pf)) fs.unlinkSync(pf);
    if (fs.existsSync(meta)) fs.unlinkSync(meta);
  }

  for (const c of COLORS) {
    buildBlockPrefab(c);
    buildUnitPrefab(c, lift);
  }

  console.log(`wrote ${COLORS.length} block + ${COLORS.length} unit prefabs`);
}

main();
