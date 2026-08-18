'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SRC_RAW = path.join(process.env.USERPROFILE || '', '.cursor', 'projects', 'd-Custom-Suck', 'assets');
const SRC = path.join(ROOT, 'assets', 'resources', 'toys');
const OUT = 512;

const FILES = [
  'turret-orange',
  'turret-yellow',
  'turret-cyan',
  'turret-lime',
  'turret-pink',
  'turret-violet',
  'turret-red',
  'turret-sky',
  'turret-coral',
  'turret-mint',
  'turret-magenta',
  'turret-gold',
];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4);
  data.copy(out, 8);
  const crcBuf = Buffer.alloc(4 + data.length);
  crcBuf.write(type, 0);
  data.copy(crcBuf, 4);
  out.writeUInt32BE(crc32(crcBuf), 8 + data.length);
  return out;
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
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
}

function decodeRgb(file) {
  const b = fs.readFileSync(file);
  const u32 = (o) => b.readUInt32BE(o);
  let i = 8;
  const idat = [];
  let w = 0;
  let h = 0;
  while (i < b.length) {
    const len = u32(i);
    const t = b.toString('ascii', i + 4, i + 8);
    if (t === 'IHDR') {
      w = u32(i + 8);
      h = u32(i + 12);
    }
    if (t === 'IDAT') idat.push(b.slice(i + 8, i + 8 + len));
    if (t === 'IEND') break;
    i += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 3;
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * bpp);
  let src = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[src++];
    for (let x = 0; x < stride; x++) {
      const cur = raw[src++];
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const u = y > 0 ? out[(y - 1) * stride + x] : 0;
      const ul = y > 0 && x >= bpp ? out[(y - 1) * stride + x - bpp] : 0;
      let v = cur;
      if (f === 1) v = cur + a;
      else if (f === 2) v = cur + u;
      else if (f === 3) v = cur + ((a + u) >> 1);
      else if (f === 4) {
        const p = a + u - ul;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - u);
        const pc = Math.abs(p - ul);
        v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? u : ul);
      }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, rgb: out };
}

function isBg(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lum = (r + g + b) / 3;
  if (lum > 234) return true;
  if (max > 216 && max - min < 38) return true;
  if (lum > 198 && max - min < 22) return true;
  return false;
}

function punch(rgb, w, h) {
  const n = w * h;
  const mark = new Uint8Array(n);
  const q = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (mark[i]) return;
    const o = i * 3;
    if (!isBg(rgb[o], rgb[o + 1], rgb[o + 2])) return;
    mark[i] = 1;
    q.push(i);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % w;
    const y = (i - x) / w;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }
  const rgba = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    rgba[i * 4] = rgb[o];
    rgba[i * 4 + 1] = rgb[o + 1];
    rgba[i * 4 + 2] = rgb[o + 2];
    rgba[i * 4 + 3] = mark[i] ? 0 : 255;
  }
  return rgba;
}

function erode(rgba, w, h, steps) {
  let cur = rgba;
  for (let s = 0; s < steps; s++) {
    const next = Buffer.from(cur);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        if (cur[i + 3] === 0) continue;
        if (
          cur[i - 1] === 0 ||
          cur[i + 7] === 0 ||
          cur[((y - 1) * w + x) * 4 + 3] === 0 ||
          cur[((y + 1) * w + x) * 4 + 3] === 0
        ) {
          next[i + 3] = 0;
        }
      }
    }
    cur = next;
  }
  return cur;
}

function killHalo(rgba, w, h) {
  const out = Buffer.from(rgba);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (rgba[i + 3] === 0) continue;
      let near = false;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (rgba[((y + dy) * w + x + dx) * 4 + 3] === 0) {
          near = true;
          break;
        }
      }
      if (!near) continue;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const lum = (r + g + b) / 3;
      if (lum > 185 && Math.max(r, g, b) - Math.min(r, g, b) < 52) out[i + 3] = 0;
    }
  }
  return out;
}

function despill(rgba, w, h) {
  const out = Buffer.from(rgba);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (rgba[i + 3] === 0) continue;
      let edge = false;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
        if (rgba[((y + dy) * w + x + dx) * 4 + 3] === 0) {
          edge = true;
          break;
        }
      }
      if (!edge) continue;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max > 210 && max - min < 48) {
        out[i + 3] = 0;
        continue;
      }
      const inward = rgba[((y + (y < h / 2 ? 1 : -1)) * w + x) * 4];
      const ig = rgba[((y + (y < h / 2 ? 1 : -1)) * w + x) * 4 + 1];
      const ib = rgba[((y + (y < h / 2 ? 1 : -1)) * w + x) * 4 + 2];
      out[i] = Math.round(r * 0.35 + inward * 0.65);
      out[i + 1] = Math.round(g * 0.35 + ig * 0.65);
      out[i + 2] = Math.round(b * 0.35 + ib * 0.65);
    }
  }
  return out;
}

function downscale(src, sw, sh, dw, dh) {
  const dst = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor((x * sw) / dw);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / dw));
      const y0 = Math.floor((y * sh) / dh);
      const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / dh));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let c = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * sw + xx) * 4;
          const aa = src[i + 3];
          r += src[i] * aa;
          g += src[i + 1] * aa;
          b += src[i + 2] * aa;
          a += aa;
          c++;
        }
      }
      const o = (y * dw + x) * 4;
      let aa = Math.round(a / c);
      let rr = a > 0 ? Math.round(r / a) : 0;
      let gg = a > 0 ? Math.round(g / a) : 0;
      let bb = a > 0 ? Math.round(b / a) : 0;
      const max = Math.max(rr, gg, bb);
      const min = Math.min(rr, gg, bb);
      if (aa < 210 && max > 200 && max - min < 55) aa = 0;
      dst[o] = rr;
      dst[o + 1] = gg;
      dst[o + 2] = bb;
      dst[o + 3] = aa;
    }
  }
  return dst;
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
      f9941: {
        importer: 'sprite-frame',
        uuid: `${uuid}@f9941`,
        displayName: name,
        id: 'f9941',
        name: 'spriteFrame',
        userData: {
          trimThreshold: 1,
          rotated: false,
          offsetX: 0,
          offsetY: 0,
          trimX: 0,
          trimY: 0,
          width: OUT,
          height: OUT,
          rawWidth: OUT,
          rawHeight: OUT,
          borderTop: 0,
          borderBottom: 0,
          borderLeft: 0,
          borderRight: 0,
          packable: false,
          pixelsToUnit: 100,
          pivotX: 0.5,
          pivotY: 0.5,
          meshType: 0,
          isUuid: true,
          imageUuidOrDatabaseUri: tex,
          atlasUuid: '',
          trimType: 'auto',
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
      redirect: tex,
    },
  };
}

function main() {
  FILES.forEach((name, i) => {
    const raw = path.join(SRC_RAW, `${name}.png`);
    const src = fs.existsSync(raw) ? raw : path.join(SRC, `${name}.png`);
    const { w, h, rgb } = decodeRgb(src);
    const punched = killHalo(despill(erode(punch(rgb, w, h), w, h, 5), w, h), w, h);
    const small = downscale(punched, w, h, OUT, OUT);
    const dest = path.join(SRC, `${name}.png`);
    writePng(dest, OUT, OUT, small);
    const uuid = `9d12cc10-040${i.toString(16)}-4a01-8001-00000000004${i.toString(16)}`;
    fs.writeFileSync(`${dest}.meta`, `${JSON.stringify(imageMeta(uuid, name), null, 2)}\n`);
    console.log(name, w, '->', OUT, uuid);
  });
}

main();
