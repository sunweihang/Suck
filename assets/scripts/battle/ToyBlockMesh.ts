import { Color, Mesh, MeshRenderer, Material, Node, Sprite, Vec3 } from 'cc';

const GRAY_DIM = 0.76;
const GRAY_SPRITE = new Color(168, 168, 168, 255);
const EMIT_OFF = new Vec3(0.02, 0.02, 0.02);

function colorOf(v: unknown): Color | null {
  if (!v) return null;
  if (v instanceof Color) return v.clone();
  const c = v as { r?: number; g?: number; b?: number; a?: number; x?: number; y?: number; z?: number; w?: number };
  if (typeof c.r === 'number' && typeof c.g === 'number' && typeof c.b === 'number') {
    const a = typeof c.a === 'number' ? c.a : 255;
    if (c.r <= 1 && c.g <= 1 && c.b <= 1 && a <= 1) {
      return new Color(Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), Math.round(a * 255));
    }
    return new Color(c.r, c.g, c.b, a);
  }
  if (typeof c.x === 'number' && typeof c.y === 'number' && typeof c.z === 'number') {
    return new Color(Math.round(c.x * 255), Math.round(c.y * 255), Math.round(c.z * 255), Math.round((c.w ?? 1) * 255));
  }
  return null;
}

function grayOf(c: Color): Color {
  const y = Math.round(((c.r * 299 + c.g * 587 + c.b * 114) / 1000) * GRAY_DIM);
  return new Color(y, y, y, c.a);
}

type SavedLook = { main: Color; emit: Color | null; emitScale: Vec3 | null };

const _saved = new WeakMap<MeshRenderer, SavedLook>();

function vec3Of(v: unknown): Vec3 | null {
  if (!v) return null;
  if (v instanceof Vec3) return v.clone();
  const t = v as { x?: number; y?: number; z?: number };
  if (typeof t.x === 'number' && typeof t.y === 'number' && typeof t.z === 'number') {
    return new Vec3(t.x, t.y, t.z);
  }
  return null;
}

/** Desaturate a brick (and its nail / bomb parts) while an iron plate still blocks it. */
export function applyBrickGray(node: Node, on: boolean): void {
  for (const mr of node.getComponentsInChildren(MeshRenderer)) {
    if (mr.node.name === 'HoldRim' || mr.node.name.startsWith('Lock')) continue;
    const inst = mr.getMaterialInstance(0);
    if (!inst) continue;
    if (on) {
      if (!_saved.has(mr)) {
        const shared = mr.getSharedMaterial(0);
        _saved.set(mr, {
          main: colorOf(shared?.getProperty('mainColor') ?? inst.getProperty('mainColor'))
            ?? new Color(180, 180, 180),
          emit: colorOf(shared?.getProperty('emissive') ?? inst.getProperty('emissive')),
          emitScale: vec3Of(shared?.getProperty('emissiveScale') ?? inst.getProperty('emissiveScale')),
        });
      }
      const orig = _saved.get(mr)!;
      inst.setProperty('mainColor', grayOf(orig.main));
      if (orig.emit) inst.setProperty('emissive', grayOf(orig.emit));
      inst.setProperty('emissiveScale', EMIT_OFF);
    } else {
      const orig = _saved.get(mr);
      if (orig) {
        inst.setProperty('mainColor', orig.main);
        if (orig.emit) inst.setProperty('emissive', orig.emit);
        if (orig.emitScale) inst.setProperty('emissiveScale', orig.emitScale);
        _saved.delete(mr);
      }
    }
  }
  for (const sp of node.getComponentsInChildren(Sprite)) {
    sp.color = on ? GRAY_SPRITE : Color.WHITE;
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

export function applyToyCaster(node: Node, receive = false, cast = true): void {
  for (const mr of node.getComponentsInChildren(MeshRenderer)) {
    const on = cast && !SKIP_CAST.test(mr.node.name);
    mr.shadowCastingMode = on
      ? MeshRenderer.ShadowCastingMode.ON
      : MeshRenderer.ShadowCastingMode.OFF;
    mr.shadowReceivingMode = receive
      ? MeshRenderer.ShadowReceivingMode.ON
      : MeshRenderer.ShadowReceivingMode.OFF;
  }
}
