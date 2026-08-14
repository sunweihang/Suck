'use strict';

const fs = require('fs');
const path = require('path');

const FX = 'c8f66d17-351a-48da-a12c-0212d28575c4';
const DIR = path.join(__dirname, '..', 'assets', 'materials');

const COLORS = {
  MatOrange: { r: 232, g: 168, b: 42 },
  MatCyan: { r: 56, g: 196, b: 194 },
  MatBlack: { r: 38, g: 38, b: 42 },
  MatGround: { r: 128, g: 208, b: 230 },
  MatSlot: { r: 110, g: 178, b: 198 },
  MatEye: { r: 252, g: 252, b: 255 },
  MatPupil: { r: 24, g: 26, b: 32 },
  MatSkin: { r: 255, g: 196, b: 148 },
  MatPad: { r: 104, g: 192, b: 216 },
};

function mtl(name, c) {
  const clay = name === 'MatOrange' || name === 'MatCyan' || name === 'MatBlack';
  const glossy = !clay && name !== 'MatGround' && name !== 'MatSlot' && name !== 'MatPad';
  return {
    __type__: 'cc.Material',
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _native: '',
    _effectAsset: { __uuid__: FX, __expectedType__: 'cc.EffectAsset' },
    _techIdx: 0,
    _defines: [{}, {}, {}],
    _states: [
      { rasterizerState: {}, depthStencilState: {}, blendState: { targets: [{}] } },
      {},
      {},
    ],
    _props: [
      {
        mainColor: { __type__: 'cc.Color', r: c.r, g: c.g, b: c.b, a: 255 },
        roughness: clay ? 0.86 : glossy ? 0.16 : 0.42,
        metallic: clay || !glossy ? 0.0 : 0.04,
      },
      {},
      {},
    ],
  };
}

for (const [name, col] of Object.entries(COLORS)) {
  fs.writeFileSync(path.join(DIR, `${name}.mtl`), `${JSON.stringify(mtl(name, col), null, 2)}\n`);
}
console.log('glossy standard materials written');
