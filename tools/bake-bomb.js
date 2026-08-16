'use strict';

/** Bake a one-piece toy bomb mesh (body + cap + fuse) for colored bomb blocks. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');

const UUID = {
  GltfBomb: '7e22bb20-0317-4b02-8002-000000000007',
  MeshBombJson: '7e22bb20-0307-4b02-8002-000000000007',
  MeshTrimJson: '7e22bb20-0308-4b02-8002-000000000008',
};

const MESH_ID = {
  [UUID.GltfBomb]: { id: 'b0b01', name: 'ToyBomb', tris: 0 },
};

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`);
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
      assetFinder: { meshes: [meshUuid], skeletons: [], textures: [], materials: [], scenes: [] },
    },
  };
}

function packMesh(p, n, u, i) {
  let minX = 1e9;
  let minY = 1e9;
  let minZ = 1e9;
  let maxX = -1e9;
  let maxY = -1e9;
  let maxZ = -1e9;
  for (let k = 0; k < p.length; k += 3) {
    minX = Math.min(minX, p[k]);
    minY = Math.min(minY, p[k + 1]);
    minZ = Math.min(minZ, p[k + 2]);
    maxX = Math.max(maxX, p[k]);
    maxY = Math.max(maxY, p[k + 1]);
    maxZ = Math.max(maxZ, p[k + 2]);
  }
  return {
    p, n, u, i,
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    r: Math.hypot(maxX, maxY, maxZ),
  };
}

function appendMesh(dst, src) {
  const base = dst.p.length / 3;
  for (let i = 0; i < src.p.length; i++) dst.p.push(src.p[i]);
  for (let i = 0; i < src.n.length; i++) dst.n.push(src.n[i]);
  for (let i = 0; i < src.u.length; i++) dst.u.push(src.u[i]);
  for (let i = 0; i < src.i.length; i++) dst.i.push(src.i[i] + base);
}

function emptyMesh() {
  return { p: [], n: [], u: [], i: [] };
}

/** Lathe [r, y] around +Y. */
function latheY(profile, segs) {
  const n = profile.length;
  const pos = [];
  const nrm = [];
  const uvs = [];
  const idx = [];
  for (let i = 0; i < n; i++) {
    const prev = profile[Math.max(0, i - 1)];
    const next = profile[Math.min(n - 1, i + 1)];
    let nr = next[1] - prev[1];
    let ny = prev[0] - next[0];
    const len = Math.hypot(nr, ny) || 1;
    nr /= len;
    ny /= len;
    for (let s = 0; s <= segs; s++) {
      const th = (s / segs) * Math.PI * 2;
      const c = Math.cos(th);
      const si = Math.sin(th);
      pos.push(profile[i][0] * si, profile[i][1], profile[i][0] * c);
      nrm.push(nr * si, ny, nr * c);
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
  return packMesh(pos, nrm, uvs, idx);
}

function sphere(cx, cy, cz, r, su, sv) {
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
  return packMesh(pos, nrm, uvs, idx);
}

function tube(path, radius, segs) {
  const pos = [];
  const nrm = [];
  const uvs = [];
  const idx = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const q = i < path.length - 1 ? path[i + 1] : path[i];
    const prev = i > 0 ? path[i - 1] : path[i];
    let tx = q[0] - prev[0];
    let ty = q[1] - prev[1];
    let tz = q[2] - prev[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    let bx = -ty;
    let by = tx;
    let bz = 0;
    if (Math.hypot(bx, by, bz) < 1e-4) {
      bx = 0;
      by = -tz;
      bz = ty;
    }
    const bl = Math.hypot(bx, by, bz) || 1;
    bx /= bl;
    by /= bl;
    bz /= bl;
    const nx = ty * bz - tz * by;
    const ny = tz * bx - tx * bz;
    const nz = tx * by - ty * bx;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const vx = bx * c + nx * s;
      const vy = by * c + ny * s;
      const vz = bz * c + nz * s;
      pos.push(p[0] + vx * radius, p[1] + vy * radius, p[2] + vz * radius);
      nrm.push(vx, vy, vz);
      uvs.push(j / segs, i / Math.max(1, path.length - 1));
    }
  }
  for (let i = 0; i < path.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      const a = i * segs + j;
      const b = i * segs + j1;
      const c = (i + 1) * segs + j;
      const d = (i + 1) * segs + j1;
      idx.push(a, c, b, b, c, d);
    }
  }
  return packMesh(pos, nrm, uvs, idx);
}

function bakeBody() {
  return sphere(0, -0.02, 0, 0.46, 28, 18);
}

function bakeTrim() {
  const mesh = emptyMesh();
  appendMesh(mesh, latheY([
    [0.06, 0.40],
    [0.26, 0.405],
    [0.28, 0.43],
    [0.26, 0.452],
    [0.08, 0.46],
    [0.07, 0.56],
    [0.00, 0.57],
  ], 24));
  appendMesh(mesh, tube([
    [0.00, 0.57, 0.00],
    [0.05, 0.70, 0.02],
    [0.14, 0.80, 0.04],
    [0.22, 0.84, 0.02],
  ], 0.04, 9));
  appendMesh(mesh, sphere(0.23, 0.84, 0.02, 0.07, 12, 8));
  return packMesh(mesh.p, mesh.n, mesh.u, mesh.i);
}

function bakeWhole() {
  const mesh = emptyMesh();
  appendMesh(mesh, bakeBody());
  appendMesh(mesh, bakeTrim());
  return packMesh(mesh.p, mesh.n, mesh.u, mesh.i);
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
    asset: { version: '2.0', generator: 'bake-bomb' },
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

function writePreview(file, mesh) {
  const W = 256;
  const H = 256;
  const buf = Buffer.alloc(W * H * 4);
  const zbuf = new Float32Array(W * H);
  zbuf.fill(-1e9);
  const pos = mesh.p;
  const nrm = mesh.n;
  const idx = mesh.i;
  const scale = 118;
  const ox = W * 0.5;
  const oy = H * 0.58;
  function shade(nx, ny, nz) {
    const l = Math.max(0, nx * 0.35 + ny * 0.82 + nz * 0.45);
    const spec = Math.max(0, nx * 0.2 + ny * 0.9 + nz * 0.3) ** 18;
    const r = Math.min(255, 42 * (0.55 + 0.7 * l) + spec * 180);
    const g = Math.min(255, 44 * (0.52 + 0.7 * l) + spec * 170);
    const b = Math.min(255, 54 * (0.5 + 0.68 * l) + spec * 160);
    return [r, g, b];
  }
  function edge(a, b, x, y) {
    return (x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0]);
  }
  for (let t = 0; t < idx.length; t += 3) {
    const ia = idx[t] * 3;
    const ib = idx[t + 1] * 3;
    const ic = idx[t + 2] * 3;
    const a = [pos[ia] * scale + ox, -pos[ia + 1] * scale + oy, pos[ia + 2], nrm[ia], nrm[ia + 1], nrm[ia + 2]];
    const b = [pos[ib] * scale + ox, -pos[ib + 1] * scale + oy, pos[ib + 2], nrm[ib], nrm[ib + 1], nrm[ib + 2]];
    const c = [pos[ic] * scale + ox, -pos[ic + 1] * scale + oy, pos[ic + 2], nrm[ic], nrm[ic + 1], nrm[ic + 2]];
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const area = edge(a, b, c[0], c[1]);
    if (area <= 1e-4) continue;
    const invA = 1 / area;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w0 = edge(b, c, x + 0.5, y + 0.5) * invA;
        const w1 = edge(c, a, x + 0.5, y + 0.5) * invA;
        const w2 = edge(a, b, x + 0.5, y + 0.5) * invA;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
        const pi = y * W + x;
        if (z <= zbuf[pi]) continue;
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

function main() {
  const body = bakeBody();
  const trim = bakeTrim();
  const whole = bakeWhole();
  MESH_ID[UUID.GltfBomb].tris = whole.i.length / 3;
  writeMeshJson('bomb-body', body, UUID.MeshBombJson);
  writeMeshJson('bomb-trim', trim, UUID.MeshTrimJson);
  writeGltf(path.join(ASSETS, 'models/toy-bomb'), 'ToyBomb', whole, UUID.GltfBomb);
  writePreview(path.join(ROOT, 'tools/bomb-model-preview.png'), whole);
  console.log(`bomb tris=${MESH_ID[UUID.GltfBomb].tris} body=${body.i.length / 3} trim=${trim.i.length / 3}`);
}

main();
