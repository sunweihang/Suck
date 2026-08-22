'use strict';

// Ice overlay is now the AI gem chunk from tools/import-ice-overlay.py.
// Do not run this file to regenerate assets/resources/ui/ice-overlay.png.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets/resources/ui/ice-overlay.png');
const UUID = '7e22bb20-00f1-4b02-8002-0000000000f1';
const SIZE = 256;

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
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]));
}

function blend(px, i, r, g, b, a) {
  if (a <= 0) return;
  const oa = px[i + 3] / 255;
  const na = a / 255;
  const out = na + oa * (1 - na);
  if (out <= 0) return;
  px[i] = Math.round((r * na + px[i] * oa * (1 - na)) / out);
  px[i + 1] = Math.round((g * na + px[i + 1] * oa * (1 - na)) / out);
  px[i + 2] = Math.round((b * na + px[i + 2] * oa * (1 - na)) / out);
  px[i + 3] = Math.round(out * 255);
}

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0];
    const yi = pts[i][1];
    const xj = pts[j][0];
    const yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-6) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function edgeDist(x, y, pts) {
  let best = 1e9;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy || 1;
    let t = ((x - a[0]) * dx + (y - a[1]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a[0] + dx * t;
    const py = a[1] + dy * t;
    const d = Math.hypot(x - px, y - py);
    if (d < best) best = d;
  }
  return best;
}

function blob(cx, cy, radius, sides, rot, jagged) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const j = 0.78 + jagged * Math.sin(i * 1.9 + rot * 2.2);
    pts.push([cx + Math.cos(a) * radius * j, cy + Math.sin(a) * radius * j]);
  }
  return pts;
}

function spike(cx, cy, len, wide, ang) {
  const nx = Math.cos(ang);
  const ny = Math.sin(ang);
  const px = -ny;
  const py = nx;
  return [
    [cx + nx * len, cy + ny * len],
    [cx + px * wide - nx * 4, cy + py * wide - ny * 4],
    [cx - px * wide - nx * 4, cy - py * wide - ny * 4],
  ];
}

function paintShard(px, pts, fill, edge, glow) {
  let minX = SIZE;
  let minY = SIZE;
  let maxX = 0;
  let maxY = 0;
  for (const p of pts) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  }
  minX = Math.max(0, Math.floor(minX) - 2);
  minY = Math.max(0, Math.floor(minY) - 2);
  maxX = Math.min(SIZE - 1, Math.ceil(maxX) + 2);
  maxY = Math.min(SIZE - 1, Math.ceil(maxY) + 2);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!inPoly(x + 0.5, y + 0.5, pts)) continue;
      const d = edgeDist(x + 0.5, y + 0.5, pts);
      const rim = Math.max(0, 1 - d / 7);
      const i = (y * SIZE + x) * 4;
      blend(px, i, fill[0], fill[1], fill[2], fill[3]);
      if (rim > 0.15) {
        blend(px, i, edge[0], edge[1], edge[2], Math.round(edge[3] * rim));
      }
      if (glow && d < 3) {
        blend(px, i, 230, 250, 255, Math.round(90 * (1 - d / 3)));
      }
    }
  }
}

function drawIce() {
  const px = Buffer.alloc(SIZE * SIZE * 4);
  const cx = 128;
  const cy = 128;
  const slabs = [
    [cx, cy, 108, 8, -0.12, 0.16],
    [cx + 6, cy + 4, 92, 7, 0.38, 0.14],
    [cx - 8, cy - 2, 86, 6, 1.05, 0.18],
    [cx + 18, cy - 22, 54, 6, 0.2, 0.2],
    [cx - 22, cy - 18, 50, 5, 1.7, 0.18],
    [cx + 24, cy + 20, 48, 6, 0.9, 0.16],
    [cx - 26, cy + 22, 46, 5, 2.3, 0.17],
    [cx, cy + 28, 44, 6, -0.5, 0.15],
  ];
  for (let s = 0; s < slabs.length; s++) {
    const [x, y, r, n, rot, jag] = slabs[s];
    paintShard(
      px,
      blob(x, y, r, n, rot, jag),
      s === 0 ? [118, 198, 236, 72] : [156, 220, 248, 54],
      s === 0 ? [220, 246, 255, 200] : [236, 250, 255, 150],
      s < 3,
    );
  }
  const spikes = [
    [cx, cy - 78, 46, 18, -Math.PI / 2],
    [cx + 62, cy - 48, 40, 16, -0.7],
    [cx - 60, cy - 50, 40, 16, -2.4],
    [cx + 78, cy + 8, 38, 15, 0.08],
    [cx - 78, cy + 10, 38, 15, 3.05],
    [cx + 52, cy + 58, 36, 15, 0.85],
    [cx - 54, cy + 56, 36, 15, 2.3],
    [cx + 10, cy + 80, 34, 14, 1.45],
    [cx - 16, cy + 78, 32, 14, 1.75],
  ];
  for (const [x, y, len, wide, ang] of spikes) {
    paintShard(px, spike(x, y, len, wide, ang), [170, 226, 248, 70], [245, 252, 255, 190], true);
  }

  for (let i = 0; i < 18; i++) {
    const a = i * 0.7 + 0.3;
    const r = 38 + (i % 5) * 14;
    const x = Math.round(cx + Math.cos(a) * r);
    const y = Math.round(cy + Math.sin(a * 1.15) * r * 0.92);
    const spark = 1 + (i % 3);
    for (let dy = -spark; dy <= spark; dy++) {
      for (let dx = -spark; dx <= spark; dx++) {
        const pxX = x + dx;
        const pxY = y + dy;
        if (pxX < 0 || pxY < 0 || pxX >= SIZE || pxY >= SIZE) continue;
        const d = Math.hypot(dx, dy);
        if (d > spark) continue;
        blend(px, (pxY * SIZE + pxX) * 4, 255, 255, 255, Math.round(160 * (1 - d / (spark + 0.2))));
      }
    }
  }
  return px;
}

function writeMeta() {
  const meta = {
    ver: '1.0.27',
    importer: 'image',
    imported: true,
    uuid: UUID,
    files: ['.json', '.png'],
    subMetas: {
      '6c48a': {
        importer: 'texture',
        uuid: `${UUID}@6c48a`,
        displayName: 'ice-overlay',
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
          imageUuidOrDatabaseUri: UUID,
          visible: false,
        },
        ver: '1.0.22',
        imported: true,
        files: ['.json'],
        subMetas: {},
      },
      f9941: {
        importer: 'sprite-frame',
        uuid: `${UUID}@f9941`,
        displayName: 'ice-overlay',
        id: 'f9941',
        name: 'spriteFrame',
        userData: {
          trimThreshold: 1,
          rotated: false,
          offsetX: 0,
          offsetY: 0,
          trimX: 0,
          trimY: 0,
          width: SIZE,
          height: SIZE,
          rawWidth: SIZE,
          rawHeight: SIZE,
          borderTop: 0,
          borderBottom: 0,
          borderLeft: 0,
          borderRight: 0,
          packable: false,
          pixelsToUnit: 100,
          pivotX: 0.5,
          pivotY: 0.5,
          meshType: 0,
          vertices: {
            rawPosition: [-128, -128, 0, 128, -128, 0, -128, 128, 0, 128, 128, 0],
            indexes: [0, 1, 2, 2, 1, 3],
            uv: [0, SIZE, SIZE, SIZE, 0, 0, SIZE, 0],
            nuv: [0, 0, 1, 0, 0, 1, 1, 1],
            minPos: [-128, -128, 0],
            maxPos: [128, 128, 0],
          },
          isUuid: true,
          imageUuidOrDatabaseUri: `${UUID}@6c48a`,
          atlasUuid: '',
          trimType: 'none',
        },
        ver: '1.0.12',
        imported: true,
        files: ['.json'],
        subMetas: {},
      },
    },
    userData: {
      type: 'sprite-frame',
      fixAlphaTransparencyArtifacts: true,
      hasAlpha: true,
      redirect: `${UUID}@6c48a`,
      maxWidth: 512,
      maxHeight: 512,
      compressSettings: {
        useCompressTexture: false,
        presetId: 'webUi',
      },
    },
  };
  fs.writeFileSync(`${OUT}.meta`, `${JSON.stringify(meta, null, 2)}\n`);
}

writeRgbaPng(OUT, SIZE, SIZE, drawIce());
writeMeta();
console.log('wrote', path.relative(ROOT, OUT));
