import { assetManager, instantiate, Layers, Node, Prefab, Sprite, SpriteFrame, UITransform, Vec3, resources } from 'cc';
import {
  BENCH,
  ColorToken,
  GAME,
  PLAY,
  benchSeatX,
  benchSeatY,
  benchSeatZ,
  slotLocked,
  slotTotal,
  slotX,
  slotY,
  slotZ,
  coveredBySpecial,
  specialCenterX,
  specialCenterY,
  wallColAtX,
  wallStartX,
  parseColorToken,
  isColorToken,
  TOKEN_VOXEL_ID,
} from '../game/GameConfig';
import { applyLevel, ensureLevels, getLevel, LevelDef } from '../game/LevelCatalog';
import { BattleDirector } from './BattleDirector';
import { BlockCell } from './BlockCell';
import { DebrisBit } from './DebrisBit';
import { BLOCK_PREFAB, PREFAB_UUID, UNIT_PREFAB } from './PrefabCatalog';
import { IronPlate } from './IronPlate';
import { SlotPad } from './SlotPad';
import { applyToyGround } from './ToyBackdrop';
import { preloadToySlots } from './ToySlotMesh';
import { applyBombs, preloadBombs } from './Bombs';
import { applyMagnetLook, applyPaintLook, applySandLook, paintUnitColor, paintVoxelId, preloadVoxelLook } from './BrickSpecials';
import { ChestActor } from './ChestActor';
import { applyLockNails, preloadLockNails } from './LockNails';
import { preloadPaintCan } from './PaintCan';
import { applyRaftBoard, preloadRaftBoard } from './RaftBoard';
import { preloadInkShot } from './InkShot';
import { preloadPowerDigits } from './PowerMark';
import { preloadTurretLooks } from './TurretLook';
import { UnitActor } from './UnitActor';

const prefabJobs = new Map<string, Promise<Prefab | null>>();
const DEBRIS_SEED = 8;

function loadPrefabMaybe(uuid: string): Promise<Prefab | null> {
  let job = prefabJobs.get(uuid);
  if (job) return job;
  job = new Promise((resolve) => {
    assetManager.loadAny({ uuid }, (err, asset) => {
      resolve(!err && asset ? (asset as Prefab) : null);
    });
  });
  prefabJobs.set(uuid, job);
  return job;
}

function loadPrefab(uuid: string): Promise<Prefab> {
  return loadPrefabMaybe(uuid).then((asset) => {
    if (!asset) throw new Error(`prefab missing ${uuid}`);
    return asset;
  });
}

function tokensNeeded(level: LevelDef): ColorToken[] {
  const set = new Set<ColorToken>(['o']);
  for (const t of level.palette) if (isColorToken(t)) set.add(t);
  for (const u of level.units) if (isColorToken(u[0])) set.add(u[0]);
  for (const v of level.voxels) if (isColorToken(v.token)) set.add(v.token);
  for (const cell of level.cells) {
    if (!cell) continue;
    for (const t of cell.tokens) if (isColorToken(t)) set.add(t);
    if (cell.rescue && isColorToken(cell.rescue)) set.add(cell.rescue);
  }
  return [...set];
}

function levelNeeds(level: LevelDef): {
  nails: boolean;
  bombs: boolean;
  paint: boolean;
  raft: boolean;
  iron: boolean;
  chest: boolean;
} {
  let nails = false;
  let bombs = false;
  let paint = false;
  let chest = false;
  if (!level.voxels.length) {
    for (const cell of level.cells) {
      if (!cell) continue;
      if (cell.chest) chest = true;
      if (cell.locked?.some(Boolean)) nails = true;
      if (cell.bomb?.some(Boolean)) bombs = true;
      if (cell.paint?.some(Boolean)) paint = true;
    }
  }
  return {
    nails,
    bombs,
    paint,
    raft: (level.raftW ?? 0) > 0,
    iron: (level.ironRows?.length ?? 0) > 0 || level.ironRow >= 0,
    chest,
  };
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

function loadChestPrefab(): Promise<Prefab | null> {
  return loadPrefabMaybe(PREFAB_UUID.Chest);
}

function spawnChestFallback(parent: Node, name: string, pos: Vec3): Node {
  const n = new Node(name);
  parent.addChild(n);
  n.setPosition(pos);
  n.layer = Layers.Enum.UI_3D;
  const art = new Node('Art');
  n.addChild(art);
  art.layer = Layers.Enum.UI_3D;
  art.addComponent(UITransform).setContentSize(256, 256);
  const sp = art.addComponent(Sprite);
  sp.sizeMode = Sprite.SizeMode.CUSTOM;
  resources.load('ui/chest/spriteFrame', SpriteFrame, (err, sf) => {
    if (!err && sf && art.isValid) sp.spriteFrame = sf;
  });
  art.setScale(0.0034, 0.0034, 0.0034);
  return n;
}

function spawnChest(
  prefab: Prefab | null,
  parent: Node,
  x: number,
  y: number,
  startX: number,
  step: number,
  baseY: number,
  frontZ: number,
): Node {
  const pos = new Vec3(specialCenterX(x, startX, step), specialCenterY(y, baseY, step), frontZ);
  const n = prefab
    ? spawn(prefab, parent, `Chest_${x}_${y}`, pos)
    : spawnChestFallback(parent, `Chest_${x}_${y}`, pos);
  const s = PLAY.blockStep * 3.64;
  n.setScale(s, s, s);
  const chest = n.getComponent(ChestActor) ?? n.addComponent(ChestActor);
  chest.trapped = true;
  chest.trapCol = x;
  chest.trapRow = y;
  chest.idleBob();
  return n;
}

export async function buildPlayWorld(
  scene: Node,
  level?: LevelDef,
  opts?: { name?: string; active?: boolean },
): Promise<{ root: Node; battle: BattleDirector }> {
  await ensureLevels();
  level = level ?? getLevel(1);
  applyLevel(level);
  const tokens = tokensNeeded(level);
  const needs = levelNeeds(level);
  const [groundPf, slotPf, debrisPf, ironPf, chestPf, ...colorPfs] = await Promise.all([
    loadPrefab(PREFAB_UUID.Ground),
    loadPrefab(PREFAB_UUID.Slot),
    loadPrefab(PREFAB_UUID.Debris),
    needs.iron ? loadPrefab(PREFAB_UUID.IronPlate) : Promise.resolve(null),
    needs.chest ? loadChestPrefab() : Promise.resolve(null),
    ...tokens.map((t) => loadPrefab(BLOCK_PREFAB[t])),
    ...tokens.map((t) => loadPrefab(UNIT_PREFAB[t])),
    needs.nails ? preloadLockNails() : Promise.resolve(),
    needs.bombs ? preloadBombs() : Promise.resolve(),
    needs.paint ? preloadPaintCan() : Promise.resolve(),
    needs.raft ? preloadRaftBoard() : Promise.resolve(),
    preloadPowerDigits().then(() => null),
    preloadInkShot(),
    preloadTurretLooks(),
    preloadToySlots(),
    preloadVoxelLook(),
  ]);
  const blockPfs = new Map<ColorToken, Prefab>();
  const unitPfs = new Map<ColorToken, Prefab>();
  tokens.forEach((token, i) => {
    blockPfs.set(token, colorPfs[i] as Prefab);
    unitPfs.set(token, colorPfs[tokens.length + i] as Prefab);
  });

  const root = new Node(opts?.name ?? 'PlayWorld');
  scene.addChild(root);

  applyToyGround(spawn(groundPf, root, 'Ground', new Vec3(0, -0.12, 0)));

  const wall = new Node('Wall');
  root.addChild(wall);
  const cols = level.cols;
  const rows = level.rows;
  const step = PLAY.blockStep;
  const startX = wallStartX(cols);
  const frontZ = GAME.wallFrontZ;
  const baseY = PLAY.wallBaseY;
  if (level.voxels.length) {
    const depth = PLAY.wallDepth;
    const originX = -((cols - 1) * step) / 2;
    const originZ = GAME.worldCamLookAtZ + ((depth - 1) * step) / 2;
    for (const v of level.voxels) {
      const token = v.token;
      const n = spawn(
        blockPfs.get(isColorToken(token) ? token : 'r') ?? blockPfs.get('o')!,
        wall,
        `Blk_${token}_${v.x}_${v.y}_${v.z}`,
        new Vec3(originX + v.x * step, baseY + v.y * step, originZ - v.z * step),
      );
      const cell = n.getComponent(BlockCell) ?? n.addComponent(BlockCell);
      cell.syncFromName();
      if (isColorToken(token)) cell.colorId = parseColorToken(token);
      cell.voxelId = v.colorId;
      paintVoxelId(n, v.colorId);
    }
  } else
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (coveredBySpecial(level.cells, cols, x, y)) continue;
      const cell = level.cells[y * cols + x];
      if (!cell) continue;
      if (cell.chest) {
        const n = spawnChest(chestPf, wall, x, y, startX, step, baseY, frontZ);
        applyLockNails(n, 'chest');
        continue;
      }
      if (cell.rescue) continue;
      for (let z = 0; z < cell.tokens.length; z++) {
        const token = cell.tokens[z];
        const locked = !!cell.locked?.[z];
        const bombed = !!cell.bomb?.[z];
        const paint = !!cell.paint?.[z];
        const magnet = !!cell.magnet?.[z];
        const raft = onRaft(level, x, y);
        const tag = locked ? '_L' : bombed ? '_B' : paint ? '_P' : magnet ? '_M' : raft ? '_F' : '';
        const big = z === 0 && (bombed || paint);
        const n = spawn(
          blockPfs.get(token) ?? blockPfs.get('o')!,
          wall,
          `Blk_${token}_${x}_${y}_${z}${tag}`,
          new Vec3(
            big ? specialCenterX(x, startX, step) : startX + x * step,
            (big ? specialCenterY(y, baseY, step) : baseY + y * step) + (raft ? step * 0.05 : 0),
            frontZ - z * step + (big ? 0.06 : 0),
          ),
        );
        const brick = n.getComponent(BlockCell) ?? n.addComponent(BlockCell);
        brick.syncFromName();
        if (isColorToken(token)) brick.voxelId = TOKEN_VOXEL_ID[token];
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
  if (ironRows.length && ironPf) {
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
      new Vec3(x, benchSeatY(), z),
    );
    const unit = n.getComponent(UnitActor) ?? n.addComponent(UnitActor);
    unit.syncFromName();
    if (isColorToken(token)) {
      unit.colorId = parseColorToken(token);
      paintUnitColor(n, token);
      unit.syncVoxelId();
    }
  });

  const slots = new Node('Slots');
  root.addChild(slots);
  const total = slotTotal();
  for (let i = 0; i < total; i++) {
    const x = slotX(i);
    const n = spawn(slotPf, slots, `Slot_${i}`, new Vec3(x, slotY(i), slotZ(i)));
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
  for (let i = 0; i < DEBRIS_SEED; i++) {
    const n = spawn(debrisPf, pool, `Debris_${i}`, new Vec3(0, -2, 0));
    n.getComponent(DebrisBit) ?? n.addComponent(DebrisBit);
    n.active = false;
  }

  const battle = root.addComponent(BattleDirector);
  battle.armSpawn(unitPfs, reserve, debrisPf);
  // Build while active so Cocos schedules update; hide only after onLoad/onEnable.
  if (opts?.active === false) root.active = false;
  return { root, battle };
}
