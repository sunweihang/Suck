import {
  Camera,
  Color,
  EffectAsset,
  ImageAsset,
  Layers,
  Material,
  MeshRenderer,
  Node,
  Texture2D,
  Vec3,
  assetManager,
  gfx,
  resources,
  utils,
} from 'cc';
import { BENCH, PLAY, shooterStandZ } from '../game/GameConfig';
import { coverBackgroundSize, portraitVisibleSize } from '../game/PortraitFit';

const BG_IMAGE_UUID = '2dd19bfe-8cac-486f-9e72-ba1499869c97';
const ROOT_NAME = 'WorldBg';
const ART_NAME = 'SkyArt';
const MAIN_CAM = 'Main Camera';

function loadBgImage(): Promise<ImageAsset> {
  return new Promise((resolve, reject) => {
    assetManager.loadAny({ uuid: BG_IMAGE_UUID }, (err, asset) => {
      if (!err && asset) {
        resolve(asset as ImageAsset);
        return;
      }
      resources.load('ui/bg-play-q', ImageAsset, (e2, img) => {
        if (!e2 && img) resolve(img);
        else reject(e2 ?? err ?? new Error('bg-play-q missing'));
      });
    });
  });
}

function texFromImage(img: ImageAsset): Texture2D {
  const tex = new Texture2D();
  tex.image = img;
  try {
    tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
  } catch {
    /* older engine */
  }
  return tex;
}

function disposeNamed(host: Node | null | undefined, name: string): void {
  const n = host?.getChildByName(name);
  if (!n) return;
  n.removeFromParent();
  n.destroy();
}

function mainCamNode(scene: Node): Node | null {
  return scene.getChildByName(MAIN_CAM);
}

function bgRootOf(scene: Node): Node | null {
  const cam = mainCamNode(scene);
  return cam?.getChildByName(ROOT_NAME) ?? scene.getChildByName(ROOT_NAME);
}

let _bgQuad: ReturnType<typeof utils.MeshUtils.createMesh> = null;
let _bgMat: Material | null = null;

function bgQuad() {
  if (_bgQuad) return _bgQuad;
  _bgQuad = utils.MeshUtils.createMesh({
    positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 1, 1, 1, 1, 0, 0, 0],
    indices: [0, 1, 2, 0, 2, 3],
    minPos: new Vec3(-0.5, -0.5, 0),
    maxPos: new Vec3(0.5, 0.5, 0),
    boundingRadius: Math.SQRT1_2,
  });
  return _bgQuad;
}

function bgMat(tex: Texture2D): Material | null {
  if (_bgMat?.passes?.length) {
    _bgMat.setProperty('mainTexture', tex);
    return _bgMat;
  }
  const mat = new Material();
  mat.initialize({
    effectName: 'builtin-unlit',
    technique: 0,
    defines: { USE_TEXTURE: true },
    states: {
      rasterizerState: { cullMode: gfx.CullMode.NONE },
      depthStencilState: {
        depthTest: true,
        depthWrite: false,
        depthFunc: gfx.ComparisonFunc.LESS_EQUAL,
      },
    },
  });
  if (!mat.passes?.length) return null;
  mat.setProperty('mainTexture', tex);
  mat.setProperty('mainColor', Color.WHITE);
  _bgMat = mat;
  return mat;
}

/** Fill the 3D ortho view; cover-crop the 1080×2200 art the same way the old UI sprite did. */
function poseSkyArt(cam: Camera, art: Node): void {
  const vis = portraitVisibleSize();
  const cover = coverBackgroundSize(vis.width, vis.height);
  const h = cam.orthoHeight * 2;
  const aspect = vis.width / Math.max(vis.height, 1);
  art.setPosition(0, 0, -(cam.far - 1));
  art.setRotationFromEuler(0, 0, 0);
  art.setScale(
    h * aspect * (cover.w / Math.max(vis.width, 1)),
    h * (cover.h / Math.max(vis.height, 1)),
    1,
  );
}

export function layoutWorldBg(scene: Node | null): void {
  if (!scene) return;
  const camNode = mainCamNode(scene);
  const cam = camNode?.getComponent(Camera);
  const art = bgRootOf(scene)?.getChildByName(ART_NAME);
  if (!cam || !art) return;
  poseSkyArt(cam, art);
}

export async function spawnToyBackdrop(scene: Node, camNode: Node): Promise<Node> {
  disposeNamed(scene, ROOT_NAME);
  disposeNamed(scene, 'BgCam');
  disposeNamed(camNode, ROOT_NAME);

  const root = new Node(ROOT_NAME);
  camNode.addChild(root);
  root.layer = Layers.Enum.DEFAULT;

  const cam = camNode.getComponent(Camera);
  if (!cam) return root;

  let img: ImageAsset;
  try {
    img = await loadBgImage();
  } catch (err) {
    console.error('[Suck] backdrop image failed', err);
    return root;
  }
  if (!img.width || !img.height) {
    console.error('[Suck] backdrop image has no size');
    return root;
  }

  const art = new Node(ART_NAME);
  root.addChild(art);
  art.layer = Layers.Enum.DEFAULT;
  const mr = art.addComponent(MeshRenderer);
  mr.mesh = bgQuad();
  const mat = bgMat(texFromImage(img));
  if (mat) mr.setSharedMaterial(mat, 0);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  mr.priority = 1000;
  poseSkyArt(cam, art);
  return root;
}

export function applyToyGround(node: Node): void {
  node.active = false;
}

const FX_CATCHER = '9d13ee10-0202-4a01-8001-000000000013';

let _catcherFx: EffectAsset | null = null;
let _catcherBoot: Promise<void> | null = null;
let _catcherMat: Material | null = null;
let _catcherQuad: ReturnType<typeof utils.MeshUtils.createMesh> = null;

export function preloadShadowCatchers(): Promise<void> {
  if (_catcherFx) return Promise.resolve();
  if (_catcherBoot) return _catcherBoot;
  _catcherBoot = new Promise((resolve) => {
    assetManager.loadAny({ uuid: FX_CATCHER }, (err, asset) => {
      if (!err && asset) _catcherFx = asset as EffectAsset;
      resolve();
    });
  });
  return _catcherBoot;
}

function catcherMat(): Material | null {
  if (_catcherMat?.passes?.length) return _catcherMat;
  const mat = new Material();
  if (_catcherFx) {
    try {
      mat.initialize({
        effectAsset: _catcherFx,
        defines: { CC_RECEIVE_SHADOW: true },
      });
    } catch {
      /* effect failed to compile */
    }
  }
  if (!mat.passes?.length) return null;
  mat.setProperty('mainColor', new Color(38, 30, 52, 88));
  _catcherMat = mat;
  return mat;
}

function catcherQuad() {
  if (_catcherQuad) return _catcherQuad;
  _catcherQuad = utils.MeshUtils.createMesh({
    positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 1, 1, 1, 1, 0, 0, 0],
    indices: [0, 1, 2, 0, 2, 3],
    minPos: new Vec3(-0.5, -0.5, 0),
    maxPos: new Vec3(0.5, 0.5, 0),
    boundingRadius: Math.SQRT1_2,
  });
  return _catcherQuad;
}

function placeCatcher(root: Node, name: string, pos: Vec3, euler: Vec3, scale: Vec3): void {
  const mat = catcherMat();
  const mesh = catcherQuad();
  if (!mat || !mesh) return;
  let n = root.getChildByName(name);
  if (!n) {
    n = new Node(name);
    root.addChild(n);
    n.addComponent(MeshRenderer);
  }
  n.active = true;
  n.layer = root.layer;
  n.setPosition(pos);
  n.setRotationFromEuler(euler.x, euler.y, euler.z);
  n.setScale(scale);
  const mr = n.getComponent(MeshRenderer)!;
  mr.mesh = mesh;
  mr.setSharedMaterial(mat, 0);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.ON;
  mr.enabled = true;
}

/** Invisible planes that only draw the shadow map, right under each stand. */
export function spawnShadowCatchers(root: Node): void {
  const benchZ = shooterStandZ() + ((BENCH.rows - 1) * BENCH.stepZ) * 0.5;
  placeCatcher(
    root,
    'ShadowFloor',
    new Vec3(0, PLAY.benchStandY - 0.22, benchZ),
    new Vec3(-90, 0, 0),
    new Vec3(7.4, 11.4, 1),
  );
  placeCatcher(
    root,
    'ShadowSlot',
    new Vec3(0, PLAY.slotStandY - 0.22, shooterStandZ()),
    new Vec3(-90, 0, 0),
    new Vec3(6.6, 2.6, 1),
  );
}
