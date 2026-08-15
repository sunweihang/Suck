import { Color, Material, Mesh, MeshRenderer, Node, Texture2D, Vec3, utils } from 'cc';
import { Theme } from '../game/Theme';
import { artFrame, preloadUiArt } from '../view/UiArt';
import { applyMesh, applyShadowReceiver } from './ToyBlockMesh';

const _mats = new Map<string, Material>();

function clay(key: string, color: Color, roughness: number, emit: number): Material {
  let mat = _mats.get(key);
  if (mat) return mat;
  mat = new Material();
  mat.initialize({ effectName: 'builtin-standard' });
  mat.setProperty('mainColor', color);
  mat.setProperty('roughness', roughness);
  mat.setProperty('metallic', 0);
  mat.setProperty('emissive', color);
  mat.setProperty('emissiveScale', new Vec3(emit, emit, emit));
  _mats.set(key, mat);
  return mat;
}

export function applyToyGround(node: Node): void {
  applyShadowReceiver(node);
  const mr = node.getComponent(MeshRenderer);
  if (!mr?.mesh) {
    if (mr) mr.enabled = false;
    return;
  }
  const mat = clay('ground', Theme.ground, 0.62, 0.08);
  if (!mat.passes?.length) {
    mr.enabled = false;
    return;
  }
  mr.setSharedMaterial(mat, 0);
}

function skyQuad(): Mesh | null {
  return utils.MeshUtils.createMesh({
    positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 1, 1, 1, 0, 0, 1, 0],
    indices: [0, 1, 2, 1, 3, 2],
    minPos: new Vec3(-0.5, -0.5, 0),
    maxPos: new Vec3(0.5, 0.5, 0),
  });
}

function skyMat(tex: Texture2D): Material {
  const unlit = new Material();
  try {
    unlit.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } });
    if (unlit.passes?.length) {
      unlit.setProperty('mainTexture', tex);
      return unlit;
    }
  } catch {
    /* fall through */
  }
  const std = new Material();
  std.initialize({ effectName: 'builtin-standard' });
  std.setProperty('mainTexture', tex);
  std.setProperty('mainColor', Color.WHITE);
  std.setProperty('roughness', 1);
  std.setProperty('metallic', 0);
  std.setProperty('emissive', Color.WHITE);
  std.setProperty('emissiveScale', new Vec3(0.45, 0.45, 0.45));
  return std;
}

export async function spawnToyBackdrop(parent: Node): Promise<Node> {
  const root = new Node('Backdrop');
  parent.addChild(root);
  await preloadUiArt();
  const sf = artFrame('bg');
  const tex = sf?.texture as Texture2D | undefined;
  if (!tex) return root;

  const mesh = skyQuad();
  const mat = skyMat(tex);
  if (!mesh || !mat.passes?.length) return root;

  const n = new Node('SkyArt');
  root.addChild(n);
  n.setPosition(0, 3.6, -10.6);
  n.setRotationFromEuler(16, 0, 0);
  n.setScale(15.2, 22.8, 1);
  const mr = n.addComponent(MeshRenderer);
  if (!applyMesh(mr, mesh, mat)) return root;
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  return root;
}
