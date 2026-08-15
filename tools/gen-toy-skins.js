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

const COLORS = [
  { id: 0, name: 'orange', rgb: [255, 140, 36], uuid: '9d12cc10-0100-4a01-8001-000000000001' },
  { id: 1, name: 'yellow', rgb: [255, 244, 40], shade: [232, 188, 8], hi: [255, 250, 110], uuid: '9d12cc10-0100-4a01-8001-000000000002' },
  { id: 2, name: 'cyan', rgb: [8, 232, 236], uuid: '9d12cc10-0100-4a01-8001-000000000003' },
  { id: 3, name: 'lime', rgb: [48, 232, 40], uuid: '9d12cc10-0100-4a01-8001-000000000004' },
  { id: 4, name: 'pink', rgb: [255, 72, 168], uuid: '9d12cc10-0100-4a01-8001-000000000005' },
  { id: 5, name: 'violet', rgb: [176, 96, 255], uuid: '9d12cc10-0100-4a01-8001-000000000006' },
  { id: 6, name: 'red', rgb: [255, 48, 68], uuid: '9d12cc10-0100-4a01-8001-000000000007' },
  { id: 7, name: 'sky', rgb: [56, 176, 255], uuid: '9d12cc10-0100-4a01-8001-000000000008' },
  { id: 8, name: 'coral', rgb: [255, 116, 88], uuid: '9d12cc10-0100-4a01-8001-000000000009' },
  { id: 9, name: 'mint', rgb: [0, 220, 124], uuid: '9d12cc10-0100-4a01-8001-00000000000a' },
  { id: 10, name: 'magenta', rgb: [244, 40, 216], uuid: '9d12cc10-0100-4a01-8001-00000000000b' },
  { id: 11, name: 'gold', rgb: [255, 212, 36], shade: [214, 160, 8], hi: [255, 232, 96], uuid: '9d12cc10-0100-4a01-8001-00000000000c' },
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
  return hsvToRgb(h, Math.max(0.42, Math.min(1, s * satMul)), Math.min(valCap, v * valMul));
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

function paint(entry) {
  const base = entry.rgb;
  const hi = entry.hi || tone(base, 0.86, 1.06, 1);
  const shade = entry.shade || tone(base, 1.06, 0.7, 0.86);
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const nx = (x / (SIZE - 1)) * 2 - 1;
      const ny = 1 - (y / (SIZE - 1)) * 2;
      const nz2 = 1 - nx * nx - ny * ny;
      let c = shade;
      if (nz2 > 0) {
        const nz = Math.sqrt(nz2);
        const ndotl = Math.max(0, Math.min(1, (nx * LX + ny * LY + nz * LZ) / LLEN));
        const wrap = 0.42 + 0.58 * ndotl;
        const sheen = ndotl * ndotl * 0.1;
        c = mix(shade, base, wrap);
        c = mix(c, hi, sheen);
      }
      const i = (y * SIZE + x) * 4;
      rgba[i] = Math.max(0, Math.min(255, Math.round(c[0])));
      rgba[i + 1] = Math.max(0, Math.min(255, Math.round(c[1])));
      rgba[i + 2] = Math.max(0, Math.min(255, Math.round(c[2])));
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
fs.writeFileSync(
  path.join(OUT, '..', 'toys.meta'),
  `${JSON.stringify({
    ver: '1.2.0',
    importer: 'directory',
    imported: true,
    uuid: 'c0110001-0001-4001-8001-000000000020',
    files: [],
    subMetas: {},
    userData: {},
  }, null, 2)}\n`,
);

for (const c of COLORS) {
  const file = `clay-${c.name}`;
  fs.writeFileSync(path.join(OUT, `${file}.png`), paint(c));
  fs.writeFileSync(path.join(OUT, `${file}.png.meta`), `${JSON.stringify(imageMeta(c.uuid, file), null, 2)}\n`);
}

console.log(`wrote ${COLORS.length} clay matcaps to assets/resources/toys`);
