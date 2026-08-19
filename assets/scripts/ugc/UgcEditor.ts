import {
  Camera,
  Color,
  Director,
  EventMouse,
  EventTouch,
  geometry,
  gfx,
  Input,
  Label,
  Layers,
  RenderRoot2D,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Prefab,
  Quat,
  UITransform,
  Vec3,
  assetManager,
  director,
  input,
  instantiate,
  utils,
} from 'cc';
import { BlockCell } from '../battle/BlockCell';
import { paintVoxelId, preloadVoxelLook } from '../battle/BrickSpecials';
import { BLOCK_PREFAB, PREFAB_UUID } from '../battle/PrefabCatalog';
import { applyToyGround } from '../battle/ToyBackdrop';
import { TURRET_PITCH_DEG, TURRET_YAW_DEG } from '../battle/ToyLook';
import { UNIT_CUBE_SCALE } from '../battle/TurretLook';
import {
  ColorToken,
  GAME,
  PLAY,
  TOKEN_RGB,
  TOKEN_VOXEL_ID,
  BENCH,
  benchSeatY,
  benchSeatZ,
  fitPlayLayout,
  parseColorToken,
} from '../game/GameConfig';
import { applyLevel } from '../game/LevelCatalog';
import { UGC_PLAY_BTN_LIFT, playViewBand } from '../game/ViewFit';
import { gameAudio } from '../audio/AudioService';
import {
  UGC_LAYOUT_DEPTH,
  UGC_MAX_DEPTH,
  UGC_MIN_DEPTH,
  UGC_PALETTE,
  UGC_SWATCHES,
  UgcMap,
  type UgcSwatch,
  type UgcTool,
  saveUgcMap,
  ugcBlankLevel,
  ugcToLevelDef,
  type UgcBrick,
} from './UgcStore';

export type UgcEditorHost = {
  camera: Camera;
  overUi: (loc: { x: number; y: number }) => boolean;
  onDirty?: () => void;
};

type PointerEvt = EventTouch | EventMouse;

const SPIN_THRESH_PX = 8;
const SPIN_FRICTION = 6.2;
const _ray = new geometry.Ray();
const _rayO = new Vec3();
const _rayD = new Vec3();
const _tmp = new Vec3();
const _world = new Vec3();
const _hit = new Vec3();
const _boxMin = new Vec3();
const _boxMax = new Vec3();
const _spinDq = new Quat();
const _camQ = new Quat();
const _camRight = new Vec3();
const _camUp = new Vec3();
const _spinAxis = new Vec3();

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

function cellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function rayHitsAabb(o: Vec3, d: Vec3, min: Vec3, max: Vec3, out: Vec3): number {
  let tmin = 0;
  let tmax = 80;
  for (let i = 0; i < 3; i++) {
    const orig = i === 0 ? o.x : i === 1 ? o.y : o.z;
    const dir = i === 0 ? d.x : i === 1 ? d.y : d.z;
    const lo = i === 0 ? min.x : i === 1 ? min.y : min.z;
    const hi = i === 0 ? max.x : i === 1 ? max.y : max.z;
    if (Math.abs(dir) < 1e-8) {
      if (orig < lo || orig > hi) return -1;
      continue;
    }
    let t1 = (lo - orig) / dir;
    let t2 = (hi - orig) / dir;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  const t = Math.max(0, tmin);
  out.set(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t);
  return t;
}

function ghostBoxMesh(): Mesh | null {
  const s = 0.5;
  const pos: number[] = [];
  const nrm: number[] = [];
  const faces: Array<readonly [number, number, number]> = [
    [0, 0, 1],
    [0, 0, -1],
    [0, 1, 0],
    [0, -1, 0],
    [1, 0, 0],
    [-1, 0, 0],
  ];
  const quads: number[][] = [
    [-s, -s, s, s, -s, s, s, s, s, -s, s, s],
    [s, -s, -s, -s, -s, -s, -s, s, -s, s, s, -s],
    [-s, s, s, s, s, s, s, s, -s, -s, s, -s],
    [-s, -s, -s, s, -s, -s, s, -s, s, -s, -s, s],
    [s, -s, s, s, -s, -s, s, s, -s, s, s, s],
    [-s, -s, -s, -s, -s, s, -s, s, s, -s, s, -s],
  ];
  const idx: number[] = [];
  for (let f = 0; f < 6; f++) {
    const q = quads[f];
    const n = faces[f];
    const o = pos.length / 3;
    for (let i = 0; i < 4; i++) {
      pos.push(q[i * 3], q[i * 3 + 1], q[i * 3 + 2]);
      nrm.push(n[0], n[1], n[2]);
    }
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  return utils.MeshUtils.createMesh({
    positions: pos,
    normals: nrm,
    indices: idx,
    minPos: new Vec3(-s, -s, -s),
    maxPos: new Vec3(s, s, s),
    boundingRadius: Math.hypot(s, s, s),
  });
}

let _ghostMesh: Mesh | null = null;
let _edgeMat: Material | null = null;
let _layerFill: Material | null = null;
let _layerEdge: Material | null = null;
const _markAim = new Vec3();
const _markFlip = new Quat();
Quat.fromEuler(_markFlip, 0, 180, 0);

function unlitMat(color: Color, writeDepth = false): Material {
  const transparent = color.a < 255;
  const m = new Material();
  m.initialize({
    effectName: 'builtin-unlit',
    technique: transparent ? 1 : 0,
    defines: { USE_COLOR: true },
    states: {
      rasterizerState: { cullMode: gfx.CullMode.NONE },
      depthStencilState: { depthTest: true, depthWrite: writeDepth },
      blendState: {
        targets: [{
          blend: transparent,
          blendSrc: gfx.BlendFactor.SRC_ALPHA,
          blendDst: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
          blendSrcAlpha: gfx.BlendFactor.SRC_ALPHA,
          blendDstAlpha: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
        }],
      },
    },
  });
  m.setProperty('mainColor', color);
  return m;
}

function ghostLook(): { mesh: Mesh | null; edge: Material; layerFill: Material; layerEdge: Material } {
  if (!_ghostMesh) _ghostMesh = ghostBoxMesh();
  if (!_edgeMat) _edgeMat = unlitMat(new Color(230, 236, 255, 150));
  if (!_layerFill) _layerFill = unlitMat(new Color(120, 220, 255, 102));
  if (!_layerEdge) _layerEdge = unlitMat(new Color(90, 230, 255, 220));
  return { mesh: _ghostMesh, edge: _edgeMat, layerFill: _layerFill, layerEdge: _layerEdge };
}

type CellPaint = { token: ColorToken; voxelId: number };
type CellUndo = { kind: 'cell'; x: number; y: number; z: number; before: CellPaint | null; after: CellPaint | null };

const PAL_COLS = 5;

function cellPaint(token: ColorToken, voxelId?: number): CellPaint {
  return { token, voxelId: voxelId ?? TOKEN_VOXEL_ID[token] };
}

function samePaint(a: CellPaint | null, b: CellPaint | null): boolean {
  if (!a || !b) return a === b;
  return a.voxelId === b.voxelId;
}
type AddLayerUndo = { kind: 'addLayer'; depth: number; layer: number };
type DelLayerUndo = { kind: 'delLayer'; layer: number; removed: UgcBrick[] };
type UndoOp = CellUndo | AddLayerUndo | DelLayerUndo;

export class UgcEditor {
  readonly node: Node;
  private readonly _map: UgcMap;
  private readonly _host: UgcEditorHost;
  private readonly _bricks = new Map<string, CellPaint>();
  private readonly _nodes = new Map<string, Node>();
  private readonly _undo: UndoOp[] = [];
  private readonly _spinRot = new Quat();
  private readonly _posedRot = new Quat();
  private _blockPfs = new Map<ColorToken, Prefab>();
  private readonly _palette = new Map<number, Node>();
  private _field: Node | null = null;
  private _wall: Node | null = null;
  private _ghosts: Node | null = null;
  private _swatch: UgcSwatch = UGC_SWATCHES.find((s) => s.token === 'c') ?? UGC_SWATCHES[0];
  private _tool: UgcTool = 'paint';
  private _layer = 0;
  private _fieldCy = 0;
  private _fieldCz = 0;
  private _spinVel = 0;
  private _pitchVel = 0;
  private _ptrDown = false;
  private _dragSpin = false;
  private _spinning = false;
  private _fromTouch = false;
  private _dragStartX = 0;
  private _dragStartY = 0;
  private _dragLastX = 0;
  private _dragLastY = 0;
  private _tickBound = false;
  private _dirty = false;
  private _showAll = false;

  private constructor(node: Node, map: UgcMap, host: UgcEditorHost) {
    this.node = node;
    this._map = map;
    this._host = host;
  }

  static async open(scene: Node, map: UgcMap, host: UgcEditorHost): Promise<UgcEditor> {
    const root = new Node('UgcWorld');
    scene.addChild(root);
    const editor = new UgcEditor(root, map, host);
    await editor._boot();
    return editor;
  }

  get map(): UgcMap {
    return this._map;
  }

  get token(): ColorToken {
    return this._swatch.token;
  }

  get tool(): UgcTool {
    return this._tool;
  }

  get layer(): number {
    return this._layer;
  }

  get depth(): number {
    return this._map.depth;
  }

  get brickCount(): number {
    return this._bricks.size;
  }

  get canUndo(): boolean {
    return this._undo.length > 0;
  }

  get undoCount(): number {
    return this._undo.length;
  }

  get showAll(): boolean {
    return this._showAll;
  }

  setToken(token: ColorToken): void {
    this._swatch = UGC_SWATCHES.find((s) => s.token === token) ?? this._swatch;
    this._tool = 'paint';
    this._syncPalette();
  }

  setSwatch(voxelId: number): void {
    this._swatch = UGC_SWATCHES.find((s) => s.voxelId === voxelId) ?? this._swatch;
    this._tool = 'paint';
    this._syncPalette();
  }

  setTool(tool: UgcTool): void {
    this._tool = tool;
    this._syncPalette();
  }

  setLayer(n: number): void {
    this._layer = Math.max(0, Math.min(this._map.depth - 1, n | 0));
    this._rebuildGhosts();
    this._applyLayerVis();
  }

  setPreview(on: boolean): void {
    this._showAll = !!on;
    this._applyLayerVis();
    this._syncGhosts();
  }

  setDepth(n: number): boolean {
    const next = Math.max(UGC_MIN_DEPTH, Math.min(UGC_MAX_DEPTH, n | 0));
    if (next === this._map.depth) return false;
    const prevDepth = this._map.depth;
    const prevLayer = this._layer;
    if (next > prevDepth) this._pushUndo({ kind: 'addLayer', depth: prevDepth, layer: prevLayer });
    if (next < this._map.depth) {
      const keys = [...this._bricks.keys()];
      for (const key of keys) {
        const [x, y, z] = key.split(',').map(Number);
        if (z >= next) this._writeCell(x, y, z, null, false);
      }
    }
    this._map.depth = next;
    this._layer = next > prevDepth ? next - 1 : Math.min(this._layer, next - 1);
    this._syncEdit();
    this._markDirty();
    return true;
  }

  removeLayer(): boolean {
    if (this._map.depth <= UGC_MIN_DEPTH) return false;
    const layer = this._layer;
    const removed: UgcBrick[] = [];
    const moving: UgcBrick[] = [];
    this._bricks.forEach((paint, key) => {
      const [x, y, z] = key.split(',').map(Number);
      const brick: UgcBrick = { x, y, z, token: paint.token, voxelId: paint.voxelId };
      if (z === layer) removed.push(brick);
      else if (z > layer) moving.push(brick);
    });
    for (const b of removed) this._writeCell(b.x, b.y, b.z, null, false);
    moving.sort((a, b) => a.z - b.z);
    for (const b of moving) {
      this._writeCell(b.x, b.y, b.z, null, false);
      this._writeCell(b.x, b.y, b.z - 1, cellPaint(b.token, b.voxelId), false);
    }
    this._map.depth -= 1;
    this._layer = Math.min(layer, this._map.depth - 1);
    this._pushUndo({ kind: 'delLayer', layer, removed });
    this._syncEdit();
    this._markDirty();
    return true;
  }

  clearModel(): boolean {
    if (this._bricks.size <= 0) return false;
    const keys = [...this._bricks.keys()];
    for (const key of keys) {
      const [x, y, z] = key.split(',').map(Number);
      this._writeCell(x, y, z, null, false);
    }
    this._undo.length = 0;
    this._rebuildGhosts();
    this._applyLayerVis();
    this._markDirty();
    this.persist();
    return true;
  }

  persist(): void {
    this._map.bricks = this._exportBricks();
    saveUgcMap(this._map);
    this._dirty = false;
  }

  toLevelDef() {
    this._map.bricks = this._exportBricks();
    return ugcToLevelDef(this._map);
  }

  undo(): boolean {
    const op = this._undo.pop();
    if (!op) return false;
    if (op.kind === 'addLayer') this._restoreAfterAdd(op);
    else if (op.kind === 'delLayer') this._restoreLayer(op.layer, op.removed);
    else {
      this._writeCell(op.x, op.y, op.z, op.before, false);
      this._rebuildGhosts();
      this._applyLayerVis();
    }
    this._markDirty();
    return true;
  }

  dispose(): void {
    this._unbind();
    if (this.node.isValid) {
      this.node.name = 'UgcWorld_disposed';
      this.node.removeFromParent();
      this.node.destroy();
    }
  }

  private async _boot(): Promise<void> {
    applyLevel(ugcBlankLevel(this._map), { minDepth: UGC_LAYOUT_DEPTH });
    PLAY.wallDepth = UGC_LAYOUT_DEPTH;
    PLAY.tints = {};
    for (const t of UGC_PALETTE) PLAY.tints[t] = TOKEN_RGB[t];
    fitPlayLayout(this._map.cols, this._map.rows, UGC_LAYOUT_DEPTH, 0, this._map.rows - 1, playViewBand(undefined, UGC_PLAY_BTN_LIFT));

    const tokens = [...UGC_PALETTE];
    const [groundPf, ...blockPfs] = await Promise.all([
      loadPrefab(PREFAB_UUID.Ground),
      ...tokens.map((t) => loadPrefab(BLOCK_PREFAB[t])),
      preloadVoxelLook(),
    ]);
    tokens.forEach((t, i) => this._blockPfs.set(t, blockPfs[i]));

    applyToyGround(spawn(groundPf, this.node, 'Ground', new Vec3(0, -0.12, 0)));

    const field = new Node('Field');
    this.node.addChild(field);
    this._field = field;
    this._poseField();

    const wall = new Node('Wall');
    field.addChild(wall);
    this._wall = wall;

    const ghosts = new Node('Ghosts');
    field.addChild(ghosts);
    this._ghosts = ghosts;

    this._spawnPalette();
    for (const b of this._map.bricks) this._writeCell(b.x, b.y, b.z, cellPaint(b.token, b.voxelId), false);
    this._rebuildGhosts();
    this._applyLayerVis();
    this._bind();
  }

  private _poseField(): void {
    this._fieldCy = PLAY.wallBaseY + Math.max(0, this._map.rows - 1) * PLAY.blockStep * 0.5;
    this._fieldCz = GAME.worldCamLookAtZ;
    this._field?.setPosition(0, this._fieldCy, this._fieldCz);
  }

  private _syncEdit(): void {
    this._rebuildGhosts();
    this._applyLayerVis();
  }

  private _spawnPalette(): void {
    const root = new Node('Palette');
    this.node.addChild(root);
    UGC_SWATCHES.forEach((swatch) => {
      const pf = this._blockPfs.get(swatch.token) ?? this._blockPfs.get('o');
      if (!pf) return;
      const n = spawn(pf, root, `Pal_${swatch.voxelId}`, Vec3.ZERO);
      paintVoxelId(n, swatch.voxelId);
      this._palette.set(swatch.voxelId, n);
    });
    this._placePalette();
    this._syncPalette();
  }

  private _placePalette(): void {
    const cube = UNIT_CUBE_SCALE * 0.72;
    const stepX = cube * 1.36;
    const pitch = (GAME.worldCamPitchDeg * Math.PI) / 180;
    const stepZ = (cube * 1.32) / Math.max(0.2, Math.sin(pitch));
    const ranks = Math.max(1, Math.ceil(UGC_SWATCHES.length / PAL_COLS));
    const dockZ = benchSeatZ(BENCH.rows - 1);
    const originX = -((PAL_COLS - 1) * stepX) / 2;
    UGC_SWATCHES.forEach((swatch, i) => {
      const n = this._palette.get(swatch.voxelId);
      if (!n?.isValid) return;
      const col = i % PAL_COLS;
      const rank = Math.floor(i / PAL_COLS);
      n.setPosition(originX + col * stepX, benchSeatY(), dockZ - (ranks - 1 - rank) * stepZ);
      n.setRotationFromEuler(TURRET_PITCH_DEG, TURRET_YAW_DEG, 0);
    });
  }

  private _syncPalette(): void {
    this._palette.forEach((n, voxelId) => {
      if (!n?.isValid) return;
      const on = this._tool === 'paint' && this._swatch.voxelId === voxelId;
      const s = UNIT_CUBE_SCALE * 0.72 * (on ? 1.16 : 1);
      n.setScale(s, s, s);
    });
  }

  private _voxelPos(x: number, y: number, z: number, out: Vec3): Vec3 {
    const step = PLAY.blockStep;
    const originX = -((this._map.cols - 1) * step) / 2;
    const originZ = GAME.worldCamLookAtZ + ((PLAY.wallDepth - 1) * step) / 2;
    return out.set(
      originX + x * step,
      PLAY.wallBaseY + y * step - this._fieldCy,
      originZ - z * step - this._fieldCz,
    );
  }

  private _pushUndo(op: UndoOp): void {
    this._undo.push(op);
    if (this._undo.length > 99) this._undo.shift();
  }

  private _restoreAfterAdd(op: AddLayerUndo): void {
    const keys = [...this._bricks.keys()];
    for (const key of keys) {
      const [x, y, z] = key.split(',').map(Number);
      if (z >= op.depth) this._writeCell(x, y, z, null, false);
    }
    this._map.depth = op.depth;
    this._layer = Math.max(0, Math.min(op.layer, op.depth - 1));
    this._syncEdit();
  }

  private _restoreLayer(layer: number, removed: readonly UgcBrick[]): void {
    this._map.depth += 1;
    const moving: UgcBrick[] = [];
    this._bricks.forEach((token, key) => {
      const [x, y, z] = key.split(',').map(Number);
      if (z >= layer) moving.push({ x, y, z, token });
    });
    moving.sort((a, b) => b.z - a.z);
    for (const b of moving) this._writeCell(b.x, b.y, b.z, null, false);
    for (const b of moving) this._writeCell(b.x, b.y, b.z + 1, cellPaint(b.token, b.voxelId), false);
    for (const b of removed) this._writeCell(b.x, b.y, b.z, cellPaint(b.token, b.voxelId), false);
    this._layer = layer;
    this._syncEdit();
  }

  private _writeCell(x: number, y: number, z: number, paint: CellPaint | null, record: boolean): void {
    if (x < 0 || y < 0 || z < 0 || x >= this._map.cols || y >= this._map.rows || z >= this._map.depth) return;
    const key = cellKey(x, y, z);
    const before = this._bricks.get(key) ?? null;
    if (samePaint(before, paint)) return;
    if (record) this._pushUndo({ kind: 'cell', x, y, z, before, after: paint });
    const old = this._nodes.get(key);
    if (old?.isValid) {
      old.removeFromParent();
      old.destroy();
    }
    this._nodes.delete(key);
    this._bricks.delete(key);
    if (!paint) return;
    const pf = this._blockPfs.get(paint.token) ?? this._blockPfs.get('o');
    if (!pf || !this._wall) return;
    this._voxelPos(x, y, z, _tmp);
    const n = spawn(pf, this._wall, `Blk_${paint.token}_${x}_${y}_${z}`, _tmp);
    const cell = n.getComponent(BlockCell) ?? n.addComponent(BlockCell);
    cell.syncFromName();
    cell.colorId = parseColorToken(paint.token);
    cell.voxelId = paint.voxelId;
    paintVoxelId(n, paint.voxelId);
    this._nodes.set(key, n);
    this._bricks.set(key, paint);
    n.active = this._showAll || z === this._layer;
  }

  private _applyLayerVis(): void {
    this._nodes.forEach((node, key) => {
      if (!node?.isValid) return;
      const z = Number(key.split(',')[2]);
      node.active = this._showAll || z === this._layer;
    });
    this._syncGhosts();
  }

  private _syncGhosts(): void {
    if (this._ghosts?.isValid) this._ghosts.active = !this._showAll;
  }

  private _rebuildGhosts(): void {
    const root = this._ghosts;
    if (!root) return;
    root.removeAllChildren();
    this._syncGhosts();
    if (this._showAll) return;
    const { mesh, edge, layerFill, layerEdge } = ghostLook();
    if (!mesh) return;
    const cols = this._map.cols;
    const rows = this._map.rows;
    const depth = this._map.depth;
    const step = PLAY.blockStep;
    this._voxelPos(0, 0, 0, _tmp);
    const x0 = _tmp.x;
    const y0 = _tmp.y;
    const z0 = _tmp.z;
    this._voxelPos(cols - 1, rows - 1, depth - 1, _tmp);
    const cx = (x0 + _tmp.x) * 0.5;
    const cy = (y0 + _tmp.y) * 0.5;
    const cz = (z0 + _tmp.z) * 0.5;
    const sx = Math.abs(_tmp.x - x0) + step;
    const sy = Math.abs(_tmp.y - y0) + step;
    const sz = Math.abs(_tmp.z - z0) + step;
    this._addGuideEdges(root, 'Vol', mesh, edge, cx, cy, cz, sx, sy, sz);
    this._voxelPos(0, 0, this._layer, _tmp);
    const lz = _tmp.z;
    const thick = Math.max(0.03, step * 0.18);
    this._addGuideBox(root, 'Layer', mesh, layerFill, cx, cy, lz, sx, sy, thick);
    this._addGuideEdges(root, 'Lay', mesh, layerEdge, cx, cy, lz, sx, sy, thick);
    this._addGuideMarks(root, cols, rows);
  }

  private _addGuideBox(
    root: Node,
    name: string,
    mesh: Mesh,
    mat: Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ): void {
    const n = new Node(name);
    root.addChild(n);
    n.layer = Layers.Enum.DEFAULT;
    n.setPosition(x, y, z);
    n.setScale(sx, sy, sz);
    const mr = n.addComponent(MeshRenderer);
    mr.mesh = mesh;
    mr.setSharedMaterial(mat, 0);
    mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  }

  private _addGuideEdges(
    root: Node,
    tag: string,
    mesh: Mesh,
    mat: Material,
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
  ): void {
    const t = Math.max(0.012, PLAY.blockStep * 0.06);
    const hx = sx * 0.5;
    const hy = sy * 0.5;
    const hz = sz * 0.5;
    const segs: Array<readonly [number, number, number, number, number, number]> = [
      [0, hy, hz, sx, t, t], [0, -hy, hz, sx, t, t], [0, hy, -hz, sx, t, t], [0, -hy, -hz, sx, t, t],
      [hx, 0, hz, t, sy, t], [-hx, 0, hz, t, sy, t], [hx, 0, -hz, t, sy, t], [-hx, 0, -hz, t, sy, t],
      [hx, hy, 0, t, t, sz], [-hx, hy, 0, t, t, sz], [hx, -hy, 0, t, t, sz], [-hx, -hy, 0, t, t, sz],
    ];
    for (let i = 0; i < segs.length; i++) {
      const [ox, oy, oz, wx, wy, wz] = segs[i];
      this._addGuideBox(root, `${tag}_${i}`, mesh, mat, cx + ox, cy + oy, cz + oz, wx, wy, wz);
    }
  }

  private _addGuideMarks(root: Node, cols: number, rows: number): void {
    const marks = new Node('Marks');
    root.addChild(marks);
    marks.addComponent(RenderRoot2D);
    for (let x = 0; x < cols; x++) {
      this._voxelPos(x, -0.82, 0, _tmp);
      this._addGuideNum(marks, `C_${x}`, String(x + 1), _tmp);
    }
    for (let y = 0; y < rows; y++) {
      this._voxelPos(-0.82, y, 0, _tmp);
      this._addGuideNum(marks, `R_${y}`, String(y + 1), _tmp);
    }
  }

  private _addGuideNum(root: Node, name: string, text: string, pos: Vec3): void {
    const n = new Node(name);
    root.addChild(n);
    n.layer = Layers.Enum.UI_3D;
    n.setPosition(pos);
    n.setScale(0.0052, 0.0052, 0.0052);
    const ut = n.addComponent(UITransform);
    ut.setContentSize(48, 48);
    ut.hitTest = () => false;
    const lab = n.addComponent(Label);
    lab.string = text;
    lab.fontSize = 28;
    lab.lineHeight = 30;
    lab.isBold = false;
    lab.color = new Color(255, 255, 255, 230);
    lab.enableOutline = false;
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    lab.useSystemFont = true;
    lab.overflow = Label.Overflow.NONE;
  }

  private _faceMarks(): void {
    const marks = this._ghosts?.getChildByName('Marks');
    const cam = this._host.camera?.node;
    if (!marks?.isValid || !cam?.isValid) return;
    cam.getWorldPosition(_markAim);
    for (const n of marks.children) {
      if (!n.isValid) continue;
      n.lookAt(_markAim, Vec3.UNIT_Y);
      n.rotate(_markFlip);
    }
  }

  private _exportBricks(): UgcBrick[] {
    const out: UgcBrick[] = [];
    this._bricks.forEach((paint, key) => {
      const [x, y, z] = key.split(',').map(Number);
      out.push({ x, y, z, token: paint.token, voxelId: paint.voxelId });
    });
    return out;
  }

  private _markDirty(): void {
    this._dirty = true;
    this._map.bricks = this._exportBricks();
    this._host.onDirty?.();
  }

  private _bind(): void {
    this._unbind();
    input.on(Input.EventType.TOUCH_START, this._onTouchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
    input.on(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    input.on(Input.EventType.MOUSE_DOWN, this._onMouseDown, this);
    input.on(Input.EventType.MOUSE_MOVE, this._onMouseMove, this);
    input.on(Input.EventType.MOUSE_UP, this._onMouseUp, this);
    if (!this._tickBound) {
      director.on(Director.EVENT_BEFORE_UPDATE, this._tick, this);
      this._tickBound = true;
    }
  }

  private _unbind(): void {
    input.off(Input.EventType.TOUCH_START, this._onTouchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
    input.off(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    input.off(Input.EventType.MOUSE_DOWN, this._onMouseDown, this);
    input.off(Input.EventType.MOUSE_MOVE, this._onMouseMove, this);
    input.off(Input.EventType.MOUSE_UP, this._onMouseUp, this);
    if (this._tickBound) {
      director.off(Director.EVENT_BEFORE_UPDATE, this._tick, this);
      this._tickBound = false;
    }
  }

  private _onTouchStart(e: EventTouch): void {
    this._fromTouch = true;
    this._begin(e);
  }

  private _onTouchMove(e: EventTouch): void {
    this._move(e);
  }

  private _onTouchEnd(e: EventTouch): void {
    this._end(e);
    this._fromTouch = false;
  }

  private _onMouseDown(e: EventMouse): void {
    if (this._fromTouch || e.getButton() !== EventMouse.BUTTON_LEFT) return;
    this._begin(e);
  }

  private _onMouseMove(e: EventMouse): void {
    if (this._fromTouch) return;
    this._move(e);
  }

  private _onMouseUp(e: EventMouse): void {
    if (this._fromTouch) return;
    this._end(e);
  }

  private _begin(e: PointerEvt): void {
    if (!this.node.activeInHierarchy) return;
    const loc = e.getLocation();
    if (this._host.overUi(loc)) return;
    this._ptrDown = true;
    this._dragSpin = true;
    this._spinning = false;
    this._dragStartX = loc.x;
    this._dragStartY = loc.y;
    this._dragLastX = loc.x;
    this._dragLastY = loc.y;
  }

  private _move(e: PointerEvt): void {
    if (!this._dragSpin) return;
    const loc = e.getLocation();
    const dx = loc.x - this._dragLastX;
    const dy = loc.y - this._dragLastY;
    if (!this._spinning) {
      const ax = loc.x - this._dragStartX;
      const ay = loc.y - this._dragStartY;
      if (ax * ax + ay * ay < SPIN_THRESH_PX * SPIN_THRESH_PX) return;
      this._spinning = true;
    }
    const dt = Math.max(1 / 120, director.getDeltaTime());
    const k = GAME.wallSpinDragDeg * (Math.PI / 180);
    this._orbitRad(dx * k, -dy * k);
    this._spinVel = (dx * k) / dt;
    this._pitchVel = (-dy * k) / dt;
    this._dragLastX = loc.x;
    this._dragLastY = loc.y;
  }

  private _end(e: PointerEvt): void {
    if (!this._ptrDown) return;
    const spun = this._spinning;
    this._ptrDown = false;
    this._dragSpin = false;
    this._spinning = false;
    if (!spun) this._tap(e);
  }

  private _orbitRad(dYaw: number, dPitch: number): void {
    if (dYaw === 0 && dPitch === 0) return;
    const cam = this._host.camera.node;
    if (cam?.isValid) {
      cam.getWorldRotation(_camQ);
      Vec3.transformQuat(_camRight, Vec3.UNIT_X, _camQ);
      Vec3.transformQuat(_camUp, Vec3.UNIT_Y, _camQ);
    } else {
      _camRight.set(1, 0, 0);
      _camUp.set(0, 1, 0);
    }
    _spinAxis.set(
      _camUp.x * dYaw + _camRight.x * dPitch,
      _camUp.y * dYaw + _camRight.y * dPitch,
      _camUp.z * dYaw + _camRight.z * dPitch,
    );
    const ang = _spinAxis.length();
    if (ang < 1e-10) return;
    _spinAxis.multiplyScalar(1 / ang);
    Quat.fromAxisAngle(_spinDq, _spinAxis, ang);
    Quat.multiply(this._spinRot, _spinDq, this._spinRot);
    Quat.normalize(this._spinRot, this._spinRot);
  }

  private _tick = (): void => {
    if (!this.node.isValid || !this._field) return;
    const dt = director.getDeltaTime();
    if (!this._spinning) {
      this._orbitRad(this._spinVel * dt, this._pitchVel * dt);
      this._spinVel *= Math.exp(-SPIN_FRICTION * dt);
      this._pitchVel *= Math.exp(-SPIN_FRICTION * dt);
      if (Math.abs(this._spinVel) < 0.04) this._spinVel = 0;
      if (Math.abs(this._pitchVel) < 0.04) this._pitchVel = 0;
    }
    if (!Quat.equals(this._spinRot, this._posedRot)) {
      this._posedRot.set(this._spinRot);
      this._field.setRotation(this._spinRot);
    }
    this._faceMarks();
  };

  private _tap(e: PointerEvt): void {
    if (this._host.overUi(e.getLocation())) return;
    if (!this._aim(e)) return;
    const pal = this._pickPalette();
    if (pal != null) {
      this.setSwatch(pal);
      this._host.onDirty?.();
      gameAudio()?.playUiClick();
      return;
    }
    if (this._showAll) return;
    const brick = this._pickBrick();
    if (brick) {
      this._edit(brick.x, brick.y, brick.z, brick.paint);
      return;
    }
    if (this._tool === 'erase') return;
    const cell = this._pickLayerCell();
    if (!cell) return;
    this._edit(cell.x, cell.y, this._layer, null);
  }

  private _pickPalette(): number | null {
    let best: number | null = null;
    let bestT = 1e9;
    const half = 0.45;
    this._palette.forEach((n, voxelId) => {
      if (!n?.isValid || !n.active) return;
      n.inverseTransformPoint(_tmp, _rayO);
      Vec3.scaleAndAdd(_world, _rayO, _rayD, 80);
      n.inverseTransformPoint(_world, _world);
      _world.subtract(_tmp);
      _boxMin.set(-half, -half, -half);
      _boxMax.set(half, half, half);
      const t = rayHitsAabb(_tmp, _world, _boxMin, _boxMax, _hit);
      if (t < 0 || t >= bestT) return;
      bestT = t;
      best = voxelId;
    });
    return best;
  }

  private _edit(x: number, y: number, z: number, current: CellPaint | null): void {
    let next: CellPaint | null;
    if (this._tool === 'erase') next = null;
    else if (!current) next = this._swatch;
    else if (current.voxelId === this._swatch.voxelId) next = null;
    else next = this._swatch;
    if (samePaint(next, current)) return;
    this._writeCell(x, y, z, next, true);
    this._rebuildGhosts();
    this._markDirty();
    gameAudio()?.playUiClick();
  }

  private _aim(e: PointerEvt): boolean {
    const cam = this._host.camera;
    if (!cam) return false;
    const loc = e.getLocation();
    cam.screenPointToRay(loc.x, loc.y, _ray);
    _rayO.set(_ray.o);
    _rayD.set(_ray.d);
    return true;
  }

  private _pickBrick(): { x: number; y: number; z: number; paint: CellPaint } | null {
    let best: { x: number; y: number; z: number; paint: CellPaint } | null = null;
    let bestT = 1e9;
    const half = PLAY.blockSize * 0.5;
    this._nodes.forEach((n, key) => {
      if (!n?.isValid || !n.active) return;
      n.inverseTransformPoint(_tmp, _rayO);
      Vec3.scaleAndAdd(_world, _rayO, _rayD, 80);
      n.inverseTransformPoint(_world, _world);
      _world.subtract(_tmp);
      _boxMin.set(-half, -half, -half);
      _boxMax.set(half, half, half);
      const t = rayHitsAabb(_tmp, _world, _boxMin, _boxMax, _hit);
      if (t < 0 || t >= bestT) return;
      const [x, y, z] = key.split(',').map(Number);
      const paint = this._bricks.get(key);
      if (!paint) return;
      bestT = t;
      best = { x, y, z, paint };
    });
    return best;
  }

  private _pickLayerCell(): { x: number; y: number } | null {
    const field = this._field;
    if (!field) return null;
    field.inverseTransformPoint(_tmp, _rayO);
    Vec3.scaleAndAdd(_world, _rayO, _rayD, 80);
    field.inverseTransformPoint(_world, _world);
    _world.subtract(_tmp);
    const step = PLAY.blockStep;
    const originZ = GAME.worldCamLookAtZ + ((PLAY.wallDepth - 1) * step) / 2;
    const planeZ = originZ - this._layer * step - this._fieldCz;
    if (Math.abs(_world.z) < 1e-6) return null;
    const t = (planeZ - _tmp.z) / _world.z;
    if (t <= 0 || t > 80) return null;
    const lx = _tmp.x + _world.x * t;
    const ly = _tmp.y + _world.y * t;
    const originX = -((this._map.cols - 1) * step) / 2;
    const x = Math.round((lx - originX) / step);
    const y = Math.round((ly + this._fieldCy - PLAY.wallBaseY) / step);
    if (x < 0 || y < 0 || x >= this._map.cols || y >= this._map.rows) return null;
    return { x, y };
  }
}

function spawn(prefab: Prefab, parent: Node, name: string, pos: Vec3): Node {
  const n = instantiate(prefab);
  n.name = name;
  parent.addChild(n);
  n.setPosition(pos);
  return n;
}

