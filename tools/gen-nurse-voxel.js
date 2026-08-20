'use strict';

/**
 * Image → official ColorLibrary voxel sculpture.
 * First subject: nurse / doctor girl (Ernie-Image-Turbo_00003_).
 *
 * Coords match the catalog: x right, y up (0 = feet), z back (0 = camera).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { VOXEL_RGB, TOKENS, assignTokens } = require('./voxel-colors');
const { convert } = require('./import-voxel-levels');
const levelIo = require('./level-io');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'tools', 'models');
const PREVIEW = path.join(OUT_DIR, 'nurse-doctor-preview.png');
const MODEL = path.join(OUT_DIR, 'nurse-doctor.json');

const COLS = 19;
const ROWS = 26;
const DEPTH = 8;

const C = {
  coat: 16,
  teal: 4,
  hair: 19,
  skin: 24,
  blue: 1,
  cyan: 2,
  dark: 18,
  pink: 22,
  brown: 3,
  tan: 23,
};

function key(x, y, z) {
  return `${x},${y},${z}`;
}

const CH = {
  W: C.coat,
  T: C.teal,
  H: C.hair,
  S: C.skin,
  B: C.blue,
  C: C.cyan,
  K: C.dark,
  P: C.pink,
  N: C.brown,
  n: C.tan,
};

/**
 * Top-down rows (last string = y=0). `.` empty.
 * z=0 is the camera face — paint silhouette and features here first.
 */
const FACE = [
  'K.......HHH........',
  'K......HHHHH.......',
  'B......HHHHH.......',
  'C.......HHH........',
  'C.....HHSSSSSHH....',
  'C....HHSBB.BBSHH...',
  'W....HHSPK.KPSHH.B.',
  'WW....HHSPPPSHH....',
  '.WW....HSSSSSH.....',
  '..WW.WWWTTTTWWW.N.N',
  '..CWWWWW.TTT.WWNN.N',
  '...WWWWW.T.WWW.NNNN',
  '...WWWW.W.WWW.NKnN.',
  '....WWWWWWWWW.NNNN.',
  '....WWWWKWWWW.nNNn.',
  '.....WWWWWWWW.N.N..',
  '....W.TTTTTTT.W....',
  '....W.TTT.TTT.W....',
  '....W.TT...TT.W....',
  '......TTT...TTT....',
  '......TTT...TTT....',
  '......TTT...TTT....',
  '......TTT...TTT....',
  '......TT.....TT....',
  '......TT.....TT....',
  '......TT.....TT....',
];

function buildNurse() {
  const grid = new Map();
  const set = (x, y, z, id) => {
    if (x < 0 || y < 0 || z < 0 || x >= COLS || y >= ROWS || z >= DEPTH) return;
    grid.set(key(x, y, z), id);
  };
  const box = (x0, y0, z0, x1, y1, z1, id) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) set(x, y, z, id);
      }
    }
  };
  const stamp = (rows, z) => {
    for (let r = 0; r < rows.length; r++) {
      const y = ROWS - 1 - r;
      const line = rows[r];
      for (let x = 0; x < line.length; x++) {
        const id = CH[line[x]];
        if (id != null) set(x, y, z, id);
      }
    }
  };

  if (FACE.length !== ROWS || FACE.some((line) => line.length !== COLS)) {
    throw new Error(`FACE must be ${COLS}x${ROWS}, got ${FACE[0]?.length}x${FACE.length}`);
  }
  stamp(FACE, 0);

  const depthOf = {
    [C.coat]: 5,
    [C.teal]: 4,
    [C.hair]: 5,
    [C.skin]: 3,
    [C.cyan]: 2,
    [C.blue]: 2,
    [C.dark]: 1,
    [C.pink]: 1,
    [C.brown]: 3,
    [C.tan]: 2,
  };
  for (let r = 0; r < FACE.length; r++) {
    const y = ROWS - 1 - r;
    const line = FACE[r];
    for (let x = 0; x < line.length; x++) {
      const id = CH[line[x]];
      if (id == null) continue;
      const back = depthOf[id] ?? 2;
      for (let z = 1; z <= back; z++) set(x, y, z, id);
    }
  }

  const faced = (x, y) => CH[FACE[ROWS - 1 - y]?.[x]] != null;
  const boxBehind = (x0, y0, z0, x1, y1, z1, id) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        if (!faced(x, y)) continue;
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) set(x, y, z, id);
      }
    }
  };
  boxBehind(6, 9, 4, 12, 16, 6, C.coat);
  boxBehind(7, 11, 2, 11, 16, 4, C.teal);
  boxBehind(15, 10, 2, 18, 14, 4, C.brown);
  boxBehind(16, 12, 1, 17, 13, 2, C.tan);
  // bun ball only on the top knot rows, not the 3-wide stem
  box(7, 23, 3, 11, 25, 6, C.hair);
  box(8, 23, 2, 10, 24, 6, C.hair);
  stamp(FACE, 0);

  const voxels = [];
  grid.forEach((color, k) => {
    const [x, y, z] = k.split(',').map(Number);
    voxels.push({ x, y, z, color });
  });
  return voxels;
}

function packLevel(voxels, id) {
  return convert({ voxels }, id);
}

function asciiFront(voxels) {
  const face = Array.from({ length: COLS * ROWS }, () => ({ z: Infinity, c: -1 }));
  for (const v of voxels) {
    const i = v.y * COLS + v.x;
    if (v.z < face[i].z) face[i] = { z: v.z, c: v.color };
  }
  const ch = {
    16: 'W', 4: 'T', 19: 'H', 24: 'S', 1: 'B', 2: 'C', 18: 'K', 22: 'P', 3: 'N', 23: 'n',
  };
  const lines = [];
  for (let y = ROWS - 1; y >= 0; y--) {
    let line = '';
    for (let x = 0; x < COLS; x++) {
      const c = face[y * COLS + x].c;
      line += c < 0 ? '.' : (ch[c] || '?');
    }
    lines.push(line);
  }
  return lines.join('\n');
}

function shadeOf(rgb) {
  return [
    Math.max(8, Math.round(rgb[0] * 0.42 + 10)),
    Math.max(8, Math.round(rgb[1] * 0.32 + 8)),
    Math.max(8, Math.round(rgb[2] * 0.34 + 8)),
  ];
}

function hiOf(rgb) {
  return [
    Math.min(255, Math.round(rgb[0] * 0.55 + 110)),
    Math.min(255, Math.round(rgb[1] * 0.55 + 110)),
    Math.min(255, Math.round(rgb[2] * 0.55 + 110)),
  ];
}

function writePng(file, w, h, rgba) {
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
  const chunks = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])];
  const push = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = crc32(body);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc >>> 0, 0);
    chunks.push(len, body, tail);
  };
  push('IHDR', ihdr);
  push('IDAT', zlib.deflateSync(raw, { level: 9 }));
  push('IEND', Buffer.alloc(0));
  fs.writeFileSync(file, Buffer.concat(chunks));
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function renderPreview(voxels) {
  const pad = 28;
  const size = 16;
  const yaw = 18 * Math.PI / 180;
  const pitch = 20 * Math.PI / 180;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const project = (x, y, z) => {
    const wx = (x - (COLS - 1) / 2) * cy + (z - (DEPTH - 1) / 2) * sy;
    const wz = -(x - (COLS - 1) / 2) * sy + (z - (DEPTH - 1) / 2) * cy;
    const wy = y - (ROWS - 1) * 0.42;
    return [wx * size, -(wy * cp - wz * sp) * size];
  };
  const corners = [];
  for (const v of voxels) {
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        for (let k = 0; k < 2; k++) corners.push(project(v.x + i, v.y + j, v.z + k));
      }
    }
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of corners) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const w = Math.ceil(maxX - minX + pad * 2);
  const h = Math.ceil(maxY - minY + pad * 2);
  const rgba = Buffer.alloc(w * h * 4, 0);
  const put = (x, y, rgb, a = 255) => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= w || py >= h) return;
    const i = (py * w + px) * 4;
    rgba[i] = rgb[0];
    rgba[i + 1] = rgb[1];
    rgba[i + 2] = rgb[2];
    rgba[i + 3] = a;
  };
  const fillPoly = (pts, rgb) => {
    const ys = pts.map((p) => p[1]);
    const y0 = Math.floor(Math.min(...ys));
    const y1 = Math.ceil(Math.max(...ys));
    for (let y = y0; y <= y1; y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          const t = (y - a[1]) / (b[1] - a[1] || 1);
          xs.push(a[0] + t * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const x0 = Math.floor(xs[i]);
        const x1 = Math.ceil(xs[i + 1]);
        for (let x = x0; x <= x1; x++) put(x, y, rgb);
      }
    }
  };
  const to = (x, y) => [x - minX + pad, y - minY + pad];
  const ordered = voxels.slice().sort((a, b) => (b.z - a.z) || (a.x - b.x) || (a.y - b.y));
  for (const v of ordered) {
    const rgb = VOXEL_RGB[v.color] || [180, 180, 180];
    const shade = shadeOf(rgb);
    const hi = hiOf(rgb);
    const p000 = to(...project(v.x, v.y, v.z));
    const p100 = to(...project(v.x + 1, v.y, v.z));
    const p010 = to(...project(v.x, v.y + 1, v.z));
    const p110 = to(...project(v.x + 1, v.y + 1, v.z));
    const p001 = to(...project(v.x, v.y, v.z + 1));
    const p101 = to(...project(v.x + 1, v.y, v.z + 1));
    const p011 = to(...project(v.x, v.y + 1, v.z + 1));
    const p111 = to(...project(v.x + 1, v.y + 1, v.z + 1));
    fillPoly([p001, p101, p111, p011], shade);
    fillPoly([p100, p101, p111, p110], rgb);
    fillPoly([p010, p110, p111, p011], hi);
    fillPoly([p000, p100, p110, p010], rgb);
  }

  const cell = 14;
  const orthoW = COLS * cell;
  const orthoH = ROWS * cell;
  const sheetW = Math.max(w, orthoW + 24);
  const sheetH = h + orthoH + 36;
  const sheet = Buffer.alloc(sheetW * sheetH * 4, 255);
  for (let i = 0; i < sheet.length; i += 4) {
    sheet[i] = 246;
    sheet[i + 1] = 248;
    sheet[i + 2] = 250;
    sheet[i + 3] = 255;
  }
  const blit = (src, sw, sh, dx, dy) => {
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const si = (y * sw + x) * 4;
        if (src[si + 3] < 8) continue;
        const tx = dx + x;
        const ty = dy + y;
        if (tx < 0 || ty < 0 || tx >= sheetW || ty >= sheetH) continue;
        const di = (ty * sheetW + tx) * 4;
        sheet[di] = src[si];
        sheet[di + 1] = src[si + 1];
        sheet[di + 2] = src[si + 2];
        sheet[di + 3] = 255;
      }
    }
  };
  blit(rgba, w, h, Math.floor((sheetW - w) / 2), 12);

  const face = Array.from({ length: COLS * ROWS }, () => ({ z: Infinity, c: -1 }));
  for (const v of voxels) {
    const i = v.y * COLS + v.x;
    if (v.z < face[i].z) face[i] = { z: v.z, c: v.color };
  }
  const ox = Math.floor((sheetW - orthoW) / 2);
  const oy = h + 24;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = face[(ROWS - 1 - y) * COLS + x].c;
      if (c < 0) continue;
      const rgb = VOXEL_RGB[c];
      for (let py = 0; py < cell - 1; py++) {
        for (let px = 0; px < cell - 1; px++) {
          const tx = ox + x * cell + px;
          const ty = oy + y * cell + py;
          const i = (ty * sheetW + tx) * 4;
          sheet[i] = rgb[0];
          sheet[i + 1] = rgb[1];
          sheet[i + 2] = rgb[2];
          sheet[i + 3] = 255;
        }
      }
    }
  }
  writePng(PREVIEW, sheetW, sheetH, sheet);
  return { w: sheetW, h: sheetH };
}

function patchCatalog(level) {
  const pack = levelIo.loadCatalogPack();
  const levels = pack.levels || [];
  const idx = levels.findIndex((lv) => lv.id === level.id);
  if (idx >= 0) levels[idx] = level;
  else levels.push(level);
  levels.sort((a, b) => a.id - b.id);
  pack.levels = levels;
  levelIo.writeCatalogPack(pack);
  return levels.length;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const voxels = buildNurse();
  const level = packLevel(voxels, 431);
  fs.writeFileSync(MODEL, `${JSON.stringify({
    name: 'nurse-doctor',
    source: 'Ernie-Image-Turbo_00003_',
    cols: COLS,
    rows: ROWS,
    depth: DEPTH,
    voxels,
    level,
  }, null, 2)}\n`);
  const preview = renderPreview(voxels);
  const skipCatalog = process.argv.includes('--preview');
  let count = 430;
  if (!skipCatalog) count = patchCatalog(level);
  console.log(asciiFront(voxels));
  console.log(`voxels=${voxels.length} ${COLS}x${ROWS}x${DEPTH} pal=${level.palette} units=${level.units.length}`);
  console.log(`preview ${preview.w}x${preview.h} ${path.relative(ROOT, PREVIEW)}`);
  if (!skipCatalog) console.log(`catalog levels=${count} id=${level.id}`);
}

main();
