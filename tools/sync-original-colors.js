'use strict';

const fs = require('fs');
const path = require('path');

/** Matte toy plastic — no self-glow, softer specular (avoids washed-out tops). */
const FX_STD = 'c8f66d17-351a-48da-a12c-0212d28575c4';
const ROUGHNESS = 0.62;
const EMIT = 0;

const COLORS = {
  Orange: [255, 132, 28],
  Yellow: [255, 158, 72],
  Cyan: [24, 228, 236],
  Lime: [96, 224, 48],
  Pink: [255, 84, 164],
  Violet: [164, 92, 255],
  Red: [255, 60, 76],
  Sky: [72, 176, 255],
  Coral: [255, 124, 100],
  Mint: [0, 212, 128],
  Magenta: [240, 56, 216],
  Gold: [255, 196, 44],
};

const ROOT = path.join(__dirname, '..');

function stdMat(name, rgb) {
  const [r, g, b] = rgb;
  return `${JSON.stringify({
    __type__: 'cc.Material',
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _native: '',
    _effectAsset: { __uuid__: FX_STD, __expectedType__: 'cc.EffectAsset' },
    _techIdx: 0,
    _defines: [{}, {}, {}],
    _states: [
      { rasterizerState: {}, depthStencilState: {}, blendState: { targets: [{}] } },
      {},
      {},
    ],
    _props: [
      {
        mainColor: { __type__: 'cc.Color', r, g, b, a: 255 },
        roughness: ROUGHNESS,
        metallic: 0.04,
        emissive: { __type__: 'cc.Color', r: 0, g: 0, b: 0, a: 255 },
        emissiveScale: { __type__: 'cc.Vec3', x: EMIT, y: EMIT, z: EMIT },
      },
      {},
      {},
    ],
  }, null, 2)}\n`;
}

for (const [name, rgb] of Object.entries(COLORS)) {
  fs.writeFileSync(path.join(ROOT, 'assets/materials', `Mat${name}.mtl`), stdMat(`Mat${name}`, rgb));
}

console.log('standard toy materials', Object.keys(COLORS).length);
