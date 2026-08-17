'use strict';

const { occupyShape, shapeForLevel } = require('./level-shapes');

function dump(id, cols = 26, rows = 20) {
  const { regions, shape } = occupyShape(id, cols, rows);
  const counts = {};
  const lines = [];
  for (let y = rows - 1; y >= 0; y--) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const ch = regions[y * cols + x];
      line += ch === '.' ? ' ' : ch;
      counts[ch] = (counts[ch] || 0) + 1;
    }
    lines.push(line);
  }
  const filled = Object.entries(counts)
    .filter(([ch]) => ch !== '.')
    .map(([ch, n]) => `${ch}:${n}`)
    .join(' ');
  console.log(`\nL${id} ${shape.name} ${cols}x${rows} ${filled}`);
  console.log(lines.join('\n'));
}

const ids = process.argv.slice(2).map(Number);
if (ids.length) ids.forEach((id) => dump(id));
else for (let id = 1; id <= 20; id++) dump(id);
