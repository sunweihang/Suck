import { Layers, Mat4, Material, Mesh, MeshRenderer, Node, Vec3, gfx, utils } from 'cc';
import type { BlockCell } from './BlockCell';
import { applyMesh, fieldSkinMat, wakeBrickMesh } from './ToyBlockMesh';

const SKIN_ROOT = 'BrickSkins';
const SKIP_BODY = /^(HoldRim|Outline|Crease|BlobShadow|Pad|Power|Bank|Text|Lock|Chip_|Trail_|Hit_|Muzzle_|Paint|Magnet)/;
const BATCH_MIN = 8;
const VERT_CAP = 60000;
const FAIL_MAX = 3;

const _local = new Mat4();
const _acc = new Mat4();
const _pos = new Vec3();
const _nrm = new Vec3();
const _min = new Vec3();
const _max = new Vec3();

const SKIP_BRICK = /^(Chip_|Trail_|Hit_|Muzzle_)/;

type Proto = {
  pos: Float32Array;
  nrm: Float32Array | null;
  uv: Float32Array | null;
  idx: ArrayLike<number>;
  verts: number;
};

let _wall: Node | null = null;
let _host: Node | null = null;
let _dirty = false;
let _fails = 0;
const _loose = new Set<BlockCell>();
const _bodyOf = new WeakMap<Node, MeshRenderer[]>();
const _protoOf = new WeakMap<Mesh, Proto | null>();
const _matId = new WeakMap<Material, string>();
const _meshId = new WeakMap<Mesh, string>();
let _ids = 1;

function skipBody(name: string): boolean {
  return SKIP_BODY.test(name) || /^[DN]\d$/.test(name);
}

function hidMat(mat: Material): string {
  let id = _matId.get(mat);
  if (!id) {
    id = `m${_ids++}`;
    _matId.set(mat, id);
  }
  return id;
}

function hidMesh(mesh: Mesh): string {
  let id = _meshId.get(mesh);
  if (!id) {
    id = `h${_ids++}`;
    _meshId.set(mesh, id);
  }
  return id;
}

function bodyMrs(node: Node): MeshRenderer[] {
  let list = _bodyOf.get(node);
  if (list) return list;
  const mrs = node.getComponentsInChildren(MeshRenderer);
  list = [];
  for (let i = 0; i < mrs.length; i++) {
    const mr = mrs[i];
    if (!mr.mesh || skipBody(mr.node.name) || SKIP_BRICK.test(mr.node.name)) continue;
    list.push(mr);
  }
  _bodyOf.set(node, list);
  return list;
}

function setBodyEnabled(node: Node, on: boolean): void {
  const mrs = bodyMrs(node);
  for (let i = 0; i < mrs.length; i++) mrs[i].enabled = on;
}

function clearChildren(root: Node): void {
  const kids = root.children.slice();
  for (let i = 0; i < kids.length; i++) {
    const n = kids[i];
    const mesh = n.getComponent(MeshRenderer)?.mesh;
    n.destroy();
    mesh?.destroy();
  }
}

function dropHost(): void {
  if (!_host?.isValid) {
    _host = null;
    return;
  }
  clearChildren(_host);
  _host.destroy();
  _host = null;
}

function protoOf(mesh: Mesh): Proto | null {
  const hit = _protoOf.get(mesh);
  if (hit !== undefined) return hit;
  let proto: Proto | null = null;
  try {
    const pos = mesh.readAttribute(0, gfx.AttributeName.ATTR_POSITION);
    if (!pos || pos.length < 9) return null;
    const nrm = mesh.readAttribute(0, gfx.AttributeName.ATTR_NORMAL);
    const uv = mesh.readAttribute(0, gfx.AttributeName.ATTR_TEX_COORD);
    const idx = mesh.readIndices(0);
    const verts = (pos.length / 3) | 0;
    proto = {
      pos,
      nrm: nrm && nrm.length >= pos.length ? nrm : null,
      uv: uv && uv.length >= verts * 2 ? uv : null,
      idx: idx && idx.length >= 3 ? idx : sequentialIdx(verts),
      verts,
    };
  } catch {
    return null;
  }
  _protoOf.set(mesh, proto);
  return proto;
}

function sequentialIdx(verts: number): number[] {
  const idx: number[] = [];
  for (let i = 0; i + 2 < verts; i += 3) idx.push(i, i + 1, i + 2);
  return idx;
}

/** Local chain to Wall — world matrices are stale on inactive / just-parented worlds. */
function wallOf(node: Node): Mat4 {
  Mat4.identity(_local);
  const stack: Node[] = [];
  let n: Node | null = node;
  while (n && n !== _wall) {
    stack.push(n);
    n = n.parent;
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    Mat4.multiply(_acc, _local, stack[i].matrix);
    Mat4.copy(_local, _acc);
  }
  return _local;
}

function xformPos(x: number, y: number, z: number, m: Mat4, out: Vec3): Vec3 {
  out.x = x * m.m00 + y * m.m04 + z * m.m08 + m.m12;
  out.y = x * m.m01 + y * m.m05 + z * m.m09 + m.m13;
  out.z = x * m.m02 + y * m.m06 + z * m.m10 + m.m14;
  return out;
}

function xformNrm(x: number, y: number, z: number, m: Mat4, out: Vec3): Vec3 {
  out.x = x * m.m00 + y * m.m04 + z * m.m08;
  out.y = x * m.m01 + y * m.m05 + z * m.m09;
  out.z = x * m.m02 + y * m.m06 + z * m.m10;
  const len = Math.sqrt(out.x * out.x + out.y * out.y + out.z * out.z);
  if (len > 1e-8) {
    const inv = 1 / len;
    out.x *= inv;
    out.y *= inv;
    out.z *= inv;
  }
  return out;
}

function skipMerge(block: BlockCell, buried: (b: BlockCell) => boolean): boolean {
  if (!block.node?.isValid || !block.node.active || block.hp <= 0 || block.inFlight) return true;
  if (block.bombed || block.paint || block.locked || block.magnet || block.raft || block.grayed) return true;
  if (_loose.has(block)) return true;
  return buried(block);
}

function showAll(blocks: BlockCell[]): void {
  for (let i = 0; i < blocks.length; i++) {
    const n = blocks[i].node;
    if (n?.isValid) setBodyEnabled(n, true);
  }
}

function ensureHost(): Node | null {
  const wall = _wall;
  if (!wall?.isValid) return null;
  if (_host?.isValid && _host.parent === wall) return _host;
  dropHost();
  const leftover = wall.getChildByName(SKIN_ROOT);
  if (leftover) {
    clearChildren(leftover);
    leftover.destroy();
  }
  const host = new Node(SKIN_ROOT);
  host.layer = Layers.Enum.DEFAULT;
  wall.addChild(host);
  host.setPosition(0, 0, 0);
  host.setRotationFromEuler(0, 0, 0);
  host.setScale(1, 1, 1);
  _host = host;
  return host;
}

type Part = {
  node: Node;
  mr: MeshRenderer;
  mesh: Mesh;
  mat: Material;
  proto: Proto;
};

function collectParts(blocks: BlockCell[], buried: (b: BlockCell) => boolean): Map<string, Part[]> {
  const groups = new Map<string, Part[]>();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (skipMerge(b, buried)) continue;
    const mrs = bodyMrs(b.node);
    for (let k = 0; k < mrs.length; k++) {
      const mr = mrs[k];
      const mesh = mr.mesh;
      const mat = mr.getSharedMaterial(0);
      if (!mesh || !mat?.passes?.length) continue;
      const proto = protoOf(mesh);
      if (!proto) continue;
      const key = `${hidMesh(mesh)}|${hidMat(mat)}`;
      let list = groups.get(key);
      if (!list) {
        list = [];
        groups.set(key, list);
      }
      list.push({ node: mr.node, mr, mesh, mat, proto });
    }
  }
  return groups;
}

function buildChunk(parts: Part[], from: number, count: number): Mesh | null {
  const posOut: number[] = [];
  const nrmOut: number[] = [];
  const uvOut: number[] = [];
  const idxOut: number[] = [];
  _min.set(1e9, 1e9, 1e9);
  _max.set(-1e9, -1e9, -1e9);
  for (let i = 0; i < count; i++) {
    const part = parts[from + i];
    const proto = part.proto;
    const m = wallOf(part.node);
    const base = (posOut.length / 3) | 0;
    for (let v = 0; v < proto.verts; v++) {
      const o = v * 3;
      xformPos(proto.pos[o], proto.pos[o + 1], proto.pos[o + 2], m, _pos);
      posOut.push(_pos.x, _pos.y, _pos.z);
      if (_pos.x < _min.x) _min.x = _pos.x;
      if (_pos.y < _min.y) _min.y = _pos.y;
      if (_pos.z < _min.z) _min.z = _pos.z;
      if (_pos.x > _max.x) _max.x = _pos.x;
      if (_pos.y > _max.y) _max.y = _pos.y;
      if (_pos.z > _max.z) _max.z = _pos.z;
      if (proto.nrm) {
        xformNrm(proto.nrm[o], proto.nrm[o + 1], proto.nrm[o + 2], m, _nrm);
        nrmOut.push(_nrm.x, _nrm.y, _nrm.z);
      } else {
        nrmOut.push(0, 1, 0);
      }
      if (proto.uv) {
        const u = v * 2;
        uvOut.push(proto.uv[u], proto.uv[u + 1]);
      } else {
        uvOut.push(0, 0);
      }
    }
    const idx = proto.idx;
    for (let t = 0; t < idx.length; t++) idxOut.push(idx[t] + base);
  }
  if (posOut.length < 9 || idxOut.length < 3) return null;
  const rx = Math.max(Math.abs(_min.x), Math.abs(_max.x));
  const ry = Math.max(Math.abs(_min.y), Math.abs(_max.y));
  const rz = Math.max(Math.abs(_min.z), Math.abs(_max.z));
  return utils.MeshUtils.createMesh({
    positions: posOut,
    normals: nrmOut,
    uvs: uvOut,
    indices: idxOut,
    minPos: new Vec3(_min.x, _min.y, _min.z),
    maxPos: new Vec3(_max.x, _max.y, _max.z),
    boundingRadius: Math.hypot(rx, ry, rz),
  });
}

function spawnSkin(host: Node, name: string, mesh: Mesh, mat: Material): void {
  const n = new Node(name);
  n.layer = Layers.Enum.DEFAULT;
  host.addChild(n);
  n.setPosition(0, 0, 0);
  const mr = n.addComponent(MeshRenderer);
  applyMesh(mr, mesh, mat);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
}

function rebuild(blocks: BlockCell[], buried: (b: BlockCell) => boolean): void {
  const host = ensureHost();
  if (!host) {
    showAll(blocks);
    return;
  }
  clearChildren(host);
  showAll(blocks);
  let eligible = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (!skipMerge(blocks[i], buried)) eligible += 1;
  }
  const groups = collectParts(blocks, buried);
  let grouped = 0;
  groups.forEach((parts) => {
    grouped += parts.length;
  });
  if (eligible >= BATCH_MIN && grouped === 0) {
    throw new Error('brick proto unread');
  }
  let skin = 0;
  groups.forEach((parts) => {
    if (parts.length < BATCH_MIN) return;
    const mat = parts[0].mat;
    let cursor = 0;
    while (cursor < parts.length) {
      let verts = 0;
      let take = 0;
      while (cursor + take < parts.length) {
        const next = parts[cursor + take].proto.verts;
        if (take > 0 && verts + next > VERT_CAP) break;
        verts += next;
        take += 1;
      }
      const mesh = buildChunk(parts, cursor, take);
      if (mesh) {
        spawnSkin(host, `Skin_${skin++}`, mesh, fieldSkinMat(mat));
        for (let i = 0; i < take; i++) parts[cursor + i].mr.enabled = false;
      }
      cursor += take;
    }
  });
}

export function bindBrickSkin(field: Node | null, _actors: Node | null): void {
  dropHost();
  _wall = field?.getChildByName('Wall') ?? field ?? null;
  _loose.clear();
  _fails = 0;
  _dirty = true;
}

export function clearBrickSkin(): void {
  dropHost();
  _wall = null;
  _loose.clear();
  _fails = 0;
  _dirty = false;
}

export function dirtyBrickSkin(): void {
  _dirty = true;
}

export function popBrickSkin(block: BlockCell | null | undefined): void {
  if (!block?.node?.isValid) return;
  _loose.add(block);
  setBodyEnabled(block.node, true);
  wakeBrickMesh(block.node);
  _dirty = true;
}

export function coverBrickSkin(block: BlockCell | null | undefined): void {
  if (!block) return;
  _loose.delete(block);
  _dirty = true;
}

export function flushBrickSkin(blocks: BlockCell[], buried: (b: BlockCell) => boolean): void {
  if (!_dirty) return;
  if (_fails >= FAIL_MAX) {
    _dirty = false;
    dropHost();
    showAll(blocks);
    return;
  }
  try {
    rebuild(blocks, buried);
    _dirty = false;
    _fails = 0;
  } catch {
    _fails += 1;
    dropHost();
    showAll(blocks);
    if (_fails >= FAIL_MAX) _dirty = false;
  }
}
