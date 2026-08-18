'use strict';

/** Import original Super_Shooter mesh + T_Super_Shooter for inactive/queued turrets. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(
  process.env.USERPROFILE || '',
  'Documents',
  'leidian14',
  'Pictures',
  'Shoot a Cube Puzzle!',
  'exported',
  'resources',
);
const OBJ = path.join(SRC, 'meshes', 'Super_Shooter.obj');
const TEX = path.join(SRC, 'textures', 'T_Super_Shooter.png');
const FALLBACK_TEX = path.join(ROOT, 'tmp-cube-pack', 'colors', 'T_Super_Shooter.png');

const UUID = {
  MeshJson: '7e22bb20-030c-4b02-8002-00000000000c',
  TexImg: '9d16cc10-0402-4a01-8001-000000000003',
};

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
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const v of pos) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], v[k]);
      max[k] = Math.max(max[k], v[k]);
    }
  }
  const cx = (min[0] + max[0]) * 0.5;
  const cz = (min[2] + max[2]) * 0.5;
  const y0 = min[1];
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
        p.push(vp[0] - cx, vp[1] - y0, vp[2] - cz);
        const np = f.n >= 0 && nrm[f.n] ? nrm[f.n] : [0, 1, 0];
        n.push(np[0], np[1], np[2]);
        const tp = f.t >= 0 && uvs[f.t] ? uvs[f.t] : [0, 0];
        u.push(tp[0], tp[1]);
      }
      idx.push(i);
    }
  }
  const outMin = [Infinity, Infinity, Infinity];
  const outMax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      outMin[k] = Math.min(outMin[k], p[i + k]);
      outMax[k] = Math.max(outMax[k], p[i + k]);
    }
  }
  const r = Math.hypot(
    Math.max(Math.abs(outMin[0]), Math.abs(outMax[0])),
    Math.max(Math.abs(outMin[1]), Math.abs(outMax[1])),
    Math.max(Math.abs(outMin[2]), Math.abs(outMax[2])),
  );
  return { p, n, u, i: idx, min: outMin, max: outMax, r };
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

function main() {
  if (!fs.existsSync(OBJ)) throw new Error(`missing ${OBJ}`);
  const mesh = parseObj(OBJ);
  const meshDir = path.join(ROOT, 'assets', 'resources', 'meshes');
  fs.mkdirSync(meshDir, { recursive: true });
  fs.writeFileSync(
    path.join(meshDir, 'super-shooter.json'),
    `${JSON.stringify(mesh)}\n`,
  );
  fs.writeFileSync(
    path.join(meshDir, 'super-shooter.json.meta'),
    `${JSON.stringify({
      ver: '2.0.1',
      importer: 'json',
      imported: true,
      uuid: UUID.MeshJson,
      files: ['.json'],
      subMetas: {},
      userData: {},
    }, null, 2)}\n`,
  );

  const texSrc = fs.existsSync(TEX) ? TEX : FALLBACK_TEX;
  const texDst = path.join(ROOT, 'assets', 'resources', 'toys', 'super-shooter.png');
  fs.copyFileSync(texSrc, texDst);
  fs.writeFileSync(`${texDst}.meta`, `${JSON.stringify(imageMeta(UUID.TexImg, 'super-shooter'), null, 2)}\n`);

  console.log('super-shooter verts', mesh.p.length / 3, 'tris', mesh.i.length / 3);
  console.log('size', mesh.max.map((v, i) => +(v - mesh.min[i]).toFixed(4)));
  console.log('tex', texSrc);
}

main();
