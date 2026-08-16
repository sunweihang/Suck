import {
  Color,
  ImageAsset,
  Material,
  MeshRenderer,
  Node,
  Texture2D,
  Vec3,
  gfx,
  resources,
  utils,
} from 'cc';
import { PLAY } from '../game/GameConfig';

let _tex: Texture2D | null = null;
let _mat: Material | null = null;

function texFromImage(img: ImageAsset): Texture2D {
  const tex = new Texture2D();
  tex.image = img;
  tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
  tex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  return tex;
}

function raftMat(tex: Texture2D): Material {
  if (_mat) return _mat;
  const mat = new Material();
  mat.initialize({
    effectName: 'builtin-standard',
    states: {
      depthStencilState: {
        depthTest: true,
        depthWrite: true,
        depthFunc: gfx.ComparisonFunc.LESS_EQUAL,
      },
      rasterizerState: {
        cullMode: gfx.CullMode.NONE,
      },
      blendState: {
        targets: [{
          blend: true,
          blendSrc: gfx.BlendFactor.SRC_ALPHA,
          blendDst: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
          blendSrcAlpha: gfx.BlendFactor.ONE,
          blendDstAlpha: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
        }],
      },
    },
  });
  mat.setProperty('mainTexture', tex);
  mat.setProperty('mainColor', Color.WHITE);
  mat.setProperty('roughness', 0.55);
  mat.setProperty('metallic', 0);
  mat.setProperty('emissive', Color.WHITE);
  mat.setProperty('emissiveScale', new Vec3(0.08, 0.08, 0.08));
  _mat = mat;
  return mat;
}

function raftQuad() {
  return utils.MeshUtils.createMesh({
    positions: [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
    minPos: new Vec3(-0.5, 0, -0.5),
    maxPos: new Vec3(0.5, 0, 0.5),
    boundingRadius: Math.SQRT1_2,
  });
}

export function preloadRaftBoard(): Promise<void> {
  if (_tex) return Promise.resolve();
  return new Promise((resolve) => {
    resources.load('ui/raft-board', ImageAsset, (err, img) => {
      if (!err && img) {
        _tex = texFromImage(img);
        raftMat(_tex);
      }
      resolve();
    });
  });
}

export function applyRaftBoard(root: Node, widthCols: number): void {
  if (!_tex) return;
  let board = root.getChildByName('RaftBoard');
  if (!board) {
    board = new Node('RaftBoard');
    root.addChild(board);
    const mr = board.addComponent(MeshRenderer);
    mr.mesh = raftQuad();
    mr.setSharedMaterial(raftMat(_tex), 0);
    mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
    mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  }
  const step = PLAY.blockStep;
  const worldW = Math.max(1, widthCols) * step * 1.48;
  const worldD = step * 1.18;
  board.setPosition(0, 0, -0.06);
  board.setRotationFromEuler(0, 0, 0);
  board.setScale(worldW, 1, worldD);
}
