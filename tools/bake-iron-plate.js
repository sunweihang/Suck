'use strict';

/** Bake a toy-metal iron plate mesh, materials, and IronPlate prefab. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const FX_STD = 'c8f66d17-351a-48da-a12c-0212d28575c4';
const LAYER_3D = 1073741824;

const UUID = {
  IronPlate: '7e22bb20-0032-4b02-8002-000000000032',
  IronPlateScript: '8c01a1b0-4e21-4f3a-9c11-01000000000d',
  MatIron: '9d11aa10-0032-4a01-8001-000000000032',
  MatIronDark: '9d11aa10-0033-4a01-8001-000000000033',
  GltfPlate: '7e22bb20-0315-4b02-8002-000000000005',
  MeshPlateJson: '7e22bb20-0305-4b02-8002-000000000005',
  GltfBall: '7e22bb20-0313-4b02-8002-000000000003',
};

const MESH_PLATE = `${UUID.GltfPlate}@b2fe3`;
const MESH_BALL = `${UUID.GltfBall}@642dc`;
const MESH_ID = {
  [UUID.GltfPlate]: { id: 'b2fe3', name: 'IronPlate', tris: 0 },
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

function stdMaterial(name, rgb, metallic, roughness, emit) {
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
        metallic,
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

function packMesh(p, n, u, i, min, max, r) {
  return { p, n, u, i, min, max, r };
}

function bakeRoundedBox(hx, hy, hz, radius, seg) {
  const pos = [];
  const nrm = [];
  const uvs = [];
  const idx = [];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function project(x, y, z) {
    const lx = hx - radius;
    const ly = hy - radius;
    const lz = hz - radius;
    const ix = clamp(x, -lx, lx);
    const iy = clamp(y, -ly, ly);
    const iz = clamp(z, -lz, lz);
    let dx = x - ix;
    let dy = y - iy;
    let dz = z - iz;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) {
      const ax = Math.abs(x) / hx;
      const ay = Math.abs(y) / hy;
      const az = Math.abs(z) / hz;
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
    pos.push(ix + dx * radius, iy + dy * radius, iz + dz * radius);
    nrm.push(dx, dy, dz);
  }
  function addFace(axis, sign, half) {
    const n = seg + 1;
    const base = pos.length / 3;
    const a1 = (axis + 1) % 3;
    const a2 = (axis + 2) % 3;
    const halves = [hx, hy, hz];
    const p = [0, 0, 0];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        p[axis] = sign * half;
        p[a1] = ((i / seg) * 2 - 1) * halves[a1];
        p[a2] = ((j / seg) * 2 - 1) * halves[a2];
        project(p[0], p[1], p[2]);
        const ni = nrm.length - 3;
        uvs.push(nrm[ni] * 0.5 + 0.5, nrm[ni + 1] * 0.5 + 0.5);
      }
    }
    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const i0 = base + j * n + i;
        const i1 = i0 + 1;
        const i2 = i0 + n;
        const i3 = i2 + 1;
        if (sign > 0) idx.push(i0, i1, i3, i0, i3, i2);
        else idx.push(i0, i3, i1, i0, i2, i3);
      }
    }
  }
  addFace(0, 1, hx);
  addFace(0, -1, hx);
  addFace(1, 1, hy);
  addFace(1, -1, hy);
  addFace(2, 1, hz);
  addFace(2, -1, hz);
  return packMesh(pos, nrm, uvs, idx, [-hx, -hy, -hz], [hx, hy, hz], Math.hypot(hx, hy, hz));
}

function appendMesh(dst, src) {
  const base = dst.p.length / 3;
  for (let i = 0; i < src.p.length; i++) dst.p.push(src.p[i]);
  for (let i = 0; i < src.n.length; i++) dst.n.push(src.n[i]);
  for (let i = 0; i < src.u.length; i++) dst.u.push(src.u[i]);
  for (let i = 0; i < src.i.length; i++) dst.i.push(src.i[i] + base);
}

function bakePlate() {
  const plate = bakeRoundedBox(0.5, 0.07, 0.5, 0.055, 5);
  const out = { p: plate.p.slice(), n: plate.n.slice(), u: plate.u.slice(), i: plate.i.slice() };
  const rails = [
    bakeRoundedBox(0.46, 0.016, 0.055, 0.02, 3),
    bakeRoundedBox(0.46, 0.016, 0.055, 0.02, 3),
    bakeRoundedBox(0.055, 0.016, 0.35, 0.02, 3),
    bakeRoundedBox(0.055, 0.016, 0.35, 0.02, 3),
  ];
  const shifts = [[0, 0.078, -0.39], [0, 0.078, 0.39], [-0.39, 0.078, 0], [0.39, 0.078, 0]];
  rails.forEach((rail, i) => {
    for (let k = 0; k < rail.p.length; k += 3) {
      rail.p[k] += shifts[i][0];
      rail.p[k + 1] += shifts[i][1];
      rail.p[k + 2] += shifts[i][2];
    }
    appendMesh(out, rail);
  });
  let minX = 1e9;
  let minY = 1e9;
  let minZ = 1e9;
  let maxX = -1e9;
  let maxY = -1e9;
  let maxZ = -1e9;
  for (let i = 0; i < out.p.length; i += 3) {
    minX = Math.min(minX, out.p[i]);
    minY = Math.min(minY, out.p[i + 1]);
    minZ = Math.min(minZ, out.p[i + 2]);
    maxX = Math.max(maxX, out.p[i]);
    maxY = Math.max(maxY, out.p[i + 1]);
    maxZ = Math.max(maxZ, out.p[i + 2]);
  }
  return packMesh(out.p, out.n, out.u, out.i, [minX, minY, minZ], [maxX, maxY, maxZ], Math.hypot(0.5, 0.09, 0.5));
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
    asset: { version: '2.0', generator: 'bake-iron-plate' },
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

function writePreview(mesh, file) {
  const W = 512;
  const H = 512;
  const buf = Buffer.alloc(W * H * 4, 0);
  const zbuf = new Float32Array(W * H);
  zbuf.fill(1e9);
  const bg = [236, 232, 224, 255];
  for (let i = 0; i < W * H; i++) {
    buf[i * 4] = bg[0];
    buf[i * 4 + 1] = bg[1];
    buf[i * 4 + 2] = bg[2];
    buf[i * 4 + 3] = 255;
  }
  const yaw = 0.62;
  const pitch = 0.48;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const light = [0.42, 0.78, 0.46];
  const inv = 1 / Math.hypot(light[0], light[1], light[2]);
  light[0] *= inv;
  light[1] *= inv;
  light[2] *= inv;
  function xf(x, y, z) {
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const y2 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;
    return [x1, y2, z2];
  }
  const scale = 210;
  const cx = W * 0.5;
  const cyi = H * 0.56;
  function project(i) {
    const p = xf(mesh.p[i * 3], mesh.p[i * 3 + 1], mesh.p[i * 3 + 2]);
    const n = xf(mesh.n[i * 3], mesh.n[i * 3 + 1], mesh.n[i * 3 + 2]);
    return [p[0] * scale + cx, -p[1] * scale + cyi, p[2], n[0], n[1], n[2]];
  }
  const verts = [];
  const vcount = mesh.p.length / 3;
  for (let i = 0; i < vcount; i++) verts.push(project(i));
  function shade(nx, ny, nz) {
    const nd = Math.max(0, nx * light[0] + ny * light[1] + nz * light[2]);
    const spec = Math.pow(Math.max(0, ny * 0.35 + nd), 18) * 70;
    const r = Math.min(255, 118 + nd * 86 + spec);
    const g = Math.min(255, 128 + nd * 78 + spec);
    const b = Math.min(255, 142 + nd * 70 + spec);
    return [r, g, b];
  }
  function edge(a, b, x, y) {
    return (x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0]);
  }
  for (let t = 0; t < mesh.i.length; t += 3) {
    const a = verts[mesh.i[t]];
    const b = verts[mesh.i[t + 1]];
    const c = verts[mesh.i[t + 2]];
    const area = edge(a, b, c[0], c[1]);
    if (area <= 1) continue;
    const minx = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const maxx = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const miny = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const maxy = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const invA = 1 / area;
    for (let y = miny; y <= maxy; y++) {
      for (let x = minx; x <= maxx; x++) {
        const w0 = edge(b, c, x + 0.5, y + 0.5) * invA;
        const w1 = edge(c, a, x + 0.5, y + 0.5) * invA;
        const w2 = edge(a, b, x + 0.5, y + 0.5) * invA;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
        const pi = y * W + x;
        if (z >= zbuf[pi]) continue;
        zbuf[pi] = z;
        const nx = w0 * a[3] + w1 * b[3] + w2 * c[3];
        const ny = w0 * a[4] + w1 * b[4] + w2 * c[4];
        const nz = w0 * a[5] + w1 * b[5] + w2 * c[5];
        const col = shade(nx, ny, nz);
        const o = pi * 4;
        buf[o] = col[0];
        buf[o + 1] = col[1];
        buf[o + 2] = col[2];
        buf[o + 3] = 255;
      }
    }
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
  const zlib = require('zlib');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
}

function buildPrefab() {
  fid = 1;
  const name = 'IronPlate';
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
  addMeshRenderer(doc, root.id, MESH_PLATE, UUID.MatIron, true, true);
  addScript(doc, root.id, UUID.IronPlateScript, true);
  const rivets = [
    [-0.32, 0.092, -0.32],
    [0.32, 0.092, -0.32],
    [-0.32, 0.092, 0.32],
    [0.32, 0.092, 0.32],
  ];
  rivets.forEach((p, i) => {
    const n = addNode(doc, {
      name: `Rivet${i}`,
      parentId: root.id,
      x: p[0],
      y: p[1],
      z: p[2],
      sx: 0.13,
      sy: 0.1,
      sz: 0.13,
    });
    addPrefabInfo(doc, n.id, assetRef, false);
    addMeshRenderer(doc, n.id, MESH_BALL, UUID.MatIronDark, true, true);
  });
  write(path.join(ASSETS, `prefabs/${name}.prefab`), doc.json());
  write(path.join(ASSETS, `prefabs/${name}.prefab.meta`), prefabMeta(UUID.IronPlate, name));
}

const plate = bakePlate();
MESH_ID[UUID.GltfPlate].tris = plate.i.length / 3;
writeGltf(path.join(ASSETS, 'models/iron-plate'), 'IronPlate', plate, UUID.GltfPlate);
write(path.join(ASSETS, 'resources/meshes/iron-plate.json'), {
  p: plate.p,
  n: plate.n,
  u: plate.u,
  i: plate.i,
  min: plate.min,
  max: plate.max,
  r: plate.r,
});
write(path.join(ASSETS, 'resources/meshes/iron-plate.json.meta'), jsonMeta(UUID.MeshPlateJson));
write(path.join(ASSETS, 'materials/MatIron.mtl'), stdMaterial('MatIron', [150, 160, 174], 0.78, 0.26, 0.08));
write(path.join(ASSETS, 'materials/MatIron.mtl.meta'), mtlMeta(UUID.MatIron));
write(path.join(ASSETS, 'materials/MatIronDark.mtl'), stdMaterial('MatIronDark', [78, 84, 94], 0.88, 0.22, 0.05));
write(path.join(ASSETS, 'materials/MatIronDark.mtl.meta'), mtlMeta(UUID.MatIronDark));
function bakeSphere(cx, cy, cz, r, su, sv) {
  const pos = [];
  const nrm = [];
  const uvs = [];
  const idx = [];
  for (let v = 0; v <= sv; v++) {
    const phi = (v / sv) * Math.PI;
    const cy0 = Math.cos(phi);
    const rr = Math.sin(phi);
    for (let u = 0; u <= su; u++) {
      const th = (u / su) * Math.PI * 2;
      const nx = rr * Math.cos(th);
      const nz = rr * Math.sin(th);
      pos.push(cx + nx * r, cy + cy0 * r, cz + nz * r);
      nrm.push(nx, cy0, nz);
      uvs.push(nx * 0.5 + 0.5, cy0 * 0.5 + 0.5);
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
  return packMesh(pos, nrm, uvs, idx, [cx - r, cy - r, cz - r], [cx + r, cy + r, cz + r], r);
}

function bakePreviewMesh(base) {
  const out = { p: base.p.slice(), n: base.n.slice(), u: base.u.slice(), i: base.i.slice() };
  const rivets = [[-0.32, 0.092, -0.32], [0.32, 0.092, -0.32], [-0.32, 0.092, 0.32], [0.32, 0.092, 0.32]];
  for (const p of rivets) appendMesh(out, bakeSphere(p[0], p[1], p[2], 0.055, 10, 7));
  return packMesh(out.p, out.n, out.u, out.i, base.min, [base.max[0], 0.16, base.max[2]], base.r);
}

buildPrefab();
writePreview(bakePreviewMesh(plate), path.join(ROOT, 'tools/iron-plate-preview.png'));
console.log(`IronPlate baked: ${MESH_ID[UUID.GltfPlate].tris} tris`);
