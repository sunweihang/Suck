'use strict';

/**
 * Soft original-matching shot sprites: gaussian orb + short comet trail.
 * Video 592×1280: tip 3px, mid 6px, tail 3px, length 88px, halo 10px.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const FX = path.join(ROOT, 'assets/resources/fx');
const R = 248;
const G = 246;
const B = 255;

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
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]));
}

function put(rgba, o, a) {
  rgba[o] = R;
  rgba[o + 1] = G;
  rgba[o + 2] = B;
  rgba[o + 3] = Math.max(0, Math.min(255, Math.round(255 * a)));
}

function drawBall(w, h) {
  const rgba = Buffer.alloc(w * h * 4);
  const cx = (w - 1) * 0.5;
  const cy = (h - 1) * 0.5;
  const rMax = Math.min(cx, cy);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = Math.hypot((x - cx) / rMax, (y - cy) / rMax);
      const core = Math.exp(-r * r * 14);
      const mid = Math.exp(-r * r * 5.4);
      const halo = Math.exp(-r * r * 2.1);
      const edge = r > 0.94 ? Math.max(0, 1 - (r - 0.94) / 0.06) : 1;
      put(rgba, (y * w + x) * 4, (core * 0.78 + mid * 0.28 + halo * 0.2) * edge);
    }
  }
  return rgba;
}

function drawGlow(w, h) {
  const rgba = Buffer.alloc(w * h * 4);
  const cx = (w - 1) * 0.5;
  const cy = (h - 1) * 0.5;
  const rMax = Math.min(cx, cy);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = Math.hypot((x - cx) / rMax, (y - cy) / rMax);
      const a = Math.exp(-r * r * 1.7) * 0.92;
      const edge = r > 0.92 ? Math.max(0, 1 - (r - 0.92) / 0.08) : 1;
      put(rgba, (y * w + x) * 4, a * edge);
    }
  }
  return rgba;
}

/** U along flight (0 = head), V across. Soft spindle, no hard side edges. */
function drawTrail(w, h) {
  const rgba = Buffer.alloc(w * h * 4);
  const cy = (h - 1) * 0.5;
  for (let x = 0; x < w; x++) {
    const u = x / (w - 1);
    const tip = u < 0.05 ? u / 0.05 : 1;
    const along = Math.pow(1 - u, 1.45) * tip;
    const half = 0.18 + 0.26 * Math.exp(-u * u * 7);
    for (let y = 0; y < h; y++) {
      const dv = Math.abs(y - cy) / (h * 0.5);
      const radial = Math.exp(-(dv / half) * (dv / half) * 2.1);
      put(rgba, (y * w + x) * 4, radial * along);
    }
  }
  return rgba;
}

writeRgbaPng(path.join(FX, 'bullet-ball.png'), 128, 128, drawBall(128, 128));
writeRgbaPng(path.join(FX, 'bullet-glow.png'), 128, 128, drawGlow(128, 128));
writeRgbaPng(path.join(FX, 'bullet-trail.png'), 256, 64, drawTrail(256, 64));
console.log('wrote soft bullet-ball / bullet-glow / bullet-trail');
