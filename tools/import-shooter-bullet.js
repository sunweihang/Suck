'use strict';

/**
 * Import Shoot a Cube Puzzle! Shooter + Bullet meshes into Cocos toys.
 * Source: exported/resources/meshes/Shooter.obj and Bullet.obj
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const SRC = path.join(
  process.env.USERPROFILE || '',
  'Documents',
  'leidian14',
  'Pictures',
  'Shoot a Cube Puzzle!',
  'exported',
  'resources',
  'meshes',
);

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LAYER_3D = 1073741824;
const TARGET_WIDTH = 0.4;
const BULLET_R = 0.5;

const UUID = {
  UnitActor: '8c01a1b0-4e21-4f3a-9c11-010000000002',
  MeshShooterJson: '7e22bb20-0309-4b02-8002-000000000009',
  MeshBulletJson: '7e22bb20-030a-4b02-8002-00000000000a',
  GltfShooter: '7e22bb20-0319-4b02-8002-000000000009',
  GltfBullet: '7e22bb20-031a-4b02-8002-00000000000a',
};

const MESH_SHOOTER = `${UUID.GltfShooter}@s7a01`;
const MESH_BULLET = `${UUID.GltfBullet}@b7a02`;

const COLORS = [
  { token: 'o', name: 'Orange', unit: '7e22bb20-0004-4b02-8002-000000000004', mat: '9d11aa10-0001-4a01-8001-000000000001' },
  { token: 'y', name: 'Yellow', unit: '7e22bb20-0021-4b02-8002-000000000021', mat: '9d11aa10-0011-4a01-8001-000000000011' },
  { token: 'c', name: 'Cyan', unit: '7e22bb20-0005-4b02-8002-000000000005', mat: '9d11aa10-0002-4a01-8001-000000000002' },
  { token: 'g', name: 'Lime', unit: '7e22bb20-0022-4b02-8002-000000000022', mat: '9d11aa10-0012-4a01-8001-000000000012' },
  { token: 'p', name: 'Pink', unit: '7e22bb20-0023-4b02-8002-000000000023', mat: '9d11aa10-0013-4a01-8001-000000000013' },
  { token: 'v', name: 'Violet', unit: '7e22bb20-0024-4b02-8002-000000000024', mat: '9d11aa10-0014-4a01-8001-000000000014' },
  { token: 'r', name: 'Red', unit: '7e22bb20-0025-4b02-8002-000000000025', mat: '9d11aa10-0015-4a01-8001-000000000015' },
  { token: 's', name: 'Sky', unit: '7e22bb20-0026-4b02-8002-000000000026', mat: '9d11aa10-0016-4a01-8001-000000000016' },
  { token: 'k', name: 'Coral', unit: '7e22bb20-0006-4b02-8002-000000000006', mat: '9d11aa10-0017-4a01-8001-000000000017' },
  { token: 'm', name: 'Mint', unit: '7e22bb20-0028-4b02-8002-000000000028', mat: '9d11aa10-0018-4a01-8001-000000000018' },
  { token: 'a', name: 'Magenta', unit: '7e22bb20-0029-4b02-8002-000000000029', mat: '9d11aa10-0019-4a01-8001-000000000019' },
  { token: 'd', name: 'Gold', unit: '7e22bb20-002a-4b02-8002-00000000002a', mat: '9d11aa10-001a-4a01-8001-00000000001a' },
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

function parseObj(file) {
  const txt = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
  const pos = [];
  const nrm = [];
  const uvs = [];
  const faces = [];
  for (const raw of txt.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('v ')) {
      const p = line.split(/\s+/);
      pos.push([+p[1], +p[2], +p[3]]);
    } else if (line.startsWith('vn ')) {
      const p = line.split(/\s+/);
      nrm.push([+p[1], +p[2], +p[3]]);
    } else if (line.startsWith('vt ')) {
      const p = line.split(/\s+/);
      uvs.push([+p[1], +p[2]]);
    } else if (line.startsWith('f ')) {
      const parts = line.split(/\s+/).slice(1).map((tok) => {
        const [v, t, n] = tok.split('/');
        return { v: (+v || 1) - 1, t: t ? (+t || 1) - 1 : -1, n: n ? (+n || 1) - 1 : -1 };
      });
      for (let i = 1; i + 1 < parts.length; i++) faces.push([parts[0], parts[i], parts[i + 1]]);
    }
  }
  const p = [];
  const n = [];
  const u = [];
  const idx = [];
  const keyOf = (f) => `${f.v}/${f.t}/${f.n}`;
  const map = new Map();
  for (const tri of faces) {
    for (const f of tri) {
      const key = keyOf(f);
      let i = map.get(key);
      if (i == null) {
        i = p.length / 3;
        map.set(key, i);
        const vp = pos[f.v] || [0, 0, 0];
        p.push(vp[0], vp[1], vp[2]);
        const np = f.n >= 0 && nrm[f.n] ? nrm[f.n] : [0, 1, 0];
        n.push(np[0], np[1], np[2]);
        const tp = f.t >= 0 && uvs[f.t] ? uvs[f.t] : [0, 0];
        u.push(tp[0], tp[1]);
      }
      idx.push(i);
    }
  }
  if (!nrm.length) {
    for (let i = 0; i < n.length; i++) n[i] = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3;
      const b = idx[t + 1] * 3;
      const c = idx[t + 2] * 3;
      const ax = p[b] - p[a];
      const ay = p[b + 1] - p[a + 1];
      const az = p[b + 2] - p[a + 2];
      const bx = p[c] - p[a];
      const by = p[c + 1] - p[a + 1];
      const bz = p[c + 2] - p[a + 2];
      const nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      const nz = ax * by - ay * bx;
      n[a] += nx;
      n[a + 1] += ny;
      n[a + 2] += nz;
      n[b] += nx;
      n[b + 1] += ny;
      n[b + 2] += nz;
      n[c] += nx;
      n[c + 1] += ny;
      n[c + 2] += nz;
    }
    for (let i = 0; i < n.length; i += 3) {
      const len = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
      n[i] /= len;
      n[i + 1] /= len;
      n[i + 2] /= len;
    }
  }
  return pack(p, n, u, idx);
}

function bounds(p) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[i + k]);
      max[k] = Math.max(max[k], p[i + k]);
    }
  }
  return { min, max };
}

function pack(p, n, u, idx) {
  const { min, max } = bounds(p);
  const r = Math.hypot(
    Math.max(Math.abs(min[0]), Math.abs(max[0])),
    Math.max(Math.abs(min[1]), Math.abs(max[1])),
    Math.max(Math.abs(min[2]), Math.abs(max[2])),
  );
  return { p, n, u, i: idx, min, max, r };
}

function xform(mesh, fn) {
  const p = mesh.p.slice();
  const n = mesh.n.slice();
  for (let i = 0; i < p.length; i += 3) {
    const out = fn(p[i], p[i + 1], p[i + 2], n[i], n[i + 1], n[i + 2]);
    p[i] = out[0];
    p[i + 1] = out[1];
    p[i + 2] = out[2];
    n[i] = out[3];
    n[i + 1] = out[4];
    n[i + 2] = out[5];
  }
  return pack(p, n, mesh.u.slice(), mesh.i.slice());
}

function rebuildNormals(mesh) {
  const n = new Array(mesh.p.length).fill(0);
  const p = mesh.p;
  const idx = mesh.i;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3;
    const b = idx[t + 1] * 3;
    const c = idx[t + 2] * 3;
    const ax = p[b] - p[a];
    const ay = p[b + 1] - p[a + 1];
    const az = p[b + 2] - p[a + 2];
    const bx = p[c] - p[a];
    const by = p[c + 1] - p[a + 1];
    const bz = p[c + 2] - p[a + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    n[a] += nx;
    n[a + 1] += ny;
    n[a + 2] += nz;
    n[b] += nx;
    n[b + 1] += ny;
    n[b + 2] += nz;
    n[c] += nx;
    n[c + 1] += ny;
    n[c + 2] += nz;
  }
  for (let i = 0; i < n.length; i += 3) {
    const len = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= len;
    n[i + 1] /= len;
    n[i + 2] /= len;
  }
  return pack(mesh.p, n, mesh.u, mesh.i);
}

function gltfMeta(uuid, id, name, tris) {
  const meshUuid = `${uuid}@${id}`;
  return {
    ver: '2.3.14',
    importer: 'gltf',
    imported: true,
    uuid,
    files: ['.json'],
    subMetas: {
      [id]: {
        importer: 'gltf-mesh',
        uuid: meshUuid,
        displayName: name,
        id,
        name: `${name}.mesh`,
        userData: { gltfIndex: 0, triangleCount: tris },
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

function writeGltf(fileBase, name, mesh, uuid, id) {
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
    asset: { version: '2.0', generator: 'import-shooter-bullet' },
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
  write(`${fileBase}.gltf.meta`, gltfMeta(uuid, id, name, mesh.i.length / 3));
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
  write(`${file}.meta`, {
    ver: '2.0.1',
    importer: 'json',
    imported: true,
    uuid,
    files: ['.json'],
    subMetas: {},
    userData: {},
  });
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
    _lrot: quat(0, 0, 0, 1),
    _lscale: vec3(1, 1, 1),
    _mobility: 0,
    _layer: LAYER_3D,
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
    _castShadow: true,
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
    _shadowCastingMode: 1,
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

function buildUnitPrefab(color, muzzle) {
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
  addScript(doc, root.id, UUID.UnitActor);

  const body = addNode(doc, { name: 'Body', parentId: root.id });
  addPrefabInfo(doc, body.id, assetRef, false);
  addMeshRenderer(doc, body.id, MESH_SHOOTER, color.mat);

  const mouth = addNode(doc, { name: 'Mouth', parentId: root.id, x: muzzle[0], y: muzzle[1], z: muzzle[2] });
  addPrefabInfo(doc, mouth.id, assetRef, false);

  const power = addNode(doc, { name: 'Power', parentId: root.id });
  addPrefabInfo(doc, power.id, assetRef, false);

  write(path.join(ASSETS, `prefabs/units/${name}.prefab`), doc.json());
  write(path.join(ASSETS, `prefabs/units/${name}.prefab.meta`), {
    ver: '1.1.50',
    importer: 'prefab',
    imported: true,
    uuid: color.unit,
    files: ['.json'],
    subMetas: {},
    userData: { syncNodeName: name },
  });
}

function main() {
  const shooterSrc = path.join(SRC, 'Shooter.obj');
  const bulletSrc = path.join(SRC, 'Bullet.obj');
  if (!fs.existsSync(shooterSrc) || !fs.existsSync(bulletSrc)) {
    throw new Error(`missing source meshes in ${SRC}`);
  }

  const raw = parseObj(shooterSrc);
  /* Stand on the pad, nozzle +Y, front +Z — same axis as the wall cubes. */
  const { min, max } = bounds(raw.p);
  const scale = TARGET_WIDTH / (max[0] - min[0]);
  const cx = (min[0] + max[0]) * 0.5;
  const cz = (min[2] + max[2]) * 0.5;
  const shooter = rebuildNormals(xform(raw, (x, y, z) => [
    (x - cx) * scale,
    (y - min[1]) * scale,
    (z - cz) * scale,
    0,
    1,
    0,
  ]));

  let muzzleY = -Infinity;
  let muzzleZ = 0;
  let frontZ = -Infinity;
  let frontY = 0;
  for (let i = 0; i < shooter.p.length; i += 3) {
    const x = shooter.p[i];
    const y = shooter.p[i + 1];
    const z = shooter.p[i + 2];
    if (y > muzzleY && Math.abs(x) < 0.05) {
      muzzleY = y;
      muzzleZ = z;
    }
    if (z > frontZ && Math.abs(x) < 0.06) {
      frontZ = z;
      frontY = y;
    }
  }
  const muzzle = [0, +muzzleY.toFixed(4), +muzzleZ.toFixed(4)];
  const power = [0, +(frontY * 0.95).toFixed(4), +(frontZ + 0.012).toFixed(4)];

  const bulletRaw = parseObj(bulletSrc);
  const br = Math.max(
    Math.abs(bulletRaw.min[0]),
    Math.abs(bulletRaw.max[0]),
    Math.abs(bulletRaw.min[1]),
    Math.abs(bulletRaw.max[1]),
    Math.abs(bulletRaw.min[2]),
    Math.abs(bulletRaw.max[2]),
  );
  const bScale = BULLET_R / br;
  const bullet = rebuildNormals(xform(bulletRaw, (x, y, z) => [x * bScale, y * bScale, z * bScale, 0, 1, 0]));

  writeGltf(path.join(ASSETS, 'models/toy-shooter'), 'ToyShooter', shooter, UUID.GltfShooter, 's7a01');
  writeGltf(path.join(ASSETS, 'models/toy-bullet'), 'ToyBullet', bullet, UUID.GltfBullet, 'b7a02');
  writeMeshJson('toy-shooter', shooter, UUID.MeshShooterJson);
  writeMeshJson('toy-bullet', bullet, UUID.MeshBulletJson);

  for (const c of COLORS) buildUnitPrefab(c, muzzle);

  console.log('shooter verts', shooter.p.length / 3, 'tris', shooter.i.length / 3);
  console.log('size', shooter.max.map((v, i) => +(v - shooter.min[i]).toFixed(4)));
  console.log('muzzle', muzzle, 'power', power);
  console.log('bullet r', bullet.r.toFixed(4));
  console.log(`wrote ${COLORS.length} turret prefabs`);
}

main();
