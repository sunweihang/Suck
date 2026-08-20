import { assetManager, instantiate, Layers, Mesh, MeshRenderer, Node, Prefab, Sprite, SpriteFrame, UITransform, Vec3, resources } from 'cc';
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
import { applyLevel, ensureLevel, getLevel, LevelDef } from '../game/LevelCatalog';
import { BattleDirector } from './BattleDirector';
import { BlockCell } from './BlockCell';
import {
  allPrefabTokens,
  blockPrefabPath,
  blockPrefabUuid,
  prefabPath,
  prefabUuid,
  unitPrefabPath,
  unitPrefabUuid,
} from './PrefabCatalog';
import { IronPlate } from './IronPlate';
import { SlotPad } from './SlotPad';
import { applyToyGround } from './ToyBackdrop';
import { preloadToySlots } from './ToySlotMesh';
import { applySandLook, paintVoxelId, preloadVoxelLook, rememberBrickMesh, rollHiddenQueue } from './BrickSpecials';
import { ChestActor } from './ChestActor';
import { applyLockNails, preloadLockNails } from './LockNails';
import { applyRaftBoard, preloadRaftBoard } from './RaftBoard';
import { preloadInkShot } from './InkShot';
import { preloadPowerDigits } from './PowerMark';
import { preloadTurretLooks } from './TurretLook';
import { loadPrefabFromPack } from '../boot/LoadBundles';
import { UnitActor } from './UnitActor';

const prefabJobs = new Map<string, Promise<Prefab | null>>();
const PLAY_MESH_UUIDS = [
  '7e22bb20-0311-4b02-8002-000000000001@e1d15',
  '7e22bb20-0319-4b02-8002-000000000009@0d4df',
  '1263d74c-8167-4928-91a6-4e2672411f47@a804a',
];

function preloadPlayMeshes(): Promise<void> {
  return Promise.all(
    PLAY_MESH_UUIDS.map(
      (uuid) =>
        new Promise<void>((resolve) => {
          assetManager.loadAny({ uuid }, () => resolve());
        }),
    ),
  ).then(() => undefined);
}

function asPrefab(asset: unknown): Prefab | null {
  if (!asset || typeof asset !== 'object') return null;
  return asset as Prefab;
}

function loadPrefabMaybe(path: string, uuid: string): Promise<Prefab | null> {
  const key = path || uuid;
  if (!key) return Promise.resolve(null);
  let job = prefabJobs.get(key);
  if (job) return job;
  job = (async () => {
    if (path) {
      const fromPack = await loadPrefabFromPack(path);
      if (fromPack) return fromPack;
    }
    if (!uuid) return null;
    return new Promise<Prefab | null>((resolve) => {
      assetManager.loadAny({ uuid, type: Prefab }, (err, asset) => {
        resolve(!err ? asPrefab(asset) : null);
      });
    });
  })();
  prefabJobs.set(key, job);
  return job;
}

function loadPrefab(path: string, uuid: string, label = ''): Promise<Prefab> {
  return loadPrefabMaybe(path, uuid).then((asset) => {
    if (!asset) throw new Error(`prefab missing ${label || path || uuid}`);
    return asset;
  });
}

function tokensNeeded(level: LevelDef): string[] {
  const seen: Record<string, number> = Object.create(null);
  const out: string[] = [];
  const add = (t: string) => {
    if (!t || seen[t]) return;
    seen[t] = 1;
    out.push(t);
  };
  add('o');
  const pal = level.palette;
  if (pal) for (let i = 0; i < pal.length; i++) add(pal[i]);
  const units = level.units;
  if (units) for (let i = 0; i < units.length; i++) add(units[i][0]);
  const voxels = level.voxels;
  if (voxels) for (let i = 0; i < voxels.length; i++) add(voxels[i].token);
  const cells = level.cells;
  if (cells) {
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (!cell) continue;
      const toks = cell.tokens;
      if (toks) for (let j = 0; j < toks.length; j++) add(toks[j]);
      if (cell.rescue) add(cell.rescue);
    }
  }
  return out;
}

function levelNeeds(level: LevelDef): {
  nails: boolean;
  raft: boolean;
  iron: boolean;
  chest: boolean;
} {
  let nails = false;
  let chest = false;
  if (!level.voxels.length) {
    for (const cell of level.cells) {
      if (!cell) continue;
      if (cell.chest) chest = true;
      if (cell.locked?.some(Boolean)) nails = true;
    }
  }
  return {
    nails,
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
  if (!prefab) throw new Error(`prefab missing ${name}`);
  let n: Node;
  try {
    n = instantiate(prefab);
  } catch (err) {
    throw new Error(`instantiate ${name}: ${String(err)}`);
  }
  n.name = name;
  parent.addChild(n);
  n.setPosition(pos);
  return n;
}

/** Bare brick: shared cube is hung later so we never instantiate a color prefab. */
function spawnBrick(parent: Node, name: string, pos: Vec3): Node {
  const n = new Node(name);
  n.layer = Layers.Enum.DEFAULT;
  parent.addChild(n);
  n.setPosition(pos);
  return n;
}

function placeBrick(
  parent: Node,
  name: string,
  pos: Vec3,
  token: string,
  voxelId: number,
  hidden: boolean,
  readyMesh: boolean,
  prefab: Prefab | null,
): BlockCell {
  const n = readyMesh || !prefab ? spawnBrick(parent, name, pos) : spawn(prefab, parent, name, pos);
  const cell = n.getComponent(BlockCell) ?? n.addComponent(BlockCell);
  cell.syncFromName();
  if (isColorToken(token)) cell.colorId = parseColorToken(token);
  cell.voxelId = voxelId;
  if (readyMesh) {
    cell.meshless = hidden;
  } else {
    cell.meshless = hidden;
    if (!hidden) paintVoxelId(n, voxelId);
  }
  return cell;
}

/** All block prefabs point at the same cube, so any loaded one hands over the shared mesh. */
function brickCubeMesh(pfs: Record<string, Prefab>): Mesh | null {
  for (const key in pfs) {
    const root = pfs[key]?.data;
    const mesh = root?.getComponent(MeshRenderer)?.mesh
      ?? root?.getComponentInChildren(MeshRenderer)?.mesh;
    if (mesh) return mesh;
  }
  return null;
}

function voxelKey(x: number, y: number, z: number): number {
  return ((x + 1) * 128 + (y + 1)) * 128 + (z + 1);
}

/**
 * Solid sculptures hide well over half their bricks inside. Those get an empty
 * renderer (mesh filled later). BattleDirector re-checks with `_isBuried` after
 * the build, so a wrong guess only assigns a mesh, never skips a visible brick.
 */
function boxedInVoxels(voxels: LevelDef['voxels']): Set<number> {
  const solid = new Set<number>();
  for (let i = 0; i < voxels.length; i++) {
    const v = voxels[i];
    solid.add(voxelKey(v.x, v.y, v.z));
  }
  const out = new Set<number>();
  for (let i = 0; i < voxels.length; i++) {
    const v = voxels[i];
    if (
      solid.has(voxelKey(v.x + 1, v.y, v.z))
      && solid.has(voxelKey(v.x - 1, v.y, v.z))
      && solid.has(voxelKey(v.x, v.y + 1, v.z))
      && solid.has(voxelKey(v.x, v.y - 1, v.z))
      && solid.has(voxelKey(v.x, v.y, v.z + 1))
      && solid.has(voxelKey(v.x, v.y, v.z - 1))
    ) {
      out.add(voxelKey(v.x, v.y, v.z));
    }
  }
  return out;
}

function loadChestPrefab(): Promise<Prefab | null> {
  return loadPrefabMaybe(prefabPath('Chest'), prefabUuid('Chest'));
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

function waitTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function buildPlayWorld(
  scene: Node,
  level?: LevelDef,
  opts?: { name?: string; active?: boolean; onProgress?: (p: number) => void },
): Promise<{ root: Node; battle: BattleDirector }> {
  const note = (p: number): void => {
    opts?.onProgress?.(Math.max(0, Math.min(1, p)));
  };
  note(0.08);
  if (!level) await ensureLevel(1);
  level = level ?? getLevel(1);
  applyLevel(level);
  const tokens = allPrefabTokens();
  const extra = tokensNeeded(level);
  for (let i = 0; i < extra.length; i++) {
    if (tokens.indexOf(extra[i]) < 0) tokens.push(extra[i]);
  }
  const needs = levelNeeds(level);
  note(0.18);
  await preloadPlayMeshes();
  note(0.32);
  const blockPfs: Record<string, Prefab> = Object.create(null);
  const unitPfs: Record<string, Prefab> = Object.create(null);
  const [groundPf, slotPf, ironPf, chestPf, blockO, unitLoaded] = await Promise.all([
    loadPrefab(prefabPath('Ground'), prefabUuid('Ground'), 'Ground'),
    loadPrefab(prefabPath('Slot'), prefabUuid('Slot'), 'Slot'),
    needs.iron ? loadPrefab(prefabPath('IronPlate'), prefabUuid('IronPlate'), 'IronPlate') : Promise.resolve(null),
    needs.chest ? loadChestPrefab() : Promise.resolve(null),
    loadPrefab(blockPrefabPath('o'), blockPrefabUuid('o'), 'block:o'),
    Promise.all(tokens.map((t) => loadPrefab(unitPrefabPath(t), unitPrefabUuid(t), 'unit:' + t))),
    needs.nails ? preloadLockNails() : Promise.resolve(),
    needs.raft ? preloadRaftBoard() : Promise.resolve(),
    preloadPowerDigits().then(() => null),
    preloadInkShot(),
    preloadTurretLooks(),
    preloadToySlots(),
    preloadVoxelLook(),
  ]);
  blockPfs.o = blockO;
  const readyMesh = rememberBrickMesh(brickCubeMesh(blockPfs));
  if (!readyMesh) {
    const rest = tokens.filter((t) => t !== 'o');
    const blockLoaded = await Promise.all(
      rest.map((t) => loadPrefab(blockPrefabPath(t), blockPrefabUuid(t), 'block:' + t)),
    );
    for (let i = 0; i < rest.length; i++) blockPfs[rest[i]] = blockLoaded[i];
  }
  for (let i = 0; i < tokens.length; i++) {
    unitPfs[tokens[i]] = unitLoaded[i];
  }
  note(0.48);
  await waitTick();

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
    const voxels = level.voxels;
    const boxedIn = readyMesh ? boxedInVoxels(voxels) : null;
    for (let i = 0; i < voxels.length; i++) {
      const v = voxels[i];
      const token = v.token;
      const hidden = !!boxedIn?.has(voxelKey(v.x, v.y, v.z));
      const blockPf = readyMesh ? null : (blockPfs[isColorToken(token) ? token : 'o'] || blockPfs['o']);
      if (!readyMesh && !blockPf) throw new Error('no block prefab ' + token);
      placeBrick(
        wall,
        `Blk_${token}_${v.x}_${v.y}_${v.z}`,
        new Vec3(originX + v.x * step, baseY + v.y * step, originZ - v.z * step),
        token,
        v.colorId,
        hidden,
        readyMesh,
        blockPf,
      );
      if ((i & 63) === 63) {
        note(0.48 + 0.4 * ((i + 1) / voxels.length));
        await waitTick();
      }
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
        const raft = onRaft(level, x, y);
        const tag = locked ? '_L' : raft ? '_F' : '';
        const blockPf = readyMesh ? null : (blockPfs[token] || blockPfs['o']);
        if (!readyMesh && !blockPf) throw new Error('no block prefab ' + token);
        const brick = placeBrick(
          wall,
          `Blk_${token}_${x}_${y}_${z}${tag}`,
          new Vec3(
            startX + x * step,
            baseY + y * step + (raft ? step * 0.05 : 0),
            frontZ - z * step,
          ),
          token,
          isColorToken(token) ? TOKEN_VOXEL_ID[token] : TOKEN_VOXEL_ID.o,
          false,
          readyMesh,
          blockPf,
        );
        if (locked && z === 0) applyLockNails(brick.node);
        if (level.sandCols?.includes(x)) {
          brick.sand = true;
          applySandLook(brick.node);
        }
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
  const benchUnits: UnitActor[] = [];
  shown.forEach((pair, i) => {
    const [token, power, extra] = pair;
    const cx = i % BENCH.cols;
    const cz = Math.floor(i / BENCH.cols);
    const x = benchSeatX(cx);
    const z = benchSeatZ(cz);
    const tag = extra ? `_${extra}` : '';
    const unitPf = unitPfs[token] || unitPfs['o'];
    if (!unitPf) throw new Error('no unit prefab ' + token);
    const n = spawn(
      unitPf,
      bench,
      `Unit_${String(i).padStart(2, '0')}_${token}_${power}${tag}`,
      new Vec3(x, benchSeatY(), z),
    );
    const unit = n.getComponent(UnitActor) ?? n.addComponent(UnitActor);
    unit.syncFromName();
    if (isColorToken(token)) {
      unit.colorId = parseColorToken(token);
      unit.syncVoxelId();
    }
    benchUnits.push(unit);
  });
  rollHiddenQueue(benchUnits);

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
  root.addChild(new Node('DebrisPool'));

  const battle = root.addComponent(BattleDirector);
  battle.armSpawn(unitPfs, reserve);
  // Build while active so Cocos schedules update; hide only after onLoad/onEnable.
  if (opts?.active === false) root.active = false;
  note(1);
  return { root, battle };
}
