import { assetManager, instantiate, Node, Prefab, Vec3 } from 'cc';
import {
  ALL_COLOR_TOKENS,
  BENCH,
  ColorToken,
  GAME,
  PLAY,
  benchSeatX,
  benchSeatZ,
  slotLocked,
  slotTotal,
  slotX,
  slotZ,
  wallColAtX,
  wallStartX,
} from '../game/GameConfig';
import { applyLevel, ensureLevels, getLevel, LevelDef } from '../game/LevelCatalog';
import { BattleDirector } from './BattleDirector';
import { BlockCell } from './BlockCell';
import { DebrisBit } from './DebrisBit';
import { BLOCK_PREFAB, PREFAB_UUID, UNIT_PREFAB } from './PrefabCatalog';
import { IronPlate } from './IronPlate';
import { SlotPad } from './SlotPad';
import { applyToyGround } from './ToyBackdrop';
import { applyBombs, preloadBombs } from './Bombs';
import { applyLockNails, preloadLockNails } from './LockNails';
import { applyShadowReceiver } from './ToyBlockMesh';
import { preloadPowerDigits } from './PowerMark';
import { OCTOPUS_STAND_Y } from './ToyLook';
import { UnitActor } from './UnitActor';

function loadPrefab(uuid: string): Promise<Prefab> {
  return new Promise((resolve, reject) => {
    assetManager.loadAny({ uuid }, (err, asset) => {
      if (err || !asset) {
        reject(err ?? new Error(`prefab missing ${uuid}`));
        return;
      }
      resolve(asset as Prefab);
    });
  });
}

function spawn(prefab: Prefab, parent: Node, name: string, pos: Vec3): Node {
  const n = instantiate(prefab);
  n.name = name;
  parent.addChild(n);
  n.setPosition(pos);
  return n;
}

export async function buildPlayWorld(
  scene: Node,
  level?: LevelDef,
): Promise<{ root: Node; battle: BattleDirector }> {
  await ensureLevels();
  level = level ?? getLevel(1);
  applyLevel(level);
  const blockUuids = ALL_COLOR_TOKENS.map((t) => BLOCK_PREFAB[t]);
  const unitUuids = ALL_COLOR_TOKENS.map((t) => UNIT_PREFAB[t]);
  const [groundPf, slotPf, debrisPf, ironPf, ...colorPfs] = await Promise.all([
    loadPrefab(PREFAB_UUID.Ground),
    loadPrefab(PREFAB_UUID.Slot),
    loadPrefab(PREFAB_UUID.Debris),
    loadPrefab(PREFAB_UUID.IronPlate),
    ...blockUuids.map(loadPrefab),
    ...unitUuids.map(loadPrefab),
    preloadLockNails(),
    preloadBombs(),
    preloadPowerDigits().then(() => null),
  ]);
  const blockPfs = new Map<ColorToken, Prefab>();
  const unitPfs = new Map<ColorToken, Prefab>();
  ALL_COLOR_TOKENS.forEach((token, i) => {
    blockPfs.set(token, colorPfs[i]);
    unitPfs.set(token, colorPfs[ALL_COLOR_TOKENS.length + i]);
  });

  const root = new Node('PlayWorld');
  scene.addChild(root);

  applyToyGround(spawn(groundPf, root, 'Ground', new Vec3(0, -0.12, 0)));
  applyShadowReceiver(root.getChildByName('Ground')!);

  const wall = new Node('Wall');
  root.addChild(wall);
  const cols = level.cols;
  const rows = level.rows;
  const step = PLAY.blockStep;
  const startX = wallStartX(cols);
  const frontZ = GAME.wallFrontZ;
  const baseY = PLAY.wallBaseY;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = level.cells[y * cols + x];
      if (!cell) continue;
      for (let z = 0; z < cell.tokens.length; z++) {
        const token = cell.tokens[z];
        const locked = !!cell.locked?.[z];
        const bombed = !!cell.bomb?.[z];
        const tag = locked ? '_L' : bombed ? '_B' : '';
        const n = spawn(
          blockPfs.get(token) ?? blockPfs.get('o')!,
          wall,
          `Blk_${token}_${x}_${y}_${z}${tag}`,
          new Vec3(startX + x * step, baseY + y * step, frontZ - z * step),
        );
        (n.getComponent(BlockCell) ?? n.addComponent(BlockCell)).syncFromName();
        if (locked && z === 0) applyLockNails(n);
        if (bombed) applyBombs(n, token);
      }
    }
  }

  const ironRows = level.ironRows?.length
    ? level.ironRows
    : level.ironRow >= 0
      ? [level.ironRow]
      : [];
  if (ironRows.length) {
    const plates = new Node('Plates');
    root.addChild(plates);
    const ironZ = frontZ - Math.max(0, PLAY.wallDepth - 1) * step * 0.5;
    const sx = PLAY.blockSize;
    const sy = PLAY.blockSize;
    const sz = Math.max(PLAY.blockSize, PLAY.wallDepth * step * 0.96);
    const gaps = new Set(level.ironGaps ?? PLAY.ironGaps ?? []);
    for (let i = 0; i < ironRows.length; i++) {
      const ironRow = ironRows[i];
      const ironY = baseY + ironRow * step - step * 0.5;
      for (let x = 0; x < cols; x++) {
        if (gaps.has(x)) continue;
        const below = ironRow > 0 ? level.cells[(ironRow - 1) * cols + x] : null;
        const above = ironRow < rows ? level.cells[ironRow * cols + x] : null;
        if (!below && !above) continue;
        const n = spawn(ironPf, plates, `Iron_${x}_${ironRow}`, new Vec3(startX + x * step, ironY, ironZ));
        n.setScale(sx, sy, sz);
        (n.getComponent(IronPlate) ?? n.addComponent(IronPlate)).syncFromName();
      }
    }
  }

  const bench = new Node('Bench');
  root.addChild(bench);
  const seats = BENCH.cols * BENCH.rows;
  const shown = level.units.slice(0, seats);
  const reserve = level.units.slice(seats);
  shown.forEach((pair, i) => {
    const [token, power] = pair;
    const cx = i % BENCH.cols;
    const cz = Math.floor(i / BENCH.cols);
    const x = benchSeatX(cx);
    const z = benchSeatZ(cz);
    const n = spawn(
      unitPfs.get(token) ?? unitPfs.get('o')!,
      bench,
      `Unit_${String(i).padStart(2, '0')}_${token}_${power}`,
      new Vec3(x, OCTOPUS_STAND_Y, z),
    );
    (n.getComponent(UnitActor) ?? n.addComponent(UnitActor)).syncFromName();
  });

  const slots = new Node('Slots');
  root.addChild(slots);
  const total = slotTotal();
  for (let i = 0; i < total; i++) {
    const x = slotX(i);
    const n = spawn(slotPf, slots, `Slot_${i}`, new Vec3(x, 0, slotZ(i)));
    const pad = n.getComponent(SlotPad) ?? n.addComponent(SlotPad);
    pad.locked = slotLocked(i);
    pad.homeCol = wallColAtX(x);
    pad.refreshLook();
    n.active = true;
  }

  const fly = new Node('FlyRoot');
  root.addChild(fly);

  const pool = new Node('DebrisPool');
  root.addChild(pool);
  for (let i = 0; i < 12; i++) {
    const n = spawn(debrisPf, pool, `Debris_${i}`, new Vec3(0, -2, 0));
    n.getComponent(DebrisBit) ?? n.addComponent(DebrisBit);
    n.active = false;
  }

  const battle = root.addComponent(BattleDirector);
  battle.armSpawn(unitPfs, reserve);
  return { root, battle };
}
