import { Color, Layers, Mesh, MeshRenderer, Material, Node, Sprite, Vec3 } from 'cc';

const GRAY_DIM = 0.76;
const GRAY_SPRITE = new Color(168, 168, 168, 255);
const EMIT_OFF = new Vec3(0.02, 0.02, 0.02);
const _readC = new Color();

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
  g = new Material();
  g.initialize({ effectName: 'builtin-standard' });
  const main = readColor(src.getProperty('mainColor'), _readC);
  const y = main
    ? Math.round(((main.r * 299 + main.g * 587 + main.b * 114) / 1000) * GRAY_DIM)
    : 168;
  const a = main?.a ?? 255;
  const gray = new Color(y, y, y, a);
  g.setProperty('mainColor', gray);
  const emit = readColor(src.getProperty('emissive'), _readC);
  if (emit) {
    const ey = Math.round(((emit.r * 299 + emit.g * 587 + emit.b * 114) / 1000) * GRAY_DIM);
    g.setProperty('emissive', new Color(ey, ey, ey, emit.a));
  }
  g.setProperty('emissiveScale', EMIT_OFF);
  const rough = src.getProperty('roughness');
  if (typeof rough === 'number') g.setProperty('roughness', rough);
  else g.setProperty('roughness', 0.34);
  const metal = src.getProperty('metallic');
  if (typeof metal === 'number') g.setProperty('metallic', metal);
  else g.setProperty('metallic', 0.04);
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
