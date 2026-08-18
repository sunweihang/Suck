'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LAYER_UI3D = 33554432;
const INK_SHOT = '8c01a1b0-4e21-4f3a-9c11-010000000034';
const PREFAB = '7e22bb20-0035-4b02-8002-000000000035';
const TEX = '7e22bb20-0036-4b02-8002-000000000036';

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
  write(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]));
}

/** Video 592×1280 f001 x152: tip 3px, mid 6px, tail 3px, length 88px, halo 10px. */
function drawSpindle(w, h) {
  const keys = [
    [0.00, 1.8, 0.42],
    [0.04, 3.2, 0.76],
    [0.14, 4.4, 0.88],
    [0.26, 5.0, 0.80],
    [0.42, 3.2, 0.66],
    [0.74, 2.8, 0.58],
    [0.93, 2.4, 0.42],
    [1.00, 1.1, 0.00],
  ];
  const rgba = Buffer.alloc(w * h * 4);
  const cx = (w - 1) * 0.5;
  const halo = 10;
  for (let y = 0; y < h; y++) {
    const along = y / (h - 1);
    let corePx = keys[0][1];
    let alongA = keys[0][2];
    for (let i = 0; i < keys.length - 1; i++) {
      const a0 = keys[i][0];
      const a1 = keys[i + 1][0];
      if (along >= a0 && along <= a1) {
        const t = (along - a0) / (a1 - a0);
        const s = t * t * (3 - 2 * t);
        corePx = keys[i][1] + (keys[i + 1][1] - keys[i][1]) * s;
        alongA = keys[i][2] + (keys[i + 1][2] - keys[i][2]) * s;
        break;
      }
    }
    const coreR = (corePx * 0.5) / (halo * 0.5);
    const glowR = Math.min(0.98, coreR + 0.38);
    for (let x = 0; x < w; x++) {
      const adx = Math.abs(x - cx) / (w * 0.5);
      let a = 0;
      if (adx <= coreR) a = 1 - 0.22 * (adx / Math.max(1e-4, coreR)) ** 2;
      else if (adx < glowR) a = 0.48 * ((1 - (adx - coreR) / (glowR - coreR)) ** 1.65);
      a = Math.min(1, a * alongA);
      const o = (y * w + x) * 4;
      rgba[o] = 248;
      rgba[o + 1] = 246;
      rgba[o + 2] = 255;
      rgba[o + 3] = Math.round(255 * a);
    }
  }
  return rgba;
}

function imageMeta(uuid, name) {
  return {
    ver: '1.0.27',
    importer: 'image',
    imported: true,
    uuid,
    files: ['.json', '.png'],
    subMetas: {
      '6c48a': {
        importer: 'texture',
        uuid: `${uuid}@6c48a`,
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
      redirect: `${uuid}@6c48a`,
    },
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

const w = 64;
const h = 256;
const rgba = drawSpindle(w, h);
writeRgbaPng(path.join(ASSETS, 'resources/fx/shot-streak.png'), w, h, rgba);
write(path.join(ASSETS, 'resources/fx/shot-streak.png.meta'), imageMeta(TEX, 'shot-streak'));
writeRgbaPng(path.join(ASSETS, 'art/vfx/textures/shot-streak.png'), w, h, rgba);

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
const ball = addNode(doc, { name: 'Ball', parentId: root.id, sx: 0.078, sy: 0.078, sz: 0.078 });
addPrefabInfo(doc, ball.id, assetRef, false);
const trail = addNode(doc, { name: 'Trail', parentId: root.id, z: -0.09, sx: 0.042, sy: 0.042, sz: 0.18 });
addPrefabInfo(doc, trail.id, assetRef, false);
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
console.log('wrote video-matched needle texture + InkShot prefab');
