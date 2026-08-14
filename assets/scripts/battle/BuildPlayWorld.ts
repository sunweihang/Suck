import { assetManager, instantiate, Node, Prefab, Vec3 } from 'cc';
import { GAME, UNIT_SETUP, slotLocked, slotX, wallColAtX, wallColorToken } from '../game/GameConfig';
import { BattleDirector } from './BattleDirector';
import { BlockCell } from './BlockCell';
import { DebrisBit } from './DebrisBit';
import { PREFAB_UUID } from './PrefabCatalog';
import { SlotPad } from './SlotPad';
import { applyShadowReceiver } from './ToyBlockMesh';
import { OCTOPUS_STAND_Y } from './ToyOctopusMesh';
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

export async function buildPlayWorld(scene: Node): Promise<{ root: Node; battle: BattleDirector }> {
  const pack = await Promise.all([
    loadPrefab(PREFAB_UUID.Ground),
    loadPrefab(PREFAB_UUID.BlockOrange),
    loadPrefab(PREFAB_UUID.UnitOrange),
    loadPrefab(PREFAB_UUID.Slot),
    loadPrefab(PREFAB_UUID.Debris),
  ]);
  const [groundPf, blockPf, unitPf, slotPf, debrisPf] = pack;

  const root = new Node('PlayWorld');
  scene.addChild(root);

  applyShadowReceiver(spawn(groundPf, root, 'Ground', new Vec3(0, -0.12, 0)));

  const wall = new Node('Wall');
  root.addChild(wall);
  const cols = GAME.wallCols;
  const rows = GAME.wallRows;
  const depth = GAME.wallDepth;
  const step = GAME.blockStep;
  const startX = -((cols - 1) * step) / 2;
  const frontZ = GAME.wallFrontZ;
  for (let z = 0; z < depth; z++) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const token = wallColorToken(x, y);
        const n = spawn(
          blockPf,
          wall,
          `Blk_${token}_${x}_${y}_${z}`,
          new Vec3(startX + x * step, 0.22 + y * step, frontZ - z * step),
        );
        (n.getComponent(BlockCell) ?? n.addComponent(BlockCell)).syncFromName();
      }
    }
  }

  const bench = new Node('Bench');
  root.addChild(bench);
  const ucols = 6;
  const usx = 0.52;
  const usz = 0.46;
  const uStartX = -((ucols - 1) * usx) / 2;
  const uStartZ = 1.08;
  UNIT_SETUP.forEach((pair, i) => {
    const [token, power] = pair;
    const cx = i % ucols;
    const cz = Math.floor(i / ucols);
    const x = uStartX + cx * usx;
    const z = uStartZ + cz * usz;
    const n = spawn(
      unitPf,
      bench,
      `Unit_${String(i).padStart(2, '0')}_${token}_${power}`,
      new Vec3(x, OCTOPUS_STAND_Y, z),
    );
    (n.getComponent(UnitActor) ?? n.addComponent(UnitActor)).syncFromName();
  });

  const slots = new Node('Slots');
  root.addChild(slots);
  for (let i = 0; i < GAME.slotMax; i++) {
    const x = slotX(i, GAME.slotMax);
    const n = spawn(slotPf, slots, `Slot_${i}`, new Vec3(x, 0, GAME.slotStandZ));
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
  return { root, battle };
}
