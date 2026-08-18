import {
  Camera,
  Canvas,
  Color,
  EffectAsset,
  ImageAsset,
  Material,
  MeshRenderer,
  Node,
  Sprite,
  SpriteFrame,
  Texture2D,
  UITransform,
  Vec3,
  Widget,
  assetManager,
  resources,
  utils,
} from 'cc';
import { BENCH, PLAY, shooterStandZ } from '../game/GameConfig';
import { applyPortraitCameraRect, coverBackgroundSize, portraitVisibleSize } from '../game/PortraitFit';

const BG_IMAGE_UUID = '2dd19bfe-8cac-486f-9e72-ba1499869c97';
const ROOT_NAME = 'WorldBg';
const CAM_NAME = 'BgCam';
/** Dedicated bit so the UI camera does not redraw this fullscreen sprite over 3D. */
const WORLD_BG_LAYER = 1 << 5;

function setLayerDeep(node: Node, layer: number): void {
  node.layer = layer;
  const ut = node.getComponent(UITransform);
  if (ut) ut.hitTest = () => false;
  for (const child of node.children) setLayerDeep(child, layer);
}

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

function frameFromImage(img: ImageAsset): SpriteFrame {
  const tex = new Texture2D();
  tex.image = img;
  try {
    tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
  } catch {
    /* older engine */
  }
  const sf = new SpriteFrame();
  sf.texture = tex;
  return sf;
}

function disposeNamed(scene: Node, name: string): void {
  const n = scene.getChildByName(name);
  if (!n) return;
  n.removeFromParent();
  n.destroy();
}

export function layoutWorldBg(scene: Node | null): void {
  if (!scene) return;
  const vis = portraitVisibleSize();
  const camNode = scene.getChildByName(CAM_NAME);
  const cam = camNode?.getComponent(Camera);
  if (cam) {
    cam.orthoHeight = vis.height * 0.5;
    applyPortraitCameraRect(cam);
  }
  const root = scene.getChildByName(ROOT_NAME);
  root?.getComponent(UITransform)?.setContentSize(vis.width, vis.height);
  const art = root?.getChildByName('SkyArt');
  if (!art) return;
  const cover = coverBackgroundSize(vis.width, vis.height);
  art.getComponent(UITransform)?.setContentSize(cover.w, cover.h);
}

export async function spawnToyBackdrop(scene: Node): Promise<Node> {
  disposeNamed(scene, ROOT_NAME);
  disposeNamed(scene, CAM_NAME);

  const vis = portraitVisibleSize();
  const camNode = new Node(CAM_NAME);
  scene.addChild(camNode);
  camNode.setPosition(0, 0, 1000);
  const cam = camNode.addComponent(Camera);
  cam.projection = Camera.ProjectionType.ORTHO;
  cam.orthoHeight = vis.height * 0.5;
  cam.near = 0.1;
  cam.far = 2000;
  cam.priority = 0;
  cam.visibility = WORLD_BG_LAYER;
  cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
  cam.clearColor.set(254, 255, 241, 255);
  applyPortraitCameraRect(cam);

  const root = new Node(ROOT_NAME);
  scene.addChild(root);
  root.layer = WORLD_BG_LAYER;
  root.addComponent(UITransform).setContentSize(vis.width, vis.height);
  const canvas = root.addComponent(Canvas);
  canvas.cameraComponent = cam;
  canvas.alignCanvasWithScreen = false;

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

  const cover = coverBackgroundSize(vis.width, vis.height);
  const art = new Node('SkyArt');
  root.addChild(art);
  art.layer = WORLD_BG_LAYER;
  art.addComponent(UITransform).setContentSize(cover.w, cover.h);
  const widget = art.addComponent(Widget);
  widget.isAlignHorizontalCenter = widget.isAlignVerticalCenter = true;
  widget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
  const sp = art.addComponent(Sprite);
  sp.spriteFrame = frameFromImage(img);
  sp.sizeMode = Sprite.SizeMode.CUSTOM;
  sp.type = Sprite.Type.SIMPLE;
  setLayerDeep(root, WORLD_BG_LAYER);
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
  const benchZ = BENCH.startZ + ((BENCH.rows - 1) * BENCH.stepZ) * 0.5;
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
