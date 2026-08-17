'use strict';

/** Bake a torus chain-link mesh and LockChain prefab (X wrap on the octopus). */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LAYER_3D = 1073741824;
const PI = Math.PI;
const RAD2DEG = 180 / PI;

const UUID = {
  LockChain: '7e22bb20-0033-4b02-8002-000000000033',
  MatIron: '9d11aa10-0032-4a01-8001-000000000032',
  GltfLink: '7e22bb20-0317-4b02-8002-000000000007',
};

const MESH_LINK = `${UUID.GltfLink}@c3af2`;
const MESH_ID = {
  [UUID.GltfLink]: { id: 'c3af2', name: 'LockChainLink', tris: 0 },
};

const WRAP = {
  cx: 0,
  cy: 0.2,
  cz: 0.02,
  rx: 0.33,
  ry: 0.29,
  rz: 0.31,
  rolls: [42, -42],
  links: 10,
  theta0: 0.18,
  theta1: 0.82,
  linkScale: 0.095,
};

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
      assetFinder: { meshes: [meshUuid], skeletons: [], textures: [], materials: [], scenes: [] },
    },
  };
}

function prefabMeta(uuid, name) {
  return { ver: '1.1.50', importer: 'prefab', imported: true, uuid, files: ['.json'], subMetas: {}, userData: { syncNodeName: name } };
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

function packMesh(p, n, u, i, min, max, r) {
  return { p, n, u, i, min, max, r };
}

function bakeTorus(R, r, stretch, su, sv) {
  const pos = [];
  const nrm = [];
  const uvs = [];
  const idx = [];
  for (let v = 0; v <= sv; v++) {
    const va = (v / sv) * PI * 2;
    const cv = Math.cos(va);
    const svv = Math.sin(va);
    for (let u = 0; u <= su; u++) {
      const ua = (u / su) * PI * 2;
      const cu = Math.cos(ua);
      const suu = Math.sin(ua);
      const ring = R + r * cv;
      pos.push(ring * cu * stretch, ring * suu, r * svv);
      const nx = cv * cu;
      const ny = cv * suu;
      const nz = svv;
      const len = Math.hypot(nx / stretch, ny, nz) || 1;
      nrm.push(nx / stretch / len, ny / len, nz / len);
      uvs.push(u / su, v / sv);
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
  const hx = (R + r) * stretch;
  const hy = R + r;
  return packMesh(pos, nrm, uvs, idx, [-hx, -hy, -r], [hx, hy, r], Math.hypot(hx, hy, r));
}

function bandPoint(t, rollDeg) {
  const roll = (rollDeg * PI) / 180;
  const theta = (WRAP.theta0 + t * (WRAP.theta1 - WRAP.theta0)) * PI;
  const cs = Math.cos(theta);
  const sn = Math.sin(theta);
  const bx = -Math.sin(roll);
  const by = Math.cos(roll);
  const x = WRAP.cx + WRAP.rx * bx * cs;
  const y = WRAP.cy + WRAP.ry * by * cs;
  const z = WRAP.cz + WRAP.rz * sn;
  const tx = WRAP.rx * bx * -Math.sin(theta);
  const ty = WRAP.ry * by * -Math.sin(theta);
  const tz = WRAP.rz * Math.cos(theta);
  const len = Math.hypot(tx, ty, tz) || 1;
  return { x, y, z, tx: tx / len, ty: ty / len, tz: tz / len };
}

function eulerFromTangent(tx, ty, tz, twist) {
  const yaw = Math.atan2(tx, tz) * RAD2DEG;
  const pitch = -Math.atan2(ty, Math.hypot(tx, tz)) * RAD2DEG;
  return [pitch, yaw, twist];
}

function linkSpots() {
  const out = [];
  WRAP.rolls.forEach((roll, bi) => {
    for (let i = 0; i < WRAP.links; i++) {
      const t = WRAP.links <= 1 ? 0.5 : i / (WRAP.links - 1);
      const p = bandPoint(t, roll);
      const twist = (i + bi) % 2 === 0 ? 0 : 90;
      const [rx, ry, rz] = eulerFromTangent(p.tx, p.ty, p.tz, twist);
      out.push({
        name: `LockLink${bi * WRAP.links + i}`,
        x: p.x,
        y: p.y,
        z: p.z,
        rx,
        ry,
        rz,
        s: WRAP.linkScale,
      });
    }
  });
  return out;
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
    asset: { version: '2.0', generator: 'bake-lock-chain' },
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
  for (const extra of [`${fileBase}.bin`, `${fileBase}.bin.meta`]) {
    if (fs.existsSync(extra)) fs.unlinkSync(extra);
  }
}

function writePreview(spots, file) {
  const W = 512;
  const H = 512;
  const buf = Buffer.alloc(W * H * 4, 0);
  const bg = [236, 232, 224, 255];
  for (let i = 0; i < W * H; i++) {
    buf[i * 4] = bg[0];
    buf[i * 4 + 1] = bg[1];
    buf[i * 4 + 2] = bg[2];
    buf[i * 4 + 3] = 255;
  }
  const scale = 620;
  const cx = W * 0.5;
  const cy = H * 0.58;
  function put(x, y, r, col) {
    const x0 = Math.max(0, Math.floor(x - r));
    const x1 = Math.min(W - 1, Math.ceil(x + r));
    const y0 = Math.max(0, Math.floor(y - r));
    const y1 = Math.min(H - 1, Math.ceil(y + r));
    const r2 = r * r;
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px - x;
        const dy = py - y;
        if (dx * dx + dy * dy > r2) continue;
        const o = (py * W + px) * 4;
        buf[o] = col[0];
        buf[o + 1] = col[1];
        buf[o + 2] = col[2];
        buf[o + 3] = 255;
      }
    }
  }
  put(cx, cy - WRAP.cy * scale, 0.28 * scale, [255, 214, 72]);
  for (const s of spots) {
    put(s.x * scale + cx, -s.y * scale + cy, 7, [118, 126, 138]);
  }
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  function crc32(data) {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const t = Buffer.from(type);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  }
  const stride = 1 + W * 4;
  const raw = Buffer.alloc(H * stride);
  for (let y = 0; y < H; y++) {
    raw[y * stride] = 0;
    buf.copy(raw, y * stride + 1, y * W * 4, (y + 1) * W * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

function buildPrefab(spots) {
  fid = 1;
  const name = 'LockChain';
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
  for (const s of spots) {
    const n = addNode(doc, {
      name: s.name,
      parentId: root.id,
      x: s.x,
      y: s.y,
      z: s.z,
      rx: s.rx,
      ry: s.ry,
      rz: s.rz,
      sx: s.s,
      sy: s.s,
      sz: s.s,
    });
    addPrefabInfo(doc, n.id, assetRef, false);
    addMeshRenderer(doc, n.id, MESH_LINK, UUID.MatIron, true, true);
  }
  write(path.join(ASSETS, `prefabs/${name}.prefab`), doc.json());
  write(path.join(ASSETS, `prefabs/${name}.prefab.meta`), prefabMeta(UUID.LockChain, name));
}

const link = bakeTorus(0.5, 0.18, 1.28, 16, 8);
MESH_ID[UUID.GltfLink].tris = link.i.length / 3;
writeGltf(path.join(ASSETS, 'models/lock-chain-link'), 'LockChainLink', link, UUID.GltfLink);
const spots = linkSpots();
buildPrefab(spots);
writePreview(spots, path.join(ROOT, 'tools/lock-chain-preview.png'));
console.log(`LockChain baked: ${spots.length} links, ${MESH_ID[UUID.GltfLink].tris} tris`);
