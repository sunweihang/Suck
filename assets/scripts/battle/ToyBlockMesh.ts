import { Color, EffectAsset, Layers, Mesh, MeshRenderer, Material, Node, Sprite, Vec3, assetManager, resources } from 'cc';
import { isFieldMat, registerFieldMat, releaseFieldNode } from './FieldSpin';

const GRAY_DIM = 0.76;
const GRAY_SPRITE = new Color(168, 168, 168, 255);
const _readC = new Color();

/** Editor MatOrange — builtin-standard with USE_INSTANCING on all 3 passes. */
const INSTANCED_LIT_UUID = '9d11aa10-0001-4a01-8001-000000000001';

let _instancedTmpl: Material | null = null;
let _instancedBoot: Promise<void> | null = null;

const INSTANCING_DEFINES = [
  { USE_INSTANCING: true },
  { USE_INSTANCING: true },
  { USE_INSTANCING: true },
];

export function preloadInstancedLit(): Promise<void> {
  if (_instancedTmpl) return Promise.resolve();
  if (_instancedBoot) return _instancedBoot;
  _instancedBoot = new Promise((resolve) => {
    assetManager.loadAny({ uuid: INSTANCED_LIT_UUID }, (err, asset) => {
      if (!err && asset) _instancedTmpl = asset as Material;
      resolve();
    });
  });
  return _instancedBoot;
}

function bindLitProps(
  mat: Material,
  color: Color,
  roughness: number,
  metallic: number,
  emit: number,
  brickLit: boolean,
): void {
  mat.setProperty('mainColor', color);
  mat.setProperty('emissive', color);
  mat.setProperty('roughness', roughness);
  mat.setProperty('metallic', metallic);
  if (brickLit) mat.setProperty('emit', emit);
  else mat.setProperty('emissiveScale', new Vec3(emit, emit, emit));
}

function makeStandardLit(
  color: Color,
  roughness: number,
  metallic: number,
  emit: number,
): Material {
  const mat = new Material();
  if (_instancedTmpl?.effectAsset) mat.copy(_instancedTmpl);
  else {
    mat.initialize({
      effectName: 'builtin-standard',
      defines: INSTANCING_DEFINES,
    });
  }
  bindLitProps(mat, color, roughness, metallic, emit, false);
  return mat;
}

/** One-pass key-light / ambient / GGX. Turrets, bricks, and props share this. */
export function makeInstancedLit(
  color: Color,
  roughness: number,
  metallic: number,
  emit: number,
): Material {
  if (_brickFx) {
    const mat = new Material();
    try {
      mat.initialize({
        effectAsset: _brickFx,
        techniqueIndex: 0,
        defines: [{ USE_INSTANCING: true }],
      });
    } catch {
      return makeStandardLit(color, roughness, metallic, emit);
    }
    if (mat.passes?.length) {
      bindLitProps(mat, color, roughness, metallic, emit, true);
      return mat;
    }
  }
  return makeStandardLit(color, roughness, metallic, emit);
}

const BRICK_LIT = 'fx/brick-lit';
let _brickFx: EffectAsset | null = null;
let _brickBoot: Promise<void> | null = null;

export function preloadBrickLit(): Promise<void> {
  if (_brickFx) return Promise.resolve();
  if (_brickBoot) return _brickBoot;
  _brickBoot = new Promise((resolve) => {
    const done = (err: Error | null, asset: EffectAsset): void => {
      if (!err && asset) _brickFx = asset;
      resolve();
    };
    const bundle = assetManager.getBundle('resources');
    if (bundle) bundle.load(BRICK_LIT, EffectAsset, done);
    else resources.load(BRICK_LIT, EffectAsset, done);
  });
  return _brickBoot;
}

export function makeInstancedUnlit(color: Color): Material {
  return makeInstancedLit(color, 0.34, 0.04, 0.04);
}

/** Same look as makeInstancedLit, but the GPU applies field spin. */
export function makeFieldLit(
  color: Color,
  roughness: number,
  metallic: number,
  emit: number,
): Material {
  return registerFieldMat(makeInstancedLit(color, roughness, metallic, emit));
}

export function makeFieldUnlit(color: Color): Material {
  return makeFieldLit(color, 0.34, 0.04, 0.04);
}

const _fieldLitCache = new Map<string, Material>();

/**
 * Field material reused across props with the same look. Every distinct field
 * material is re-uniformed twice per frame while the wall spins and sits in its
 * own draw batch, so props must never mint one per instance.
 */
export function cachedFieldLit(
  color: Color,
  roughness: number,
  metallic: number,
  emit: number,
): Material {
  const key = `${color.r}|${color.g}|${color.b}|${color.a}|${roughness}|${metallic}|${emit}`;
  const hit = _fieldLitCache.get(key);
  if (hit?.passes?.length && hit.passes[0].descriptorSet) return hit;
  const mat = makeFieldLit(new Color(color.r, color.g, color.b, color.a), roughness, metallic, emit);
  _fieldLitCache.set(key, mat);
  return mat;
}

const _freeOf = new WeakMap<Material, Material>();

function freeTwin(fieldMat: Material): Material {
  let free = _freeOf.get(fieldMat);
  if (free?.passes?.length) return free;
  const main = readColor(fieldMat.getProperty('mainColor'), _readC);
  const color = main ?? new Color(255, 255, 255, 255);
  const rough = fieldMat.getProperty('roughness');
  const metal = fieldMat.getProperty('metallic');
  const emit = fieldMat.getProperty('emit');
  free = makeInstancedLit(
    color,
    typeof rough === 'number' ? rough : 0.34,
    typeof metal === 'number' ? metal : 0.04,
    typeof emit === 'number' ? emit : 0.04,
  );
  _freeOf.set(fieldMat, free);
  return free;
}

function releaseFieldMaterials(node: Node): void {
  const mrs = node.getComponentsInChildren(MeshRenderer);
  for (let i = 0; i < mrs.length; i++) {
    const mr = mrs[i];
    const mat = mr.getSharedMaterial(0);
    if (!isFieldMat(mat)) continue;
    const on = mr.enabled;
    mr.enabled = false;
    mr.setSharedMaterial(freeTwin(mat), 0);
    mr.enabled = on;
  }
}

/** Bake visual spin into the node and drop the GPU spin so the brick can fly. */
export function releaseFieldBrick(node: Node): void {
  releaseFieldNode(node, releaseFieldMaterials);
}

/** Tint a live instance. Ghost still pokes roughness and emit. */
export function tintLitInstance(
  mat: Material,
  color: Color,
  roughness: number,
  metallic: number,
  emit: number,
): void {
  bindLitProps(mat, color, roughness, metallic, emit, mat.effectAsset === _brickFx);
}

function readColor(v: unknown, out: Color): Color | null {
  if (!v) return null;
  if (v instanceof Color) {
    out.set(v.r, v.g, v.b, v.a);
    return out;
  }
  const c = v as { r?: number; g?: number; b?: number; a?: number; x?: number; y?: number; z?: number; w?: number };
  if (typeof c.r === 'number' && typeof c.g === 'number' && typeof c.b === 'number') {
    const a = typeof c.a === 'number' ? c.a : 255;
    if (c.r <= 1 && c.g <= 1 && c.b <= 1 && a <= 1) {
      out.set(Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), Math.round(a * 255));
    } else {
      out.set(c.r, c.g, c.b, a);
    }
    return out;
  }
  if (typeof c.x === 'number' && typeof c.y === 'number' && typeof c.z === 'number') {
    out.set(Math.round(c.x * 255), Math.round(c.y * 255), Math.round(c.z * 255), Math.round((c.w ?? 1) * 255));
    return out;
  }
  return null;
}

const _grayMats = new Map<Material, Material>();
const _saved = new WeakMap<MeshRenderer, Material | null>();
const _parts = new WeakMap<Node, { mr: MeshRenderer[]; sp: Sprite[] }>();

function partsOf(node: Node): { mr: MeshRenderer[]; sp: Sprite[] } {
  let parts = _parts.get(node);
  if (parts) return parts;
  const mrs = node.getComponentsInChildren(MeshRenderer);
  const mr: MeshRenderer[] = [];
  for (let i = 0; i < mrs.length; i++) {
    const name = mrs[i].node.name;
    if (name === 'HoldRim' || name.startsWith('Lock')) continue;
    mr.push(mrs[i]);
  }
  parts = { mr, sp: node.getComponentsInChildren(Sprite) };
  _parts.set(node, parts);
  return parts;
}

function grayMat(src: Material): Material {
  let g = _grayMats.get(src);
  if (g) return g;
  const main = readColor(src.getProperty('mainColor'), _readC);
  const y = main
    ? Math.round(((main.r * 299 + main.g * 587 + main.b * 114) / 1000) * GRAY_DIM)
    : 168;
  const a = main?.a ?? 255;
  g = isFieldMat(src) ? makeFieldUnlit(new Color(y, y, y, a)) : makeInstancedUnlit(new Color(y, y, y, a));
  _grayMats.set(src, g);
  return g;
}

/** Desaturate a brick (and its nail / bomb parts) while an iron plate still blocks it. */
export function applyBrickGray(node: Node, on: boolean): void {
  const parts = partsOf(node);
  const mrs = parts.mr;
  for (let i = 0; i < mrs.length; i++) {
    const mr = mrs[i];
    if (on) {
      if (!_saved.has(mr)) _saved.set(mr, mr.getSharedMaterial(0));
      const src = _saved.get(mr);
      if (src) mr.setSharedMaterial(grayMat(src), 0);
    } else {
      const src = _saved.get(mr);
      if (src) {
        mr.setSharedMaterial(src, 0);
        _saved.delete(mr);
      }
    }
  }
  const sps = parts.sp;
  for (let i = 0; i < sps.length; i++) {
    sps[i].color = on ? GRAY_SPRITE : Color.WHITE;
  }
}

const SKIP_BRICK_DRAW = /^(Chip_|Trail_|Hit_|Muzzle_)/;
/** Off-camera user layer so buried bricks leave the instance buffer without tearing the batch. */
const BURIED_LAYER = 1 << 19;

function setDrawnLayer(node: Node, layer: number): void {
  if (SKIP_BRICK_DRAW.test(node.name)) return;
  node.layer = layer;
  const kids = node.children;
  for (let i = 0; i < kids.length; i++) setDrawnLayer(kids[i], layer);
}

const FIELD_CULL = 18;

export function inflateFieldCull(mesh: Mesh | null | undefined): void {
  const min = mesh?.struct?.minPosition;
  const max = mesh?.struct?.maxPosition;
  if (!min || !max || min.x <= -FIELD_CULL) return;
  min.set(-FIELD_CULL, -FIELD_CULL, -FIELD_CULL);
  max.set(FIELD_CULL, FIELD_CULL, FIELD_CULL);
}

/** Hide buried bricks from the play camera without disabling MeshRenderer. */
export function setBrickMeshEnabled(node: Node, on: boolean): void {
  if (!node?.isValid) return;
  setDrawnLayer(node, on ? Layers.Enum.DEFAULT : BURIED_LAYER);
}

/** Rebind mesh + material after reparent / pool reuse so a dead GPU descriptor cannot stick. */
export function wakeBrickMesh(node: Node): void {
  if (!node?.isValid) return;
  const mrs = node.getComponentsInChildren(MeshRenderer);
  for (let i = 0; i < mrs.length; i++) {
    const mr = mrs[i];
    if (!mr.mesh || SKIP_BRICK_DRAW.test(mr.node.name)) continue;
    const mat = mr.getSharedMaterial(0);
    mr.enabled = false;
    if (mat?.passes?.length) mr.setSharedMaterial(mat, 0);
    mr.mesh = mr.mesh;
    mr.enabled = true;
  }
}

export function applyMesh(
  mr: MeshRenderer | null,
  mesh: Mesh | null,
  mat: Material | null,
): boolean {
  if (!mr) return false;
  if (!mesh || !mat?.passes?.length) {
    mr.enabled = false;
    return false;
  }
  mr.enabled = false;
  mr.setSharedMaterial(mat, 0);
  mr.mesh = mesh;
  if (isFieldMat(mat)) {
    inflateFieldCull(mesh);
    mr.mesh = mesh;
  }
  mr.enabled = true;
  return true;
}

export function applyShadowReceiver(node: { getComponent: (t: typeof MeshRenderer) => MeshRenderer | null }): void {
  const mr = node.getComponent(MeshRenderer);
  if (!mr) return;
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.ON;
}

const SKIP_CAST = /^(Eye|Pupil|Highlight|Power|D\d|N\d|Lock|Hold|Trail|Chain|Text|BombTrim|Outline|BlobShadow)/;

/** Original VoxelModelBuilder.DisableShadows — cubes do not cast long shadows. */
export function applyBrickPlastic(node: Node): void {
  applyToyCaster(node, false, false);
}

export function applyToyCaster(node: Node, receive = false, cast = false): void {
  const mrs = node.getComponentsInChildren(MeshRenderer);
  for (let i = 0; i < mrs.length; i++) {
    const mr = mrs[i];
    const on = cast && !SKIP_CAST.test(mr.node.name);
    mr.shadowCastingMode = on
      ? MeshRenderer.ShadowCastingMode.ON
      : MeshRenderer.ShadowCastingMode.OFF;
    mr.shadowReceivingMode = receive
      ? MeshRenderer.ShadowReceivingMode.ON
      : MeshRenderer.ShadowReceivingMode.OFF;
  }
}
