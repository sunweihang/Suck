import {
  Color,
  ImageAsset,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Texture2D,
  Vec3,
  assetManager,
  gfx,
  resources,
  utils,
} from 'cc';
import { OCTO_POWER_LOCAL } from './ToyLook';

const DIGIT_W = 0.158;
const DIGIT_H = 0.214;
const FACE_EULER = new Vec3(-28, 0, 0);

const _mats: Array<Material | null> = Array.from({ length: 10 }, () => null);
let _quad: Mesh | null = null;
let _boot: Promise<void> | null = null;

function quad(): Mesh | null {
  if (_quad) return _quad;
  _quad = utils.MeshUtils.createMesh({
    positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 1, 1, 1, 0, 0, 1, 0],
    indices: [0, 1, 2, 1, 3, 2, 0, 2, 1, 1, 2, 3],
    minPos: new Vec3(-0.5, -0.5, 0),
    maxPos: new Vec3(0.5, 0.5, 0),
    boundingRadius: 0.75,
  });
  return _quad;
}

function texFromImage(img: ImageAsset): Texture2D {
  const tex = new Texture2D();
  tex.image = img;
  try {
    tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
    tex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  } catch {
    /* older engine */
  }
  return tex;
}

function makeMat(tex: Texture2D): Material {
  const mat = new Material();
  mat.initialize({
    effectName: 'builtin-unlit',
    technique: 0,
    defines: { USE_TEXTURE: true, USE_ALPHA_TEST: true },
    states: {
      rasterizerState: { cullMode: gfx.CullMode.NONE },
      depthStencilState: {
        depthTest: true,
        depthWrite: true,
        depthFunc: gfx.ComparisonFunc.LESS_EQUAL,
      },
    },
  });
  mat.setProperty('mainTexture', tex);
  mat.setProperty('mainColor', Color.WHITE);
  try {
    mat.setProperty('alphaThreshold', 0.18);
  } catch {
    /* older unlit */
  }
  return mat;
}

function loadDigit(d: number): Promise<Texture2D | null> {
  const uuid = `9d12cc10-030${d}-4a01-8001-00000000003${d}@6c48a`;
  return new Promise((resolve) => {
    resources.load(`toys/power-${d}`, ImageAsset, (err, img) => {
      if (!err && img) {
        resolve(texFromImage(img));
        return;
      }
      resources.load(`toys/power-${d}/texture`, Texture2D, (e2, tex) => {
        if (!e2 && tex) {
          resolve(tex);
          return;
        }
        assetManager.loadAny({ uuid }, (e3, asset) => {
          resolve(!e3 && asset ? (asset as Texture2D) : null);
        });
      });
    });
  });
}

export function preloadPowerDigits(): Promise<void> {
  if (_boot) return _boot;
  _boot = Promise.all(Array.from({ length: 10 }, (_, d) => loadDigit(d))).then((texs) => {
    for (let d = 0; d < 10; d++) {
      const tex = texs[d];
      if (!tex) continue;
      _mats[d] = makeMat(tex);
    }
  });
  return _boot;
}

function dress(slot: Node, mat: Material | null): void {
  let mr = slot.getComponent(MeshRenderer);
  if (!mr) mr = slot.addComponent(MeshRenderer);
  const mesh = quad();
  if (!mesh || !mat?.passes?.length) {
    mr.enabled = false;
    return;
  }
  mr.mesh = mesh;
  mr.setSharedMaterial(mat, 0);
  mr.enabled = true;
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
}

function ensureSlot(tag: Node, name: string): Node {
  let slot = tag.getChildByName(name);
  if (!slot) {
    slot = new Node(name);
    tag.addChild(slot);
  }
  slot.layer = tag.layer;
  slot.setScale(DIGIT_W, DIGIT_H, 1);
  slot.setRotationFromEuler(0, 0, 0);
  slot.setPosition(slot.position.x, slot.position.y, 0.03);
  return slot;
}

export function bindPowerMark(host: Node): Node {
  let tag = host.getChildByName('Power');
  if (!tag) {
    tag = new Node('Power');
    host.addChild(tag);
  }
  const bank = tag.getChildByName('Bank');
  if (bank) bank.active = false;
  const badge = tag.getChildByName('Badge');
  if (badge) badge.active = false;
  tag.layer = host.layer;
  tag.active = true;
  tag.setPosition(OCTO_POWER_LOCAL);
  tag.setRotationFromEuler(FACE_EULER.x, FACE_EULER.y, FACE_EULER.z);
  tag.setScale(1, 1, 1);
  for (let i = 0; i < 3; i++) {
    const slot = ensureSlot(tag, `D${i}`);
    dress(slot, _mats[0]);
    slot.active = i === 0;
  }
  return tag;
}

export function paintPowerMark(tag: Node | null, value: number): void {
  if (!tag?.isValid) return;
  const badge = tag.getChildByName('Badge');
  if (badge) badge.active = false;
  const text = String(Math.max(0, Math.round(value)));
  const n = Math.min(3, text.length);
  const span = n === 1 ? 0 : n === 2 ? 0.1 : 0.086;
  const start = -((n - 1) * span) / 2;
  for (let i = 0; i < 3; i++) {
    const slot = ensureSlot(tag, `D${i}`);
    if (i >= n) {
      slot.active = false;
      continue;
    }
    slot.setPosition(start + i * span, 0, 0.03);
    dress(slot, _mats[Number(text[i])]);
    slot.active = true;
  }
}
