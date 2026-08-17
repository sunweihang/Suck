import {
  Camera,
  Canvas,
  ImageAsset,
  Node,
  Sprite,
  SpriteFrame,
  Texture2D,
  UITransform,
  Widget,
  assetManager,
  resources,
} from 'cc';
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
