'use strict';

const fs = require('fs');
const path = require('path');

/** Official M_Pixel _BaseColor. Tiny emit matches ColorLibrary 0.078 gray. */
const FX_STD = 'c8f66d17-351a-48da-a12c-0212d28575c4';
const ROUGHNESS = 0.34;
const EMIT = 0.04;

const COLORS = {
  Orange: [214, 123, 19],
  Yellow: [224, 197, 43],
  Cyan: [17, 183, 214],
  Lime: [61, 149, 30],
  Pink: [231, 58, 148],
  Violet: [113, 52, 226],
  Red: [207, 36, 48],
  Sky: [33, 95, 200],
  Coral: [236, 99, 136],
  Mint: [2, 161, 144],
  Magenta: [238, 143, 199],
  Gold: [195, 175, 113],
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
        emissive: { __type__: 'cc.Color', r, g, b, a: 255 },
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
