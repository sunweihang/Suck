'use strict';

/**
 * Import original Shoot a Cube Puzzle! voxel mesh + M_Pixel bump.
 * Mesh: exported/resources/meshes/Voxel_0.obj
 * Bump: T_normal_3 from datapack (Toony Colors Pro _BumpMap)
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
  'Voxel_0.obj',
);
const BUMP_SRC = path.join(ROOT, 'tmp-cube-pack', 'voxel-mats', 'T_normal_3_572.png');

const UUID = {
  MeshBlockJson: '7e22bb20-0301-4b02-8002-000000000001',
  GltfBlock: '7e22bb20-0311-4b02-8002-000000000001',
  BumpImg: '9d16cc10-0400-4a01-8001-000000000001',
};

const MESH_ID = 'e1d15';

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
  const map = new Map();
  for (const tri of faces) {
    for (const f of tri) {
      const key = `${f.v}/${f.t}/${f.n}`;
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
    asset: { version: '2.0', generator: 'import-voxel-block' },
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
      type: 'normalmap',
      fixAlphaTransparencyArtifacts: false,
      hasAlpha: true,
      redirect: tex,
    },
  };
}

function main() {
  if (!fs.existsSync(SRC)) throw new Error(`missing ${SRC}`);
  if (!fs.existsSync(BUMP_SRC)) throw new Error(`missing ${BUMP_SRC}`);

  const mesh = parseObj(SRC);
  writeGltf(path.join(ASSETS, 'models/toy-block'), 'ToyBlock', mesh, UUID.GltfBlock, MESH_ID);
  write(path.join(ASSETS, 'resources/meshes/toy-block.json'), {
    p: mesh.p,
    n: mesh.n,
    u: mesh.u,
    i: mesh.i,
    min: mesh.min,
    max: mesh.max,
    r: mesh.r,
  });
  write(path.join(ASSETS, 'resources/meshes/toy-block.json.meta'), {
    ver: '2.0.1',
    importer: 'json',
    imported: true,
    uuid: UUID.MeshBlockJson,
    files: ['.json'],
    subMetas: {},
    userData: {},
  });

  const bumpDst = path.join(ASSETS, 'resources/toys/t-normal-3.png');
  fs.copyFileSync(BUMP_SRC, bumpDst);
  write(`${bumpDst}.meta`, imageMeta(UUID.BumpImg, 't-normal-3'));

  console.log('voxel mesh verts', mesh.p.length / 3, 'tris', mesh.i.length / 3);
  console.log('size', mesh.max.map((v, i) => +(v - mesh.min[i]).toFixed(4)));
  console.log('wrote Voxel_0 + T_normal_3');
}

main();
