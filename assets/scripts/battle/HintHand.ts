import {
  _decorator,
  Camera,
  Color,
  Component,
  ImageAsset,
  Layers,
  RenderRoot2D,
  Sprite,
  SpriteFrame,
  Texture2D,
  UITransform,
  Vec3,
  resources,
} from 'cc';

const { ccclass } = _decorator;

const HAND_W = 180;
const HAND_H = 220;
const WORLD_SCALE = 0.0035;

function frameFromImage(img: ImageAsset): SpriteFrame {
  const tex = new Texture2D();
  tex.image = img;
  const sf = new SpriteFrame();
  sf.texture = tex;
  return sf;
}

@ccclass('HintHand')
export class HintHand extends Component {
  private readonly _from = new Vec3();
  private readonly _to = new Vec3();
  private _t = 0;
  private _hidden = false;
  private _hasPath = false;
  private _cam: Camera | null = null;

  onLoad(): void {
    this._setupNode();
    this._loadArt();
  }

  bindCamera(cam: Camera | null): void {
    this._cam = cam;
  }

  hide(): void {
    this._hidden = true;
    this.node.active = false;
  }

  placeWorld(from: Vec3, to: Vec3): void {
    if (this._hidden) return;
    this._from.set(from);
    this._to.set(to);
    this._hasPath = true;
    this.node.active = true;
  }

  update(dt: number): void {
    if (this._hidden || !this.node.active || !this._hasPath) return;
    this._t += dt;
    const cycle = 2.4;
    const p = (this._t % cycle) / cycle;
    const same =
      Math.abs(this._from.x - this._to.x) +
        Math.abs(this._from.y - this._to.y) +
        Math.abs(this._from.z - this._to.z) <
      0.04;
    let atTo = false;
    let show = true;
    let bob = 0;
    if (same) {
      bob = (Math.sin(this._t * 14) + 1) * 0.03;
    } else if (p < 0.38) {
      bob = (Math.sin(this._t * 14) + 1) * 0.03;
    } else if (p < 0.48) {
      show = false;
    } else if (p < 0.86) {
      atTo = true;
      bob = (Math.sin(this._t * 14) + 1) * 0.03;
    } else {
      show = false;
      atTo = true;
    }
    const src = atTo ? this._to : this._from;
    this.node.setWorldPosition(src.x, src.y + bob, src.z);
    // Flip Y so the finger points up from below instead of covering the target.
    this.node.setScale(show ? WORLD_SCALE : 0, show ? -WORLD_SCALE : 0, show ? WORLD_SCALE : 0);
    const camN = this._cam?.node;
    if (camN) this.node.setWorldRotation(camN.worldRotation);
  }

  private _setupNode(): void {
    this.node.layer = Layers.Enum.UI_3D;
    if (!this.node.getComponent(RenderRoot2D)) this.node.addComponent(RenderRoot2D);
    let ut = this.node.getComponent(UITransform);
    if (!ut) ut = this.node.addComponent(UITransform);
    ut.setContentSize(HAND_W, HAND_H);
    ut.setAnchorPoint(0.5, 0.1);
    this.node.setScale(WORLD_SCALE, -WORLD_SCALE, WORLD_SCALE);
    if (!this.node.getComponent(Sprite)) this.node.addComponent(Sprite);
  }

  private _loadArt(): void {
    resources.load('ui/hint-hand/spriteFrame', SpriteFrame, (err, sf) => {
      if (!this.isValid) return;
      if (!err && sf) {
        this._apply(sf);
        return;
      }
      resources.load('ui/hint-hand', ImageAsset, (e2, img) => {
        if (!this.isValid || e2 || !img) return;
        this._apply(frameFromImage(img));
      });
    });
  }

  private _apply(sf: SpriteFrame): void {
    const sp = this.node.getComponent(Sprite);
    if (!sp) return;
    sp.spriteFrame = sf;
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.type = Sprite.Type.SIMPLE;
    sp.color = Color.WHITE;
    this.node.getComponent(UITransform)?.setContentSize(HAND_W, HAND_H);
  }
}
