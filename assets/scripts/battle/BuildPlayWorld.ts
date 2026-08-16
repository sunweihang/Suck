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
  parseColorToken,
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
import { applyMagnetLook, applyPaintLook, applySandLook } from './BrickSpecials';
import { applyLockNails, preloadLockNails } from './LockNails';
import { preloadPaintCan } from './PaintCan';
import { applyRaftBoard, preloadRaftBoard } from './RaftBoard';
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

function onRaft(level: LevelDef, x: number, y: number): boolean {
  const w = level.raftW | 0;
  const h = level.raftH | 0;
  if (w <= 0 || h <= 0) return false;
  return x >= level.raftX && x < level.raftX + w && y >= level.raftY && y < level.raftY + h;
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
    preloadPaintCan(),
    preloadRaftBoard(),
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
      if (cell.rescue) {
        const token = cell.rescue;
        const power = level.rescuePower || 5;
        const n = spawn(
          unitPfs.get(token) ?? unitPfs.get('o')!,
          wall,
          `Rescue_${token}_${x}_${y}_${power}`,
          new Vec3(startX + x * step, baseY + y * step - PLAY.blockSize * 0.5, frontZ),
        );
        const unit = n.getComponent(UnitActor) ?? n.addComponent(UnitActor);
        unit.syncFromName();
        const s = PLAY.blockSize * 2.1;
        n.setScale(s, s, s);
        unit.colorId = parseColorToken(token);
        unit.power = power;
        unit.maxPower = power;
        unit.trapped = true;
        unit.trapCol = x;
        unit.trapRow = y;
        unit.syncPowerLabel();
        continue;
      }
      for (let z = 0; z < cell.tokens.length; z++) {
        const token = cell.tokens[z];
        const locked = !!cell.locked?.[z];
        const bombed = !!cell.bomb?.[z];
        const paint = !!cell.paint?.[z];
        const magnet = !!cell.magnet?.[z];
        const raft = onRaft(level, x, y);
        const tag = locked ? '_L' : bombed ? '_B' : paint ? '_P' : magnet ? '_M' : raft ? '_F' : '';
        const n = spawn(
          blockPfs.get(token) ?? blockPfs.get('o')!,
          wall,
          `Blk_${token}_${x}_${y}_${z}${tag}`,
          new Vec3(startX + x * step, baseY + y * step + (raft ? step * 0.05 : 0), frontZ - z * step),
        );
        (n.getComponent(BlockCell) ?? n.addComponent(BlockCell)).syncFromName();
        if (locked && z === 0) applyLockNails(n);
        if (bombed) applyBombs(n, token);
        if (paint) applyPaintLook(n, token);
        if (magnet) applyMagnetLook(n);
        if (level.sandCols?.includes(x)) applySandLook(n);
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

  if ((level.raftW ?? 0) > 0) {
    const holder = new Node('Raft');
    root.addChild(holder);
    applyRaftBoard(holder, level.raftW);
  }

  const bench = new Node('Bench');
  root.addChild(bench);
  const seats = BENCH.cols * BENCH.rows;
  const shown = level.units.slice(0, seats);
  const reserve = level.units.slice(seats);
  shown.forEach((pair, i) => {
    const [token, power, extra] = pair;
    const cx = i % BENCH.cols;
    const cz = Math.floor(i / BENCH.cols);
    const x = benchSeatX(cx);
    const z = benchSeatZ(cz);
    const tag = extra ? `_${extra}` : '';
    const n = spawn(
      unitPfs.get(token) ?? unitPfs.get('o')!,
      bench,
      `Unit_${String(i).padStart(2, '0')}_${token}_${power}${tag}`,
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
