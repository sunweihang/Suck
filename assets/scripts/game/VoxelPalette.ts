import { ColorToken, TOKEN_RGB } from './GameConfig';

export type VoxelLook = {
  rgb: readonly [number, number, number];
  shade: readonly [number, number, number];
  hi: readonly [number, number, number];
};

/** Official ColorLibrarySO / M_Pixel _BaseColor, _SColor, _HColor. */
const LOOK: Record<number, VoxelLook> = {
  0: { rgb: [207, 205, 198], shade: [65, 30, 32], hi: [202, 202, 202] },
  1: { rgb: [33, 95, 200], shade: [47, 37, 77], hi: [35, 234, 255] },
  2: { rgb: [17, 183, 214], shade: [53, 36, 79], hi: [192, 192, 192] },
  3: { rgb: [132, 76, 26], shade: [48, 28, 24], hi: [255, 255, 255] },
  4: { rgb: [2, 161, 144], shade: [40, 96, 108], hi: [255, 255, 255] },
  5: { rgb: [113, 118, 125], shade: [55, 48, 46], hi: [255, 255, 255] },
  6: { rgb: [0, 118, 123], shade: [37, 78, 82], hi: [255, 255, 255] },
  7: { rgb: [61, 149, 30], shade: [35, 77, 27], hi: [255, 255, 255] },
  8: { rgb: [18, 101, 37], shade: [46, 72, 35], hi: [255, 255, 255] },
  9: { rgb: [126, 176, 27], shade: [35, 77, 27], hi: [255, 255, 255] },
  10: { rgb: [195, 175, 113], shade: [130, 71, 51], hi: [255, 255, 255] },
  11: { rgb: [214, 123, 19], shade: [118, 66, 55], hi: [255, 255, 255] },
  12: { rgb: [113, 52, 226], shade: [21, 8, 24], hi: [192, 192, 192] },
  13: { rgb: [179, 121, 241], shade: [39, 20, 43], hi: [192, 192, 192] },
  14: { rgb: [207, 36, 48], shade: [65, 30, 32], hi: [192, 192, 192] },
  15: { rgb: [231, 58, 148], shade: [55, 18, 34], hi: [192, 192, 192] },
  16: { rgb: [207, 205, 198], shade: [65, 30, 32], hi: [202, 202, 202] },
  17: { rgb: [224, 197, 43], shade: [118, 65, 16], hi: [238, 238, 238] },
  18: { rgb: [53, 52, 49], shade: [48, 28, 24], hi: [255, 255, 255] },
  19: { rgb: [183, 89, 0], shade: [118, 66, 55], hi: [255, 255, 255] },
  20: { rgb: [238, 143, 199], shade: [65, 30, 32], hi: [192, 192, 192] },
  21: { rgb: [154, 14, 53], shade: [65, 30, 32], hi: [192, 192, 192] },
  22: { rgb: [236, 99, 136], shade: [65, 25, 28], hi: [200, 146, 146] },
  23: { rgb: [168, 127, 87], shade: [48, 28, 24], hi: [255, 255, 255] },
  24: { rgb: [221, 155, 80], shade: [118, 66, 55], hi: [255, 255, 255] },
  25: { rgb: [209, 204, 104], shade: [79, 54, 25], hi: [190, 190, 190] },
};

export const VOXEL_RGB: Record<number, readonly [number, number, number]> = Object.fromEntries(
  Object.entries(LOOK).map(([id, look]) => [Number(id), look.rgb]),
);

const TOKENS: ColorToken[] = ['o', 'y', 'c', 'g', 'p', 'v', 'r', 's', 'k', 'm', 'a', 'd'];

export function lookOfVoxel(colorId: number): VoxelLook {
  return LOOK[colorId] ?? LOOK[0];
}

export function rgbOfVoxel(colorId: number): readonly [number, number, number] {
  return lookOfVoxel(colorId).rgb;
}

export function lookOfRgb(rgb: readonly [number, number, number]): VoxelLook {
  let best = LOOK[0];
  let bestD = Infinity;
  for (const look of Object.values(LOOK)) {
    const d = dist2(rgb, look.rgb);
    if (d < bestD) {
      bestD = d;
      best = look;
    }
  }
  return bestD < 48 * 48 ? best : { rgb, shade: shadeOf(rgb), hi: [192, 192, 192] };
}

function shadeOf(rgb: readonly [number, number, number]): readonly [number, number, number] {
  return [
    Math.max(8, Math.round(rgb[0] * 0.28 + 12)),
    Math.max(8, Math.round(rgb[1] * 0.18 + 10)),
    Math.max(8, Math.round(rgb[2] * 0.20 + 10)),
  ];
}

function dist2(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

export function assignVoxelTokens(counts: Record<number, number>): {
  map: Record<number, ColorToken>;
  tints: Partial<Record<ColorToken, readonly [number, number, number]>>;
} {
  const ids = Object.keys(counts).map(Number).sort((a, b) => counts[b] - counts[a]);
  const used = new Set<ColorToken>();
  const map: Record<number, ColorToken> = {};
  const tints: Partial<Record<ColorToken, readonly [number, number, number]>> = {};
  for (const id of ids) {
    const rgb = rgbOfVoxel(id);
    let best: ColorToken = 'o';
    let bestD = Infinity;
    for (const t of TOKENS) {
      if (used.has(t)) continue;
      const d = dist2(rgb, TOKEN_RGB[t]);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    map[id] = best;
    used.add(best);
    tints[best] = rgb;
  }
  return { map, tints };
}
