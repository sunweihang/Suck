import {
  Color,
  ImageAsset,
  Layers,
  Material,
  Node,
  RenderRoot2D,
  Sprite,
  SpriteFrame,
  Texture2D,
  Tween,
  UITransform,
  Vec3,
  gfx,
  resources,
  tween,
} from 'cc';
const NAIL_PX = 256;
const NAIL_SCALE = 0.00305;

let _sf: SpriteFrame | null = null;
let _depthMat: Material | null = null;

function frameFromImage(img: ImageAsset): SpriteFrame {
  const tex = new Texture2D();
  tex.image = img;
  const sf = new SpriteFrame();
  sf.texture = tex;
  return sf;
}

function depthMat(): Material | null {
  if (_depthMat) return _depthMat;
  try {
    const mat = new Material();
    mat.initialize({
      effectName: 'builtin-sprite',
      states: {
        depthStencilState: {
          depthTest: true,
          depthWrite: false,
          depthFunc: gfx.ComparisonFunc.LESS_EQUAL,
        },
        rasterizerState: {
          cullMode: gfx.CullMode.NONE,
        },
      },
    });
    if (mat.passes?.length) {
      _depthMat = mat;
      return mat;
    }
  } catch {
    /* keep default */
  }
  return null;
}

export function preloadLockNails(): Promise<void> {
  if (_sf) return Promise.resolve();
  return new Promise((resolve) => {
    resources.load('ui/lock-nail/spriteFrame', SpriteFrame, (err, sf) => {
      if (!err && sf) {
        _sf = sf;
        resolve();
        return;
      }
      resources.load('ui/lock-nail', ImageAsset, (e2, img) => {
        if (!e2 && img) _sf = frameFromImage(img);
        resolve();
      });
    });
  });
}

export function clearLockLook(root: Node): void {
  const nails = root.getChildByName('LockNails');
  if (!nails || !nails.active) return;
  Tween.stopAllByTarget(nails);
  tween(nails)
    .to(0.22, { scale: new Vec3(0, 0, 0) }, { easing: 'backIn' })
    .call(() => {
      if (nails.isValid) nails.active = false;
    })
    .start();
}

export function applyLockNails(root: Node): void {
  if (root.getChildByName('LockNails')) return;
  const sf = _sf;
  if (!sf) return;
  const host = root.parent;
  if (host && !host.getComponent(RenderRoot2D)) host.addComponent(RenderRoot2D);
  const n = new Node('LockNails');
  n.layer = Layers.Enum.UI_3D;
  root.addChild(n);
  n.setPosition(0, 0, 0);
  n.setScale(1, 1, 1);
  const mat = depthMat();
  const nail = new Node('Nail');
  nail.layer = Layers.Enum.UI_3D;
  n.addChild(nail);
  nail.setPosition(0, 0.02, 0.56);
  nail.setScale(NAIL_SCALE, NAIL_SCALE, NAIL_SCALE);
  const ut = nail.addComponent(UITransform);
  ut.setContentSize(NAIL_PX, NAIL_PX);
  ut.hitTest = () => false;
  const sp = nail.addComponent(Sprite);
  sp.sizeMode = Sprite.SizeMode.CUSTOM;
  sp.type = Sprite.Type.SIMPLE;
  sp.spriteFrame = sf;
  sp.color = Color.WHITE;
  if (mat) sp.customMaterial = mat;
}
