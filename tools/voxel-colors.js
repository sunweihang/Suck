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

const RGB_MATCH_DIST2 = 48 * 48;
const PALETTE_MATCH_DIST2 = 96 * 96;
const TOKEN_VOXEL_ID = { o: 11, y: 17, c: 2, g: 7, p: 15, v: 12, r: 14, s: 1, k: 22, m: 4, a: 20, d: 10 };

function rgbOf(colorId) {
  return VOXEL_RGB[colorId] || VOXEL_RGB[0];
}

function dist2(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function isPaperWhite(rgb) {
  const max = Math.max(rgb[0], rgb[1], rgb[2]);
  const min = Math.min(rgb[0], rgb[1], rgb[2]);
  return max >= 190 && max - min <= 28;
}

function rgbLooksSame(a, b) {
  const d = dist2(a, b);
  if (d <= RGB_MATCH_DIST2) return true;
  return d <= PALETTE_MATCH_DIST2 && isPaperWhite(a) && isPaperWhite(b);
}

function officialToken(id) {
  for (const t of TOKENS) if (TOKEN_VOXEL_ID[t] === id) return t;
  return null;
}

/** One colorId → one token. Authored tints win uniquely (white [255,255,255] → voxel 16). */
function rebalanceTokenMap(map, counts, unitPower) {
  for (let guard = 0; guard < 16; guard++) {
    const bricks = {};
    const ids = Object.keys(counts).map(Number);
    for (const id of ids) {
      const t = map[id];
      bricks[t] = (bricks[t] || 0) + counts[id];
    }
    let shortTok = null;
    let shortBy = 0;
    for (const token of TOKENS) {
      const gap = (bricks[token] || 0) - (unitPower[token] || 0);
      if (gap > shortBy) {
        shortBy = gap;
        shortTok = token;
      }
    }
    if (!shortTok) return;
    const group = ids.filter((id) => map[id] === shortTok).sort((a, b) => counts[a] - counts[b]);
    if (group.length < 2) return;
    const move = group[0];
    let dest = null;
    let destSurplus = 0;
    for (const token of TOKENS) {
      const surplus = (unitPower[token] || 0) - (bricks[token] || 0);
      if (surplus > destSurplus) {
        destSurplus = surplus;
        dest = token;
      }
    }
    if (!dest || dest === shortTok) return;
    map[move] = dest;
  }
}

function assignTokensForVoxels(counts, authored, unitPower) {
  const ids = Object.keys(counts).map(Number);
  const byCount = ids.slice().sort((a, b) => counts[b] - counts[a]);
  const used = new Set();
  const map = {};
  const tints = {};

  if (authored) {
    const pairs = [];
    for (const id of ids) {
      const rgb = rgbOf(id);
      for (const token of TOKENS) {
        const tint = authored[token];
        if (!tint || !rgbLooksSame(rgb, tint)) continue;
        pairs.push({ id, token, d: dist2(rgb, tint) });
      }
    }
    pairs.sort((a, b) => a.d - b.d || counts[b.id] - counts[a.id]);
    for (const p of pairs) {
      if (map[p.id] != null || used.has(p.token)) continue;
      map[p.id] = p.token;
      used.add(p.token);
      tints[p.token] = rgbOf(p.id);
    }
  }

  for (const id of byCount) {
    if (map[id] != null) continue;
    const pinned = officialToken(id);
    if (pinned && !used.has(pinned)) {
      map[id] = pinned;
      used.add(pinned);
      tints[pinned] = rgbOf(id);
    }
  }

  for (const id of byCount) {
    if (map[id] != null) continue;
    const rgb = rgbOf(id);
    const reuse = used.size >= TOKENS.length;
    const best = pickSpareToken(rgb, counts[id], map, counts, used, reuse, unitPower);
    map[id] = best;
    used.add(best);
    if (!tints[best]) tints[best] = rgb;
  }
  if (unitPower) rebalanceTokenMap(map, counts, unitPower);
  return { map, tints };
}

function brickCountOn(token, map, counts) {
  let n = 0;
  for (const id of Object.keys(counts).map(Number)) {
    if (map[id] === token) n += counts[id];
  }
  return n;
}

function pickSpareToken(rgb, need, map, counts, used, reuse, unitPower) {
  let best = TOKENS[0];
  let bestD = Infinity;
  if (!reuse) {
    for (const token of TOKENS) {
      if (used.has(token)) continue;
      const d = dist2(rgb, TOKEN_RGB[token]);
      if (d < bestD) {
        bestD = d;
        best = token;
      }
    }
    return best;
  }
  let fit = null;
  let fitD = Infinity;
  let any = TOKENS[0];
  let anySurplus = -1e9;
  for (const token of TOKENS) {
    const surplus = ((unitPower && unitPower[token]) || 0) - brickCountOn(token, map, counts);
    const d = dist2(rgb, TOKEN_RGB[token]);
    if (surplus > anySurplus || (surplus === anySurplus && d < dist2(rgb, TOKEN_RGB[any]))) {
      anySurplus = surplus;
      any = token;
    }
    if (surplus < need) continue;
    if (d < fitD) {
      fitD = d;
      fit = token;
    }
  }
  return fit || any;
}

function assignTokens(counts, authored, unitPower) {
  return assignTokensForVoxels(counts, authored, unitPower);
}

function alignUnitTokens(unitTokens, brickRgb, tints) {
  const unique = [...new Set(unitTokens)];
  const pairs = [];
  for (const ut of unique) {
    const rgb = (tints && tints[ut]) || TOKEN_RGB[ut];
    for (const [bt, brgb] of brickRgb) {
      if (!rgbLooksSame(rgb, brgb)) continue;
      pairs.push({ ut, bt, d: dist2(rgb, brgb) });
    }
  }
  pairs.sort((a, b) => a.d - b.d);
  const mapped = new Map();
  const usedBrick = new Set();
  const usedUnit = new Set();
  for (const p of pairs) {
    if (usedUnit.has(p.ut) || usedBrick.has(p.bt)) continue;
    mapped.set(p.ut, p.bt);
    usedUnit.add(p.ut);
    usedBrick.add(p.bt);
  }
  return mapped;
}

function decodeCatalogLevel(raw) {
  const arr = raw.voxels || [];
  const counts = {};
  for (let i = 0; i + 3 < arr.length; i += 4) {
    const id = arr[i + 3] | 0;
    counts[id] = (counts[id] || 0) + 1;
  }
  const unitPower = {};
  for (const u of raw.units || []) unitPower[u[0]] = (unitPower[u[0]] || 0) + u[1];
  const { map } = assignTokensForVoxels(counts, raw.tints, unitPower);
  const voxels = [];
  for (let i = 0; i + 3 < arr.length; i += 4) {
    const colorId = arr[i + 3] | 0;
    voxels.push({
      x: arr[i] | 0,
      y: arr[i + 1] | 0,
      z: arr[i + 2] | 0,
      token: map[colorId] || officialToken(colorId) || 'o',
      colorId,
    });
  }
  const tints = raw.tints || {};
  const colorRgb = new Map();
  const brickRgb = new Map();
  for (const v of voxels) {
    if (!colorRgb.has(v.colorId)) colorRgb.set(v.colorId, rgbOf(v.colorId));
    if (!brickRgb.has(v.token)) brickRgb.set(v.token, rgbOf(v.colorId));
  }
  const specs = raw.units || [];
  const covers = (token) => {
    const rgb = tints[token] || TOKEN_RGB[token];
    for (const brgb of colorRgb.values()) {
      if (rgbLooksSame(rgb, brgb)) return true;
    }
    return false;
  };
  const orphans = [...new Set(specs.map((u) => u[0]))].filter((t) => !covers(t));
  const aligned = orphans.length ? alignUnitTokens(orphans, brickRgb, tints) : new Map();
  const units = specs.map((u) => [aligned.get(u[0]) || u[0], u[1]]);
  return { id: raw.id, voxels, units, map, counts, tints };
}

function powerGaps(level) {
  const bricks = new Map();
  for (const v of level.voxels) bricks.set(v.token, (bricks.get(v.token) || 0) + 1);
  const power = new Map();
  for (const [t, n] of level.units) power.set(t, (power.get(t) || 0) + n);
  const short = [];
  for (const [t, n] of bricks) {
    const have = power.get(t) || 0;
    if (have < n) short.push({ token: t, have, need: n });
  }
  return { short, bricks, power, colors: new Set(level.voxels.map((v) => v.colorId)).size };
}

function nearestVoxelId(rgb) {
  let best = 16;
  let bestD = Infinity;
  const ids = Object.keys(VOXEL_RGB);
  for (let i = 0; i < ids.length; i++) {
    const id = Number(ids[i]);
    const d = dist2(rgb, VOXEL_RGB[id]);
    if (d < bestD || (d === bestD && id > best)) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

module.exports = {
  VOXEL_RGB,
  TOKENS,
  TOKEN_RGB,
  TOKEN_VOXEL_ID,
  RGB_MATCH_DIST2,
  PALETTE_MATCH_DIST2,
  rgbOf,
  dist2,
  isPaperWhite,
  rgbLooksSame,
  officialToken,
  nearestVoxelId,
  assignTokens,
  assignTokensForVoxels,
  alignUnitTokens,
  decodeCatalogLevel,
  powerGaps,
};
