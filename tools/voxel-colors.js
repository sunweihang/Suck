'use strict';

/** Official ColorLibrarySO ids. RGB is M_Pixel _BaseColor (what the cubes use). */
const VOXEL_RGB = {
  0: [207, 205, 198],
  1: [33, 95, 200],
  2: [17, 183, 214],
  3: [132, 76, 26],
  4: [2, 161, 144],
  5: [113, 118, 125],
  6: [0, 118, 123],
  7: [61, 149, 30],
  8: [18, 101, 37],
  9: [126, 176, 27],
  10: [195, 175, 113],
  11: [214, 123, 19],
  12: [113, 52, 226],
  13: [179, 121, 241],
  14: [207, 36, 48],
  15: [231, 58, 148],
  16: [207, 205, 198],
  17: [224, 197, 43],
  18: [53, 52, 49],
  19: [183, 89, 0],
  20: [238, 143, 199],
  21: [154, 14, 53],
  22: [236, 99, 136],
  23: [168, 127, 87],
  24: [221, 155, 80],
  25: [209, 204, 104],
};

const TOKENS = ['o', 'y', 'c', 'g', 'p', 'v', 'r', 's', 'k', 'm', 'a', 'd'];
const TOKEN_RGB = {
  o: [214, 123, 19],
  y: [224, 197, 43],
  c: [17, 183, 214],
  g: [61, 149, 30],
  p: [231, 58, 148],
  v: [113, 52, 226],
  r: [207, 36, 48],
  s: [33, 95, 200],
  k: [236, 99, 136],
  m: [2, 161, 144],
  a: [238, 143, 199],
  d: [195, 175, 113],
};

function rgbOf(colorId) {
  return VOXEL_RGB[colorId] || VOXEL_RGB[0];
}

function dist2(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/** Map original color ids onto unused tokens, biggest groups first. */
function assignTokens(counts) {
  const ids = Object.keys(counts).map(Number).sort((a, b) => counts[b] - counts[a]);
  const used = new Set();
  const map = {};
  const tints = {};
  for (const id of ids) {
    const rgb = rgbOf(id);
    let best = TOKENS[0];
    let bestD = Infinity;
    for (const t of TOKENS) {
      if (used.has(t)) continue;
      const d = dist2(rgb, TOKEN_RGB[t]);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (used.size >= TOKENS.length) {
      bestD = Infinity;
      for (const t of TOKENS) {
        const d = dist2(rgb, TOKEN_RGB[t]);
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
    }
    map[id] = best;
    used.add(best);
    tints[best] = rgb;
  }
  return { map, tints };
}

module.exports = { VOXEL_RGB, TOKENS, TOKEN_RGB, rgbOf, assignTokens };
