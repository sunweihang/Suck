'use strict';

/**
 * Paint per-color matte clay matcaps. Soft wrap only — no plastic spec.
 * Shade and highlight stay in-hue so yellow does not go mustard.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'resources', 'toys');
const SIZE = 128;

/** Keep in sync with tools/sync-original-colors.js / GameConfig TOKEN_RGB. */
const COLORS = [
  { id: 0, name: 'orange', rgb: [214, 123, 19], uuid: '9d12cc10-0100-4a01-8001-000000000001' },
  { id: 1, name: 'yellow', rgb: [224, 197, 43], shade: [118, 65, 16], hi: [238, 238, 238], uuid: '9d12cc10-0100-4a01-8001-000000000002' },
  { id: 2, name: 'cyan', rgb: [17, 183, 214], uuid: '9d12cc10-0100-4a01-8001-000000000003' },
  { id: 3, name: 'lime', rgb: [61, 149, 30], uuid: '9d12cc10-0100-4a01-8001-000000000004' },
  { id: 4, name: 'pink', rgb: [231, 58, 148], uuid: '9d12cc10-0100-4a01-8001-000000000005' },
  { id: 5, name: 'violet', rgb: [113, 52, 226], uuid: '9d12cc10-0100-4a01-8001-000000000006' },
  { id: 6, name: 'red', rgb: [207, 36, 48], shade: [65, 30, 32], hi: [192, 192, 192], uuid: '9d12cc10-0100-4a01-8001-000000000007' },
  { id: 7, name: 'sky', rgb: [33, 95, 200], uuid: '9d12cc10-0100-4a01-8001-000000000008' },
  { id: 8, name: 'coral', rgb: [236, 99, 136], uuid: '9d12cc10-0100-4a01-8001-000000000009' },
  { id: 9, name: 'mint', rgb: [2, 161, 144], uuid: '9d12cc10-0100-4a01-8001-00000000000a' },
  { id: 10, name: 'magenta', rgb: [238, 143, 199], uuid: '9d12cc10-0100-4a01-8001-00000000000b' },
  { id: 11, name: 'gold', rgb: [195, 175, 113], shade: [130, 71, 51], hi: [255, 255, 255], uuid: '9d12cc10-0100-4a01-8001-00000000000c' },
];

const LX = -0.42;
const LY = 0.78;
const LZ = 0.46;
const LLEN = Math.hypot(LX, LY, LZ);

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const m = i % 6;
  const rgb = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][m];
  return [Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255)];
}

function tone(rgb, satMul, valMul, valCap) {
  const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
  return hsvToRgb(h, Math.max(0.5, Math.min(1, s * satMul)), Math.min(valCap, v * valMul));
}

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(w, h, rgba) {
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
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function paint(_entry) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const nx = (x / (SIZE - 1)) * 2 - 1;
      const ny = 1 - (y / (SIZE - 1)) * 2;
      const nz2 = 1 - nx * nx - ny * ny;
      let wrap = 0.9;
      if (nz2 > 0) {
        const nz = Math.sqrt(nz2);
        const ndotl = Math.max(0, Math.min(1, (nx * LX + ny * LY + nz * LZ) / LLEN));
        wrap = 0.9 + 0.1 * ndotl + ndotl * ndotl * 0.04;
      }
      const lum = Math.max(0, Math.min(255, Math.round(wrap * 255)));
      const i = (y * SIZE + x) * 4;
      rgba[i] = lum;
      rgba[i + 1] = lum;
      rgba[i + 2] = lum;
      rgba[i + 3] = 255;
    }
  }
  return encodePng(SIZE, SIZE, rgba);
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
      hasAlpha: false,
      redirect: `${uuid}@6c48a`,
    },
  };
}

fs.mkdirSync(OUT, { recursive: true });

for (const c of COLORS) {
  const file = `clay-${c.name}`;
  fs.writeFileSync(path.join(OUT, `${file}.png`), paint(c));
  fs.writeFileSync(path.join(OUT, `${file}.png.meta`), `${JSON.stringify(imageMeta(c.uuid, file), null, 2)}\n`);
}

console.log(`wrote ${COLORS.length} clay matcaps to assets/resources/toys`);
