'use strict';

/** Bake a toy thumbtack nail mesh and LockNails prefab (4 corner nails). */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LAYER_3D = 1073741824;

const UUID = {
  LockNails: '7e22bb20-0031-4b02-8002-000000000031',
  MatIron: '9d11aa10-0032-4a01-8001-000000000032',
  MatIronDark: '9d11aa10-0033-4a01-8001-000000000033',
  GltfNail: '7e22bb20-0316-4b02-8002-000000000006',
  MeshNailJson: '7e22bb20-0306-4b02-8002-000000000006',
};

const MESH_NAIL = `${UUID.GltfNail}@c3af1`;
const MESH_ID = {
  [UUID.GltfNail]: { id: 'c3af1', name: 'LockNail', tris: 0 },
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

function jsonMeta(uuid) {
  return { ver: '1.0.8', importer: 'json', imported: true, uuid, files: ['.json'], subMetas: {}, userData: {} };
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

function boundsOf(p) {
  let minX = 1e9;
  let minY = 1e9;
  let minZ = 1e9;
  let maxX = -1e9;
  let maxY = -1e9;
  let maxZ = -1e9;
  for (let i = 0; i < p.length; i += 3) {
    minX = Math.min(minX, p[i]);
    minY = Math.min(minY, p[i + 1]);
    minZ = Math.min(minZ, p[i + 2]);
    maxX = Math.max(maxX, p[i]);
    maxY = Math.max(maxY, p[i + 1]);
    maxZ = Math.max(maxZ, p[i + 2]);
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ], r: Math.hypot(maxX, maxY, maxZ) };
}

function appendMesh(dst, src) {
  const base = dst.p.length / 3;
  for (let i = 0; i < src.p.length; i++) dst.p.push(src.p[i]);
  for (let i = 0; i < src.n.length; i++) dst.n.push(src.n[i]);
  for (let i = 0; i < src.u.length; i++) dst.u.push(src.u[i]);
  for (let i = 0; i < src.i.length; i++) dst.i.push(src.i[i] + base);
}

/** Lathe a (r, z) profile around +Z so the nail points out of the brick face. */
function latheZ(profile, segs) {
  const n = profile.length;
  const pr = profile.map((p, i) => {
    const prev = profile[Math.max(0, i - 1)];
    const next = profile[Math.min(n - 1, i + 1)];
    const dr = next[0] - prev[0];
    const dz = next[1] - prev[1];
    let nr = dz;
    let nz = -dr;
    const len = Math.hypot(nr, nz) || 1;
    return { r: p[0], z: p[1], nr: nr / len, nz: nz / len };
  });
  const pos = [];
  const nrm = [];
  const uvs = [];
  const idx = [];
  for (let i = 0; i < n; i++) {
    for (let s = 0; s <= segs; s++) {
      const th = (s / segs) * Math.PI * 2;
      const c = Math.cos(th);
      const si = Math.sin(th);
      pos.push(pr[i].r * c, pr[i].r * si, pr[i].z);
      nrm.push(pr[i].nr * c, pr[i].nr * si, pr[i].nz);
      uvs.push(s / segs, i / Math.max(1, n - 1));
    }
  }
  const stride = segs + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < segs; s++) {
      const i0 = i * stride + s;
      const i1 = i0 + 1;
      const i2 = i0 + stride;
      const i3 = i2 + 1;
      idx.push(i0, i2, i1, i1, i2, i3);
    }
  }
  const b = boundsOf(pos);
  return packMesh(pos, nrm, uvs, idx, b.min, b.max, b.r);
}

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

/** Chunky toy thumbtack: short peg, wide brim, glossy dome. */
function bakeNail() {
  return latheZ([
    [0.024, -0.07],
    [0.04, -0.02],
    [0.046, 0.03],
    [0.06, 0.055],
    [0.132, 0.068],
    [0.152, 0.09],
    [0.142, 0.118],
    [0.108, 0.148],
    [0.058, 0.17],
    [0.0, 0.186],
  ], 20);
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
    asset: { version: '2.0', generator: 'bake-lock-nails' },
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
  const yaw = 0.42;
  const pitch = 0.38;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const light = [0.36, 0.72, 0.58];
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
  const scale = 280;
  const cx = W * 0.5;
  const cyi = H * 0.52;
  function project(i) {
    const p = xf(mesh.p[i * 3], mesh.p[i * 3 + 1], mesh.p[i * 3 + 2]);
    const n = xf(mesh.n[i * 3], mesh.n[i * 3 + 1], mesh.n[i * 3 + 2]);
    return [p[0] * scale + cx, -p[1] * scale + cyi, p[2], n[0], n[1], n[2]];
  }
  const verts = [];
  const vcount = mesh.p.length / 3;
  for (let i = 0; i < vcount; i++) verts.push(project(i));
  function shade(nx, ny, nz, metal) {
    const nd = Math.max(0, nx * light[0] + ny * light[1] + nz * light[2]);
    const spec = Math.pow(Math.max(0, ny * 0.4 + nd), metal ? 22 : 8) * (metal ? 90 : 28);
    if (metal) {
      return [
        Math.min(255, 118 + nd * 90 + spec),
        Math.min(255, 126 + nd * 82 + spec),
        Math.min(255, 138 + nd * 72 + spec),
      ];
    }
    return [
      Math.min(255, 228 + nd * 18 + spec * 0.2),
      Math.min(255, 92 + nd * 24 + spec * 0.15),
      Math.min(255, 72 + nd * 16 + spec * 0.1),
    ];
  }
  function edge(a, b, x, y) {
    return (x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0]);
  }
  const metalFrom = mesh.metalFrom ?? 0;
  for (let t = 0; t < mesh.i.length; t += 3) {
    const ia = mesh.i[t];
    const a = verts[ia];
    const b = verts[mesh.i[t + 1]];
    const c = verts[mesh.i[t + 2]];
    const area = edge(a, b, c[0], c[1]);
    if (area <= 1) continue;
    const metal = ia >= metalFrom;
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
        const col = shade(nx, ny, nz, metal);
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

function nailSpots() {
  const s = 0.32;
  return [[-s, s], [s, s], [-s, -s], [s, -s]];
}

function buildPrefab() {
  fid = 1;
  const name = 'LockNails';
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
  nailSpots().forEach((p, i) => {
    const n = addNode(doc, {
      name: `Nail${i}`,
      parentId: root.id,
      x: p[0],
      y: p[1],
      z: 0.5,
    });
    addPrefabInfo(doc, n.id, assetRef, false);
    addMeshRenderer(doc, n.id, MESH_NAIL, UUID.MatIron, true, true);
  });
  write(path.join(ASSETS, `prefabs/${name}.prefab`), doc.json());
  write(path.join(ASSETS, `prefabs/${name}.prefab.meta`), prefabMeta(UUID.LockNails, name));
}

function bakePreviewScene(nail) {
  const brick = bakeRoundedBox(0.5, 0.5, 0.5, 0.12, 5);
  const out = { p: brick.p.slice(), n: brick.n.slice(), u: brick.u.slice(), i: brick.i.slice() };
  const metalFrom = out.p.length / 3;
  for (const [x, y] of nailSpots()) {
    const copy = {
      p: nail.p.slice(),
      n: nail.n.slice(),
      u: nail.u.slice(),
      i: nail.i.slice(),
    };
    for (let k = 0; k < copy.p.length; k += 3) {
      copy.p[k] += x;
      copy.p[k + 1] += y;
      copy.p[k + 2] += 0.5;
    }
    appendMesh(out, copy);
  }
  const packed = packMesh(out.p, out.n, out.u, out.i, [-0.55, -0.55, -0.55], [0.55, 0.55, 0.7], 0.9);
  packed.metalFrom = metalFrom;
  return packed;
}

const nail = bakeNail();
MESH_ID[UUID.GltfNail].tris = nail.i.length / 3;
writeGltf(path.join(ASSETS, 'models/lock-nail'), 'LockNail', nail, UUID.GltfNail);
write(path.join(ASSETS, 'resources/meshes/lock-nail.json'), {
  p: nail.p,
  n: nail.n,
  u: nail.u,
  i: nail.i,
  min: nail.min,
  max: nail.max,
  r: nail.r,
});
write(path.join(ASSETS, 'resources/meshes/lock-nail.json.meta'), jsonMeta(UUID.MeshNailJson));
buildPrefab();
writePreview(bakePreviewScene(nail), path.join(ROOT, 'tools/lock-nails-preview.png'));
console.log(`LockNails baked: ${MESH_ID[UUID.GltfNail].tris} tris`);
