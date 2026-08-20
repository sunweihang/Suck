'use strict';

/** Scan catalog: every brick color must have enough unit power after decode. */
const fs = require('fs');
const path = require('path');
const { decodeCatalogLevel, powerGaps } = require('./voxel-colors');

const CATALOG = require('./level-io').CATALOG;

function main() {
  const pack = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const levels = pack.levels || [];
  const bad = [];
  const empty = [];
  let checked = 0;
  for (const raw of levels) {
    const voxels = raw.voxels || [];
    if (!voxels.length) {
      empty.push(raw.id);
      continue;
    }
    checked += 1;
    const level = decodeCatalogLevel(raw);
    const gaps = powerGaps(level);
    if (gaps.short.length) {
      bad.push({
        id: level.id,
        voxels: level.voxels.length,
        colors: gaps.colors,
        short: gaps.short,
        map: level.map,
      });
    }
  }
  console.log(`checked ${checked}/${levels.length} voxel levels, empty ${empty.length}`);
  if (!bad.length) {
    console.log('OK all brick colors have matching unit power');
    return;
  }
  console.log(`FAIL ${bad.length} levels`);
  for (const b of bad.slice(0, 20)) {
    const short = b.short.map((s) => `${s.token} ${s.have}/${s.need}`).join(', ');
    console.log(`  L${String(b.id).padStart(3, '0')} colors=${b.colors} short=[${short}]`);
  }
  process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { main };
