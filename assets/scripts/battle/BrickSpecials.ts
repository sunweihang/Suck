import { Color, ImageAsset, Material, Mesh, MeshRenderer, Node, Texture2D, Vec4, resources } from 'cc';
import { ColorToken, PLAY, TOKEN_RGB } from '../game/GameConfig';
import { HIDDEN_QUEUE_AFTER_LEVEL } from '../game/LevelCatalog';
import { VoxelLook, lookOfRgb, lookOfVoxel } from '../game/VoxelPalette';
import { applyPaintCan } from './PaintCan';
import { applyToyCaster, forgetBrickParts, inflateFieldCull, makeFieldLit, makeFieldUnlit, makeInstancedLit, makeInstancedTextured, preloadBrickLit, preloadInstancedLit } from './ToyBlockMesh';
import { getToyBall } from './ToySlotMesh';

const _mats = new Map<string, Material>();

function usable(mat: Material | null | undefined): mat is Material {
  return !!mat?.passes?.length && !!mat.passes[0].descriptorSet;
}

function glossy(key: string, color: Color, roughness: number, emit: number): Material {
  const hit = _mats.get(key);
  if (usable(hit)) return hit;
  const mat = makeInstancedLit(color, roughness, 0, emit);
  _mats.set(key, mat);
  return mat;
}

function fieldGlossy(key: string, color: Color, roughness: number, emit: number): Material {
  const hit = _mats.get(key);
  if (usable(hit)) return hit;
  const mat = makeFieldLit(color, roughness, 0, emit);
  _mats.set(key, mat);
  return mat;
}

const _rgbColors = new Map<string, Color>();

function colorOf(rgb: readonly [number, number, number]): Color {
  const key = `${rgb[0]}-${rgb[1]}-${rgb[2]}`;
  let c = _rgbColors.get(key);
  if (c) return c;
  c = new Color(rgb[0], rgb[1], rgb[2], 255);
  _rgbColors.set(key, c);
  return c;
}

/** Official M_Pixel albedo on the one-pass brick light model. */
function brickMat(rgb: readonly [number, number, number]): Material {
  const key = `brick-u-${rgb[0]}-${rgb[1]}-${rgb[2]}`;
  const hit = _mats.get(key);
  if (usable(hit)) return hit;
  const mat = makeFieldUnlit(colorOf(rgb));
  _mats.set(key, mat);
  return mat;
}

function skipPaint(name: string): boolean {
  return (
    name === 'HoldRim'
    || name === 'Outline'
    || name === 'Crease'
    || name === 'BlobShadow'
    || name === 'Pad'
    || name === 'Power'
    || name === 'Bank'
    || name === 'Text'
    || name.startsWith('Paint')
    || name.startsWith('Magnet')
    || name.startsWith('Lock')
    || /^[DN]\d$/.test(name)
  );
}

function part(root: Node, name: string): Node {
  let n = root.getChildByName(name);
  if (!n) {
    n = new Node(name);
    root.addChild(n);
    n.layer = root.layer;
    n.addComponent(MeshRenderer);
  }
  n.active = true;
  return n;
}

function blob(
  root: Node,
  name: string,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  mat: Material,
): void {
  const n = part(root, name);
  n.setPosition(x, y, z);
  n.setScale(sx, sy, sz);
  n.setRotationFromEuler(0, 0, 0);
  const mr = n.getComponent(MeshRenderer);
  const mesh = getToyBall();
  if (!mr || !mesh) return;
  mr.enabled = true;
  mr.mesh = mesh;
  mr.setSharedMaterial(mat, 0);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
}

function paintLookOn(mrs: MeshRenderer[], look: VoxelLook): void {
  const mat = brickMat(look.rgb);
  for (let i = 0; i < mrs.length; i++) {
    const mr = mrs[i];
    if (skipPaint(mr.node.name)) continue;
    const on = mr.enabled;
    mr.enabled = false;
    mr.setSharedMaterial(mat, 0);
    const mesh = mr.mesh;
    inflateFieldCull(mesh);
    if (mesh) mr.mesh = mesh;
    mr.enabled = on;
  }
}

function paintLook(root: Node, look: VoxelLook): void {
  paintLookOn(root.getComponentsInChildren(MeshRenderer), look);
}

export function paintMeshRenderers(mrs: MeshRenderer[], token: ColorToken): void {
  paintLookOn(mrs, lookOfRgb(PLAY.tints[token] ?? TOKEN_RGB[token] ?? TOKEN_RGB.y));
}

export function preloadVoxelLook(): Promise<void> {
  return Promise.all([preloadInstancedLit(), preloadBrickLit(), preloadHiddenPattern()]).then(() => undefined);
}

/** Recolor without material instances so same-color debris stay batched. */
export function paintNodeShared(root: Node, token: ColorToken): void {
  paintLook(root, lookOfRgb(PLAY.tints[token] ?? TOKEN_RGB[token] ?? TOKEN_RGB.y));
}

export function paintVoxelRgb(root: Node, rgb: readonly [number, number, number]): void {
  paintLook(root, lookOfRgb(rgb));
}

export function paintVoxelId(root: Node, colorId: number): void {
  paintLook(root, lookOfVoxel(colorId));
}

let _brickMesh: Mesh | null = null;

/** Every block prefab shares one cube, so one copy covers bricks built without a renderer. */
export function rememberBrickMesh(mesh: Mesh | null | undefined): boolean {
  if (mesh) _brickMesh = mesh;
  return !!_brickMesh;
}

/**
 * Boxed-in bricks are built as bare nodes — no renderer, no model in the render
 * scene. Digging one out is the first time it needs to draw.
 */
export function attachBrickRenderer(node: Node, colorId: number): boolean {
  if (!node?.isValid || !_brickMesh) return false;
  if (node.getComponent(MeshRenderer)) return true;
  const mat = brickMat(lookOfVoxel(colorId).rgb);
  inflateFieldCull(_brickMesh);
  // Assigning mesh tears down and rebuilds the model, so settle everything else first
  // and pay for exactly one rebuild.
  const mr = node.addComponent(MeshRenderer);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  mr.setSharedMaterial(mat, 0);
  mr.mesh = _brickMesh;
  forgetBrickParts(node);
  return true;
}

export function paintNodeColor(root: Node, token: ColorToken): void {
  paintLook(root, lookOfRgb(PLAY.tints[token] ?? TOKEN_RGB[token] ?? TOKEN_RGB.y));
}

function applySharedMat(root: Node, mat: Material): void {
  for (const mr of root.getComponentsInChildren(MeshRenderer)) {
    if (skipPaint(mr.node.name)) continue;
    const on = mr.enabled;
    mr.enabled = false;
    mr.setSharedMaterial(mat, 0);
    mr.enabled = on;
  }
}

export function paintUnitColor(root: Node, token: ColorToken): void {
  const rgb = PLAY.tints[token] ?? TOKEN_RGB[token] ?? TOKEN_RGB.y;
  applySharedMat(root, glossy(
    `unit-${rgb[0]}-${rgb[1]}-${rgb[2]}`,
    colorOf(rgb),
    0.62,
    0,
  ));
}

const HIDDEN_TEX = 'toys/hidden-pattern';
/** Original M_Shooter_Hidden._Color. */
const HIDDEN_TINT = new Color(161, 161, 161, 255);
const HIDDEN_RGB: readonly [number, number, number] = [89, 84, 82];
/** Original scroll is 0.4; game-speed reads too fast, keep a slow crawl. */
const HIDDEN_SCROLL = 0.08;
let _hiddenTex: Texture2D | null = null;
let _hiddenMat: Material | null = null;
let _hiddenBoot: Promise<void> | null = null;
let _hiddenUvX = 0;
let _hiddenUvY = 0;
const _hiddenTiling = new Vec4(1, -1, 0, 1);

/** Official levels after 30 may hide a few queued cubes with T_Hidden_Pattern. */
export function hideQueueColors(level = PLAY.levelId): boolean {
  return (level | 0) > HIDDEN_QUEUE_AFTER_LEVEL;
}

export type HiddenQueueTarget = {
  colorHidden: boolean;
  benchRank: number;
  refreshSeatLook: () => void;
};

/** 2–4 back cubes, or fewer when the bench is short. */
export function pickHiddenQueueCount(backN: number): number {
  if (backN <= 0) return 0;
  const max = Math.min(backN, 4);
  const min = Math.min(backN, backN <= 2 ? 1 : 2);
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Pick a fresh random subset of back-row cubes for this level. */
export function rollHiddenQueue(units: HiddenQueueTarget[]): void {
  for (let i = 0; i < units.length; i++) units[i].colorHidden = false;
  if (!hideQueueColors()) {
    for (let i = 0; i < units.length; i++) units[i].refreshSeatLook();
    return;
  }
  const back: HiddenQueueTarget[] = [];
  for (let i = 0; i < units.length; i++) {
    if (units[i].benchRank > 0) back.push(units[i]);
  }
  for (let i = back.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = back[i];
    back[i] = back[j];
    back[j] = tmp;
  }
  const n = pickHiddenQueueCount(back.length);
  for (let i = 0; i < n; i++) back[i].colorHidden = true;
  for (let i = 0; i < units.length; i++) units[i].refreshSeatLook();
}

function bindHiddenTex(tex: Texture2D): void {
  tex.setWrapMode(Texture2D.WrapMode.REPEAT, Texture2D.WrapMode.REPEAT);
  tex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  _hiddenTex = tex;
}

export function preloadHiddenPattern(): Promise<void> {
  if (_hiddenTex) return Promise.resolve();
  if (_hiddenBoot) return _hiddenBoot;
  _hiddenBoot = Promise.all([preloadBrickLit(), preloadInstancedLit()]).then(() => new Promise<void>((resolve) => {
    resources.load(HIDDEN_TEX, Texture2D, (err, tex) => {
      if (!err && tex) {
        bindHiddenTex(tex);
        resolve();
        return;
      }
      resources.load(HIDDEN_TEX, ImageAsset, (imgErr, img) => {
        if (!imgErr && img) {
          const made = new Texture2D();
          made.image = img;
          bindHiddenTex(made);
        }
        resolve();
      });
    });
  }));
  return _hiddenBoot;
}

function bindHiddenUv(mat: Material): void {
  _hiddenTiling.set(1, -1, _hiddenUvX, 1 - _hiddenUvY);
  try {
    mat.setProperty('tilingOffset', _hiddenTiling);
  } catch {
    /* builtin fallback */
  }
}

function hiddenMat(): Material {
  if (_hiddenMat && usable(_hiddenMat)) return _hiddenMat;
  if (_hiddenTex) {
    const mat = makeInstancedTextured(_hiddenTex, HIDDEN_TINT, 0.72, 0.04, 0);
    bindHiddenUv(mat);
    _hiddenMat = mat;
    _mats.set('unit-hidden', mat);
    return mat;
  }
  const key = `unit-${HIDDEN_RGB[0]}-${HIDDEN_RGB[1]}-${HIDDEN_RGB[2]}`;
  const hit = _mats.get(key);
  if (usable(hit)) return hit;
  const mat = glossy(key, colorOf(HIDDEN_RGB), 0.72, 0);
  _mats.set(key, mat);
  return mat;
}

/** Original Toony Colors Pro _ScrollTexture at 0.4 / 0.4. */
export function tickHiddenPattern(dt: number): void {
  if (!_hiddenMat || !usable(_hiddenMat)) return;
  _hiddenUvX = (_hiddenUvX + HIDDEN_SCROLL * dt) % 1;
  _hiddenUvY = (_hiddenUvY + HIDDEN_SCROLL * dt) % 1;
  bindHiddenUv(_hiddenMat);
}

/** Original Shooter_Hidden albedo: T_Hidden_Pattern, no real color. */
export function paintHiddenPattern(root: Node): void {
  applySharedMat(root, hiddenMat());
}

export function paintQueueBlock(root: Node, token: ColorToken, hidden = false): void {
  if (hidden) paintHiddenPattern(root);
  else paintUnitColor(root, token);
}

function rgbFromMat(mr: MeshRenderer): readonly [number, number, number] | null {
  const raw = mr.getSharedMaterial(0)?.getProperty('mainColor') as
    | { r?: number; g?: number; b?: number }
    | undefined;
  if (typeof raw?.r !== 'number' || typeof raw.g !== 'number' || typeof raw.b !== 'number') return null;
  const unit = raw.r <= 1 && raw.g <= 1 && raw.b <= 1;
  return [
    Math.round(unit ? raw.r * 255 : raw.r),
    Math.round(unit ? raw.g * 255 : raw.g),
    Math.round(unit ? raw.b * 255 : raw.b),
  ];
}

/** The RGB the player sees on a painted turret / brick. Prefer the Body mesh. */
export function readPaintRgb(root: Node): readonly [number, number, number] | null {
  const body = root.getChildByName('Body') ?? root.getChildByName('Rig')?.getChildByName('Body');
  const bodyMr = body?.getComponent(MeshRenderer);
  if (bodyMr) {
    const rgb = rgbFromMat(bodyMr);
    if (rgb) return rgb;
  }
  for (const mr of root.getComponentsInChildren(MeshRenderer)) {
    if (skipPaint(mr.node.name)) continue;
    const rgb = rgbFromMat(mr);
    if (rgb) return rgb;
  }
  return null;
}

export function applyPaintLook(root: Node, token: ColorToken = 'p'): void {
  applyPaintCan(root, token);
  applyToyCaster(root, false, false);
}

export function applyMagnetLook(root: Node): void {
  const steel = fieldGlossy('magnet-steel', new Color(72, 84, 104, 255), 0.22, 0.1);
  const red = fieldGlossy('magnet-red', new Color(220, 40, 48, 255), 0.2, 0.2);
  const blue = fieldGlossy('magnet-blue', new Color(48, 96, 220, 255), 0.2, 0.2);
  blob(root, 'MagnetArch', 0, 0.16, 0.52, 0.72, 0.55, 0.22, steel);
  blob(root, 'MagnetL', -0.22, -0.12, 0.54, 0.22, 0.38, 0.2, red);
  blob(root, 'MagnetR', 0.22, -0.12, 0.54, 0.22, 0.38, 0.2, blue);
  applyToyCaster(root, false, false);
}

function sandRgb(rgb: readonly [number, number, number]): readonly [number, number, number] {
  return [
    Math.min(255, Math.round(rgb[0] * 0.92 + 210 * 0.08)),
    Math.min(255, Math.round(rgb[1] * 0.88 + 150 * 0.08)),
    Math.min(255, Math.round(rgb[2] * 0.82 + 70 * 0.08)),
  ];
}

export function applySandLook(root: Node): void {
  const mrs = root.getComponentsInChildren(MeshRenderer);
  for (let i = 0; i < mrs.length; i++) {
    const mr = mrs[i];
    if (skipPaint(mr.node.name)) continue;
    const rgb = rgbFromMat(mr);
    if (!rgb) continue;
    const on = mr.enabled;
    mr.enabled = false;
    mr.setSharedMaterial(brickMat(sandRgb(rgb)), 0);
    inflateFieldCull(mr.mesh);
    mr.enabled = on;
  }
}

function ghostMat(rgb: readonly [number, number, number]): Material {
  const key = `ghost-${rgb[0]}-${rgb[1]}-${rgb[2]}`;
  const hit = _mats.get(key);
  if (usable(hit)) return hit;
  const mat = makeInstancedLit(colorOf(rgb), 0.12, 0, 0.3);
  _mats.set(key, mat);
  return mat;
}

export function applyGhostLook(root: Node): void {
  for (const mr of root.getComponentsInChildren(MeshRenderer)) {
    if (skipPaint(mr.node.name)) continue;
    const rgb = rgbFromMat(mr) ?? [220, 230, 240];
    const washed: readonly [number, number, number] = [
      Math.min(255, rgb[0] + 70),
      Math.min(255, rgb[1] + 80),
      Math.min(255, rgb[2] + 90),
    ];
    const on = mr.enabled;
    mr.enabled = false;
    mr.setSharedMaterial(ghostMat(washed), 0);
    mr.enabled = on;
  }
}
