import { assetManager, CCObject, Color, EffectAsset, Material, MeshRenderer, Node, gfx, resources } from 'cc';

const SKIP = /^(Outline|Crease|BlobShadow|Power|Mouth|Eye|Pupil|Highlight|D\d|N\d|Lock|Hold|Trail|Chain|Text|BombTrim|Art)/;
const FX_OUTLINE = 'fx/toy-outline';
/** ~4px TCP2 hairline at play-camera FOV — reference left panel. */
const STROKE = 0.0055;
const HULL = 1.035;

function alive(n: Node | null | undefined): n is Node {
  return !!n?.isValid && !(n._objFlags & CCObject.Flags.Destroying);
}

function usable(mat: Material | null | undefined): mat is Material {
  return !!mat?.passes?.length && !!mat.passes[0].descriptorSet;
}

const _ink = new Map<string, Material>();
let _outlineFx: EffectAsset | null = null;
let _outlineBoot: Promise<void> | null = null;

function colorOf(v: unknown): Color | null {
  if (!v) return null;
  if (v instanceof Color) return v.clone();
  const c = v as { r?: number; g?: number; b?: number; a?: number };
  if (typeof c.r !== 'number' || typeof c.g !== 'number' || typeof c.b !== 'number') return null;
  const a = typeof c.a === 'number' ? c.a : 255;
  if (c.r <= 1 && c.g <= 1 && c.b <= 1 && a <= 1) {
    return new Color(Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), Math.round(a * 255));
  }
  return new Color(c.r, c.g, c.b, a);
}

/** Hue-darkened ink — same family as base color, not a black shell. */
function darkOf(c: Color): Color {
  return new Color(
    Math.max(32, Math.round(c.r * 0.52)),
    Math.max(26, Math.round(c.g * 0.42)),
    Math.max(24, Math.round(c.b * 0.36)),
    255,
  );
}

export function preloadToyOutline(): Promise<void> {
  if (_outlineFx) return Promise.resolve();
  if (_outlineBoot) return _outlineBoot;
  _outlineBoot = new Promise((resolve) => {
    const done = (err: Error | null, asset: EffectAsset): void => {
      if (!err && asset) _outlineFx = asset;
      resolve();
    };
    const bundle = assetManager.getBundle('resources');
    if (bundle) bundle.load(FX_OUTLINE, EffectAsset, done);
    else resources.load(FX_OUTLINE, EffectAsset, done);
  });
  return _outlineBoot;
}

function strokeMat(ink: Color): Material | null {
  const key = `${ink.r},${ink.g},${ink.b}`;
  const hit = _ink.get(key);
  if (usable(hit)) return hit;
  const mat = new Material();
  if (_outlineFx) {
    try {
      mat.initialize({ effectAsset: _outlineFx, techniqueIndex: 0 });
    } catch {
      /* fall back to inverted unlit hull */
    }
  }
  if (usable(mat)) {
    mat.setProperty('outlineColor', ink);
    mat.setProperty('outlineWidth', STROKE);
    _ink.set(key, mat);
    return mat;
  }
  mat.initialize({
    effectName: 'builtin-unlit',
    technique: 0,
    states: {
      rasterizerState: { cullMode: gfx.CullMode.FRONT },
      depthStencilState: {
        depthTest: true,
        depthWrite: false,
        depthFunc: gfx.ComparisonFunc.LESS_EQUAL,
      },
    },
  });
  if (!usable(mat)) return null;
  mat.setProperty('mainColor', ink);
  _ink.set(key, mat);
  return mat;
}

function bodyOf(root: Node): Node | null {
  if (root.name === 'Body') return root;
  return root.getChildByName('Body') ?? root.getChildByName('Rig')?.getChildByName('Body') ?? null;
}

function sourceOf(root: Node): MeshRenderer | null {
  const body = bodyOf(root);
  const bodyMr = body?.getComponent(MeshRenderer);
  if (bodyMr?.mesh && bodyMr.enabled) return bodyMr;
  for (const mr of root.getComponentsInChildren(MeshRenderer)) {
    if (SKIP.test(mr.node.name) || !mr.mesh || !mr.enabled) continue;
    return mr;
  }
  return null;
}

function sleep(node: Node | null | undefined): void {
  if (!alive(node)) return;
  const mr = node.getComponent(MeshRenderer);
  if (mr) mr.enabled = false;
  node.active = false;
}

function outlineNodeOf(root: Node): Node | null {
  const src = sourceOf(root);
  const underSrc = src?.node.getChildByName('Outline');
  if (alive(underSrc)) return underSrc;
  const underBody = bodyOf(root)?.getChildByName('Outline');
  if (alive(underBody)) return underBody;
  const underRoot = root.getChildByName('Outline');
  return alive(underRoot) ? underRoot : null;
}

function setToyOutlineVisible(root: Node, on: boolean): void {
  const node = outlineNodeOf(root);
  if (!node) return;
  const mr = node.getComponent(MeshRenderer);
  if (mr) mr.enabled = on;
  node.active = on;
}

/** Hairline hue-matched TCP2 stroke — screen-space only, no fat hull. */
export function applyToyOutline(root: Node, visible = true): void {
  if (!alive(root)) return;
  for (const mr of root.getComponentsInChildren(MeshRenderer)) {
    if (mr.node.name === 'Crease' || (mr.node.name === 'Outline' && mr.node.parent !== bodyOf(root))) {
      sleep(mr.node);
    }
  }
  if (!visible) {
    setToyOutlineVisible(root, false);
    return;
  }
  const src = sourceOf(root);
  if (!src?.mesh || !alive(src.node)) return;
  const mat = strokeMat(darkOf(colorOf(src.getSharedMaterial(0)?.getProperty('mainColor')) ?? new Color(40, 32, 28)));
  if (!mat) return;

  let node = src.node.getChildByName('Outline');
  if (!alive(node)) {
    node = new Node('Outline');
    src.node.addChild(node);
  }
  node.layer = src.node.layer;
  node.active = true;
  const extruded = !!_outlineFx && mat.effectAsset === _outlineFx;
  node.setScale(extruded ? 1 : HULL, extruded ? 1 : HULL, extruded ? 1 : HULL);
  const mr = node.getComponent(MeshRenderer) ?? node.addComponent(MeshRenderer);
  mr.mesh = src.mesh;
  mr.setSharedMaterial(mat, 0);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  mr.priority = src.priority + 1;
  mr.enabled = true;
}

export function clearBlobShadow(host: Node): void {
  const node = host.getChildByName('BlobShadow') ?? host.getChildByName('Rig')?.getChildByName('BlobShadow');
  if (!alive(node)) return;
  const mr = node.getComponent(MeshRenderer);
  if (mr) mr.enabled = false;
  node.active = false;
}

/** Fake decal shadows are gone — realtime maps do the work. */
export function applyBlobShadow(host: Node): void {
  clearBlobShadow(host);
}
