import { Color, Layers, Material, Mesh, MeshRenderer, Node, Vec3, director, utils } from 'cc';
import { shooterStandZ, slotY } from '../game/GameConfig';
import { makeInstancedUnlit } from './ToyBlockMesh';

/**
 * Original VoxelRuntimeController.BatchedVfxEmitter + budgeted presentation.
 * One shared chip pool (not a GameObject per fragment), 2 hits / frame, 24 live.
 */
const MAX_BUDGETED_PER_FRAME = 2;
const MAX_CONCURRENT = 24;
const HIT_LIFE = 1.2;
const PARTICLES_PER_HIT = 6;
const MAX_CHIPS = 64;
const GRAVITY = 14;
const CHIP_PRI = 36;
const DOCK_BAND_PAD = 0.42;
const BEHIND_DOCK_Z = 0.55;

type Chip = {
  node: Node;
  vel: Vec3;
  life: number;
  lifeMax: number;
  size: number;
  rgbKey: string;
};

const _pos = new Vec3();
const _chips: Chip[] = [];
const _hitExpiry: number[] = [];
const _mats = new Map<string, Material>();
const _colors = new Map<string, Color>();

let _cube: Mesh | null = null;
let _host: Node | null = null;
let _budgetFrame = -1;
let _budgetUsed = 0;
let _liveHits = 0;
let _liveChips = 0;
let _now = 0;

function colorOf(rgb: readonly [number, number, number]): Color {
  const key = `${rgb[0]},${rgb[1]},${rgb[2]}`;
  let c = _colors.get(key);
  if (c) return c;
  c = new Color(rgb[0], rgb[1], rgb[2], 255);
  _colors.set(key, c);
  return c;
}

function chipMat(rgb: readonly [number, number, number]): Material {
  const key = `${rgb[0]},${rgb[1]},${rgb[2]}`;
  let mat = _mats.get(key);
  if (mat?.passes?.length) return mat;
  mat = makeInstancedUnlit(colorOf(rgb));
  _mats.set(key, mat);
  return mat;
}

function cubeMesh(): Mesh {
  if (_cube?.isValid) return _cube;
  const p = 0.5;
  _cube = utils.MeshUtils.createMesh({
    positions: [
      -p, -p, p, p, -p, p, p, p, p, -p, p, p,
      -p, -p, -p, -p, p, -p, p, p, -p, p, -p, -p,
      -p, p, -p, -p, p, p, p, p, p, p, p, -p,
      -p, -p, -p, p, -p, -p, p, -p, p, -p, -p, p,
      p, -p, -p, p, p, -p, p, p, p, p, -p, p,
      -p, -p, -p, -p, -p, p, -p, p, p, -p, p, -p,
    ],
    normals: [
      0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
      0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
      0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
      0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
      1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
      -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
    ],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1],
    indices: [
      0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7,
      8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15,
      16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23,
    ],
    minPos: new Vec3(-p, -p, -p),
    maxPos: new Vec3(p, p, p),
    boundingRadius: Math.sqrt(0.75),
  });
  return _cube;
}

function ensureHost(parent: Node): Node | null {
  if (_host?.isValid && _host.parent === parent) return _host;
  if (_host?.isValid) {
    _host.destroy();
    _chips.length = 0;
    _liveChips = 0;
  }
  const n = new Node('DestroyBurst');
  n.layer = Layers.Enum.DEFAULT;
  parent.addChild(n);
  _host = n;
  return n;
}

function takeChip(host: Node): Chip | null {
  for (let i = 0; i < _chips.length; i++) {
    if (_chips[i].life <= 0) return _chips[i];
  }
  if (_chips.length >= MAX_CHIPS) {
    let oldest = _chips[0];
    for (let i = 1; i < _chips.length; i++) {
      if (_chips[i].life < oldest.life) oldest = _chips[i];
    }
    return oldest;
  }
  const node = new Node(`Chip_${_chips.length}`);
  node.layer = Layers.Enum.DEFAULT;
  host.addChild(node);
  const mr = node.addComponent(MeshRenderer);
  mr.mesh = cubeMesh();
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  mr.priority = CHIP_PRI;
  const chip: Chip = {
    node,
    vel: new Vec3(),
    life: 0,
    lifeMax: 0.7,
    size: 0.1,
    rgbKey: '',
  };
  _chips.push(chip);
  return chip;
}

function paintChip(chip: Chip, rgb: readonly [number, number, number]): void {
  const key = `${rgb[0]},${rgb[1]},${rgb[2]}`;
  if (chip.rgbKey === key) return;
  chip.rgbKey = key;
  const mr = chip.node.getComponent(MeshRenderer);
  if (!mr) return;
  mr.setSharedMaterial(chipMat(rgb), 0);
}

function tryBudget(): boolean {
  const frame = director.getTotalFrames();
  if (frame !== _budgetFrame) {
    _budgetFrame = frame;
    _budgetUsed = 0;
  }
  pruneHits();
  if (_budgetUsed >= MAX_BUDGETED_PER_FRAME) return false;
  if (_liveHits >= MAX_CONCURRENT) return false;
  if (_liveChips + PARTICLES_PER_HIT > MAX_CHIPS) return false;
  _budgetUsed += 1;
  _liveHits += 1;
  _hitExpiry.push(_now + HIT_LIFE);
  return true;
}

function pruneHits(): void {
  const now = _now;
  let w = 0;
  for (let i = 0; i < _hitExpiry.length; i++) {
    if (_hitExpiry[i] > now) {
      _hitExpiry[w] = _hitExpiry[i];
      w += 1;
    }
  }
  _hitExpiry.length = w;
  _liveHits = w;
}

/** Original Budgeted destroy: emit chips if the volley still has room. */
export function playDestroyBurst(
  host: Node,
  world: Vec3,
  rgb: readonly [number, number, number],
): void {
  if (!host?.isValid) return;
  if (!tryBudget()) return;
  const root = ensureHost(host);
  if (!root) return;
  for (let i = 0; i < PARTICLES_PER_HIT; i++) {
    const chip = takeChip(root);
    if (!chip) break;
    const wasLive = chip.life > 0;
    paintChip(chip, rgb);
    chip.node.setWorldPosition(
      world.x + (Math.random() - 0.5) * 0.18,
      world.y + (Math.random() - 0.5) * 0.16,
      world.z + (Math.random() - 0.5) * 0.18,
    );
    chip.size = 0.07 + Math.random() * 0.06;
    chip.node.setScale(chip.size, chip.size, chip.size);
    chip.node.setRotationFromEuler(Math.random() * 360, Math.random() * 360, Math.random() * 360);
    chip.vel.set(
      (Math.random() - 0.5) * 2.4,
      1.1 + Math.random() * 2.2,
      (Math.random() - 0.5) * 2.4,
    );
    chip.lifeMax = 0.55 + Math.random() * 0.28;
    chip.life = chip.lifeMax;
    chip.node.active = true;
    if (!wasLive) _liveChips += 1;
  }
}

export function tickDestroyBurst(dt: number): void {
  _now += dt;
  pruneHits();
  if (_liveChips <= 0) return;
  for (let i = 0; i < _chips.length; i++) {
    const chip = _chips[i];
    if (chip.life <= 0) continue;
    chip.life -= dt;
    chip.vel.y -= GRAVITY * dt;
    chip.node.getWorldPosition(_pos);
    _pos.x += chip.vel.x * dt;
    _pos.y += chip.vel.y * dt;
    _pos.z += chip.vel.z * dt;
    if (_pos.y < slotY() + DOCK_BAND_PAD) {
      _pos.z = Math.min(_pos.z, shooterStandZ() - BEHIND_DOCK_Z);
    }
    chip.node.setWorldPosition(_pos);
    const u = chip.life / chip.lifeMax;
    if (u <= 0.34) {
      const s = chip.size * Math.max(0.04, u / 0.34);
      chip.node.setScale(s, s, s);
    }
    if (chip.life > 0) continue;
    chip.node.active = false;
    _liveChips = Math.max(0, _liveChips - 1);
  }
}

export function destroyBurstBusy(): boolean {
  return _liveChips > 0 || _liveHits > 0;
}

export function clearDestroyBurst(): void {
  for (let i = 0; i < _chips.length; i++) {
    const n = _chips[i].node;
    if (n?.isValid) n.active = false;
  }
  _chips.length = 0;
  _hitExpiry.length = 0;
  _liveChips = 0;
  _liveHits = 0;
  _budgetUsed = 0;
  _now = 0;
  if (_host?.isValid) _host.destroy();
  _host = null;
}
