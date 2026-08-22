import {
  Color,
  Layers,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  RenderingSubMesh,
  director,
  gfx,
} from 'cc';
import type { BlockCell } from './BlockCell';
import { attachBrickRenderer, brickCubeMesh, sandRgbOf } from './BrickSpecials';
import { lookOfVoxel } from '../game/VoxelPalette';
import { inflateFieldCull, makeBrickBatchMat, rebindFieldLitCache, wakeBrickMesh, applyFlyBrickRender } from './ToyBlockMesh';
import { registerFieldMat } from './FieldSpin';
import { FLY_BRICK_PRI } from './ToyLook';

const SKIN_ROOT = 'BrickSkins';
const SKIP_BODY = /^(HoldRim|Outline|Crease|BlobShadow|Pad|Power|Bank|Text|Lock|Chip_|Trail_|Hit_|Muzzle_|Paint|Magnet)/;
const GRAY_DIM = 0.76;
const INST_FLOATS = 16;
const INST_STRIDE = INST_FLOATS * 4;
const MIN_CAP = 32;
const REST_KEY = 'rest';
const FLY_KEY = 'fly';
const WHITE = new Color(255, 255, 255, 255);

type Batch = {
  key: string;
  node: Node;
  mr: MeshRenderer;
  cells: BlockCell[];
  data: Float32Array;
  vb: gfx.Buffer;
  cap: number;
  dirty: boolean;
};

const _batches = new Map<string, Batch>();
const _fly = new Map<string, Batch>();
const _of = new Map<BlockCell, Batch>();
let _restMat: Material | null = null;
let _flyMat: Material | null = null;

let _host: Node | null = null;
let _cube: Mesh | null = null;
let _mustFlush = false;
let _useBatch = false;

function skipBody(name: string): boolean {
  return SKIP_BODY.test(name) || /^[DN]\d$/.test(name);
}

function setBodyEnabled(node: Node, on: boolean): void {
  if (!node.children.length) {
    const mr = node.getComponent(MeshRenderer);
    if (mr && !skipBody(mr.node.name)) mr.enabled = on;
    return;
  }
  const mrs = node.getComponentsInChildren(MeshRenderer);
  for (let i = 0; i < mrs.length; i++) {
    const mr = mrs[i];
    if (skipBody(mr.node.name)) continue;
    mr.enabled = on;
  }
}

function gfxDevice(): gfx.Device | null {
  return director.root?.device ?? null;
}

function instancingOk(): boolean {
  const dev = gfxDevice();
  return !!dev?.hasFeature(gfx.Feature.INSTANCED_ARRAYS);
}

export function brickSkinBatched(): boolean {
  return _useBatch;
}

function displayRgb(block: BlockCell): readonly [number, number, number] {
  let rgb = block.voxelId >= 0 ? lookOfVoxel(block.voxelId).rgb : lookOfVoxel(0).rgb;
  if (block.sand) rgb = sandRgbOf(rgb);
  if (!block.grayed) return rgb;
  const y = Math.round(((rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000) * GRAY_DIM);
  return [y, y, y];
}

function sharedMat(fly = false): Material | null {
  const hit = fly ? _flyMat : _restMat;
  if (hit?.passes?.length) return fly ? hit : registerFieldMat(hit);
  const mat = makeBrickBatchMat(WHITE, !fly);
  if (!mat) return null;
  if (fly) _flyMat = mat;
  else _restMat = mat;
  return mat;
}

function nextCap(n: number): number {
  let cap = MIN_CAP;
  while (cap < n) cap <<= 1;
  return cap;
}

function writePacked(
  data: Float32Array,
  i: number,
  m: { m00: number; m01: number; m02: number; m04: number; m05: number; m06: number; m08: number; m09: number; m10: number; m12: number; m13: number; m14: number },
  rgb: readonly [number, number, number],
): void {
  const o = i * INST_FLOATS;
  data[o] = m.m00;
  data[o + 1] = m.m01;
  data[o + 2] = m.m02;
  data[o + 3] = m.m12;
  data[o + 4] = m.m04;
  data[o + 5] = m.m05;
  data[o + 6] = m.m06;
  data[o + 7] = m.m13;
  data[o + 8] = m.m08;
  data[o + 9] = m.m09;
  data[o + 10] = m.m10;
  data[o + 11] = m.m14;
  data[o + 12] = rgb[0] * (1 / 255);
  data[o + 13] = rgb[1] * (1 / 255);
  data[o + 14] = rgb[2] * (1 / 255);
  data[o + 15] = 1;
}

function makeInstVb(dev: gfx.Device, cap: number): gfx.Buffer {
  return dev.createBuffer(new gfx.BufferInfo(
    gfx.BufferUsageBit.VERTEX | gfx.BufferUsageBit.TRANSFER_DST,
    gfx.MemoryUsageBit.HOST | gfx.MemoryUsageBit.DEVICE,
    INST_STRIDE * cap,
    INST_STRIDE,
  ));
}

function bindInstanceStream(mr: MeshRenderer, cube: Mesh, vb: gfx.Buffer): boolean {
  const model = mr.model;
  const src = cube.renderingSubMeshes?.[0];
  if (!model || !src?.vertexBuffers.length) return false;
  const stream = src.vertexBuffers.length;
  const attributes = src.attributes.map((a) => new gfx.Attribute(
    a.name,
    a.format,
    a.isNormalized,
    a.stream,
    !!a.isInstanced,
    a.location,
  ));
  attributes.push(new gfx.Attribute('a_matWorld0', gfx.Format.RGBA32F, false, stream, true));
  attributes.push(new gfx.Attribute('a_matWorld1', gfx.Format.RGBA32F, false, stream, true));
  attributes.push(new gfx.Attribute('a_matWorld2', gfx.Format.RGBA32F, false, stream, true));
  attributes.push(new gfx.Attribute('a_instColor', gfx.Format.RGBA32F, false, stream, true));
  const sub = new RenderingSubMesh(
    [...src.vertexBuffers, vb],
    attributes,
    src.primitiveMode,
    src.indexBuffer,
    src.indirectBuffer,
    false,
  );
  const mat = mr.getSharedMaterial(0);
  if (!mat) return false;
  model.initSubModel(0, sub, mat);
  inflateFieldCull(cube);
  return true;
}

function setInstanceCount(mr: MeshRenderer, n: number): void {
  const ia = mr.model?.subModels[0]?.inputAssembler;
  if (ia) ia.instanceCount = n;
  mr.enabled = n > 0;
}

function ensureHost(field: Node | null, actors: Node | null): Node | null {
  const parent = field?.getChildByName('Wall') ?? field ?? actors;
  if (!parent?.isValid) return null;
  if (_host?.isValid && _host.parent === parent) return _host;
  if (_host?.isValid) dropHost();
  const n = new Node(SKIN_ROOT);
  n.layer = Layers.Enum.DEFAULT;
  parent.addChild(n);
  n.setPosition(0, 0, 0);
  n.setRotationFromEuler(0, 0, 0);
  _host = n;
  return n;
}

function dropHost(): void {
  const kill = (batch: Batch): void => {
    try {
      batch.vb.destroy();
    } catch {
      /* already gone */
    }
  };
  _batches.forEach(kill);
  _fly.forEach(kill);
  _batches.clear();
  _fly.clear();
  _of.clear();
  if (_host?.isValid) _host.destroy();
  _host = null;
}

function probeBatch(): boolean {
  if (_useBatch) return true;
  _cube = brickCubeMesh();
  if (!_cube?.renderingSubMeshes?.[0] || !instancingOk() || !RenderingSubMesh) return false;
  _useBatch = !!sharedMat(false);
  return _useBatch;
}

export function brickSkinNeedsFlush(): boolean {
  return _mustFlush;
}

export function requestBrickSkinFlush(): void {
  _mustFlush = true;
}

function takeBatch(
  key: string,
  host: Node,
  fly = false,
): Batch | null {
  const store = fly ? _fly : _batches;
  const hit = store.get(key);
  if (hit) return hit;
  const dev = gfxDevice();
  const cube = _cube;
  const mat = sharedMat(fly);
  if (!dev || !cube || !mat || !host.isValid) return null;
  const node = new Node(fly ? `Fly_${key}` : `Skin_${key}`);
  node.layer = Layers.Enum.DEFAULT;
  host.addChild(node);
  const mr = node.addComponent(MeshRenderer);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  if (fly) mr.priority = FLY_BRICK_PRI;
  mr.setSharedMaterial(mat, 0);
  mr.mesh = cube;
  const cap = MIN_CAP;
  const vb = makeInstVb(dev, cap);
  if (!bindInstanceStream(mr, cube, vb)) {
    node.destroy();
    vb.destroy();
    return null;
  }
  setInstanceCount(mr, 0);
  const batch: Batch = {
    key,
    node,
    mr,
    cells: [],
    data: new Float32Array(cap * INST_FLOATS),
    vb,
    cap,
    dirty: true,
  };
  store.set(key, batch);
  return batch;
}

function growBatch(batch: Batch, need: number): boolean {
  const cap = nextCap(need);
  if (cap <= batch.cap) return true;
  const dev = gfxDevice();
  const cube = _cube;
  if (!dev || !cube) return false;
  const vb = makeInstVb(dev, cap);
  const data = new Float32Array(cap * INST_FLOATS);
  data.set(batch.data);
  if (!bindInstanceStream(batch.mr, cube, vb)) {
    vb.destroy();
    return false;
  }
  try {
    batch.vb.destroy();
  } catch {
    /* */
  }
  batch.vb = vb;
  batch.data = data;
  batch.cap = cap;
  return true;
}

function keepRest(cell: BlockCell): boolean {
  return !!cell?.node?.isValid && cell.node.active && !cell.buried && cell.onField;
}

function keepFly(cell: BlockCell): boolean {
  return !!cell?.node?.isValid && cell.node.active && !cell.onField;
}

function uploadBatch(batch: Batch, fly: boolean): void {
  const cells = batch.cells;
  if (cells.length > batch.cap && !growBatch(batch, cells.length)) return;
  const data = batch.data;
  const keep = fly ? keepFly : keepRest;
  let w = 0;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (!keep(cell)) {
      _of.delete(cell);
      continue;
    }
    cells[w] = cell;
    writePacked(data, w, cell.node.worldMatrix, displayRgb(cell));
    w += 1;
  }
  cells.length = w;
  if (w > 0) batch.vb.update(data);
  setInstanceCount(batch.mr, w);
  batch.dirty = false;
}

function pullCell(batch: Batch, block: BlockCell): void {
  const i = batch.cells.indexOf(block);
  if (i < 0) return;
  batch.cells[i] = batch.cells[batch.cells.length - 1];
  batch.cells.pop();
  batch.dirty = true;
}

function hideBody(block: BlockCell): void {
  setBodyEnabled(block.node, false);
}

function showBody(block: BlockCell): void {
  try {
    const id = block.voxelId >= 0 ? block.voxelId : block.colorId;
    if (!block.node.getComponent(MeshRenderer)?.mesh) {
      attachBrickRenderer(block.node, id);
    }
    setBodyEnabled(block.node, true);
    wakeBrickMesh(block.node);
  } catch {
    /* flying brick can still leave the batch without a private mesh */
  }
}

function canSkin(block: BlockCell): boolean {
  return keepRest(block);
}

function addToStore(block: BlockCell, host: Node, fly: boolean): boolean {
  if (fly ? !keepFly(block) : !keepRest(block)) return false;
  const key = fly ? FLY_KEY : REST_KEY;
  const cur = _of.get(block);
  if (cur && cur.key === key) {
    cur.dirty = true;
    hideBody(block);
    return true;
  }
  if (cur) {
    pullCell(cur, block);
    _of.delete(block);
  }
  const batch = takeBatch(key, host, fly);
  if (!batch) return false;
  batch.cells.push(block);
  batch.dirty = true;
  _of.set(block, batch);
  hideBody(block);
  return true;
}

function addToBatch(block: BlockCell, host: Node): boolean {
  return addToStore(block, host, false);
}

function fallbackDraw(blocks: BlockCell[], buried: (b: BlockCell) => boolean): void {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b.alive || buried(b)) continue;
    if (b.meshless && attachBrickRenderer(b.node, b.voxelId)) b.meshless = false;
    setBodyEnabled(b.node, true);
  }
}

export function bindBrickSkin(field: Node | null, actors: Node | null): void {
  if (_host?.isValid && _host.parent !== (field?.getChildByName('Wall') ?? field ?? actors)) {
    dropHost();
  }
  ensureHost(field, actors);
  probeBatch();
  // resetFieldSpin() drops the GPU list; session-cached mats must go back on
  // or the next level's wall looks frozen while combat still tracks spin.
  if (_restMat?.passes?.length) registerFieldMat(_restMat);
  rebindFieldLitCache();
}

export function clearBrickSkin(): void {
  dropHost();
  _mustFlush = false;
}

export function dirtyBrickSkin(): void {
  _batches.forEach((batch) => {
    batch.dirty = true;
  });
}

export function markBrickSkin(block: BlockCell | null | undefined): void {
  const batch = block ? _of.get(block) : undefined;
  if (batch) batch.dirty = true;
}

export function popBrickSkin(block: BlockCell | null | undefined): void {
  if (!block?.node?.isValid) return;
  const batch = _of.get(block);
  if (batch) {
    pullCell(batch, block);
    _of.delete(block);
  }
}

export function coverBrickSkin(block: BlockCell | null | undefined): void {
  if (!block || !keepRest(block)) return;
  if (!_useBatch || !_host?.isValid) {
    showBody(block);
    return;
  }
  if (!addToBatch(block, _host)) showBody(block);
}

/** Baked-off flying cubes stay instanced. Spin is already in the world matrix. */
export function flyBrickSkin(block: BlockCell | null | undefined): void {
  if (!block || !keepFly(block)) return;
  if (!_useBatch || !_host?.isValid) {
    showBody(block);
    applyFlyBrickRender(block.node);
    return;
  }
  if (!addToStore(block, _host, true)) {
    showBody(block);
    applyFlyBrickRender(block.node);
  }
}

/** Resting shell cubes share one draw. Flying cubes share a second draw. */
export function flushBrickSkin(blocks: BlockCell[], buried: (b: BlockCell) => boolean): void {
  const host = _host;
  if (!probeBatch() || !host?.isValid) {
    fallbackDraw(blocks, buried);
    _mustFlush = false;
    return;
  }
  _batches.forEach((batch) => {
    batch.cells.length = 0;
    batch.dirty = true;
  });
  _of.clear();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!canSkin(b) || buried(b)) continue;
    b.meshless = false;
    if (!addToBatch(b, host)) showBody(b);
  }
  _batches.forEach((batch) => uploadBatch(batch, false));
  _mustFlush = false;
}

export function tickBrickSkin(): void {
  if (!_useBatch) return;
  _batches.forEach((batch) => {
    if (batch.dirty) uploadBatch(batch, false);
  });
  _fly.forEach((batch) => {
    if (batch.dirty || batch.cells.length) uploadBatch(batch, true);
  });
}
