import {
  _decorator,
  Camera,
  Color,
  Component,
  Layers,
  Node,
  Quat,
  RenderRoot2D,
  Sprite,
  SpriteFrame,
  UITransform,
  Vec3,
  resources,
} from 'cc';

const { ccclass } = _decorator;

const HAND_W = 280;
const HAND_H = 275;
const RING1 = 96;
const RING2 = 168;
const WORLD_SCALE = 0.003;
const UI_SCALE = 0.86;
const TIP_AX = 0.018;
const TIP_AY = 0.989;
const TAP_CYCLE = 1.05;
const SWIPE_CYCLE = 1.7;
const _tint = new Color(255, 255, 255, 255);

function smooth(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

@ccclass('HintHand')
export class HintHand extends Component {
  private readonly _from = new Vec3();
  private readonly _to = new Vec3();
  private readonly _pos = new Vec3();
  private readonly _camQ = new Quat();
  private _t = 0;
  private _hidden = true;
  private _hasPath = false;
  private _ui = false;
  private _cam: Camera | null = null;
  private _hand: Node | null = null;
  private _shadow: Node | null = null;
  private _rings: Node[] = [];

  onLoad(): void {
    this._ui = this.node.parent?.layer === Layers.Enum.UI_2D;
    this._setupNode();
    this._loadArt();
  }

  bindCamera(cam: Camera | null): void {
    this._cam = cam;
  }

  hide(): void {
    if (this._hidden && !this.node.active) return;
    this._hidden = true;
    this.node.active = false;
  }

  placeWorld(from: Vec3, to: Vec3): void {
    this._place(from, to, false);
  }

  placeUi(from: Vec3, to: Vec3): void {
    this._place(from, to, true);
  }

  update(dt: number): void {
    if (this._hidden || !this.node.active || !this._hasPath) return;
    this._t += dt;
    this._applyPose();
  }

  private _place(from: Vec3, to: Vec3, ui: boolean): void {
    const fresh = this._hidden || !this.node.active;
    this._hidden = false;
    this._from.set(from);
    this._to.set(to);
    this._hasPath = true;
    if (fresh) this._t = 0;
    this.node.active = true;
    this._ui = ui;
    this._syncLayer();
    this._applyPose();
  }

  private _applyPose(): void {
    const scale = this._ui ? UI_SCALE : WORLD_SCALE;
    this.node.setScale(scale, scale, scale);
    if (this._samePoint()) this._poseTap();
    else this._poseSwipe();
    if (this._ui) {
      this.node.setRotationFromEuler(0, 0, 0);
      return;
    }
    const camN = this._cam?.node;
    if (camN) {
      camN.getWorldRotation(this._camQ);
      this.node.setWorldRotation(this._camQ);
    }
  }

  private _samePoint(): boolean {
    const lim = this._ui ? 2 : 0.04;
    return (
      Math.abs(this._from.x - this._to.x) +
        Math.abs(this._from.y - this._to.y) +
        Math.abs(this._from.z - this._to.z) <
      lim
    );
  }

  private _poseTap(): void {
    const u = (this._t % TAP_CYCLE) / TAP_CYCLE;
    let press = 0;
    if (u < 0.31) press = smooth(u / 0.31);
    else if (u < 0.48) press = 1;
    else if (u < 0.84) press = 1 - smooth((u - 0.48) / 0.36);
    this.node.setWorldPosition(this._from);
    this._poseHand(press);
    this._poseRings(u);
  }

  private _poseSwipe(): void {
    const u = (this._t % SWIPE_CYCLE) / SWIPE_CYCLE;
    let show = true;
    let k = 0;
    if (u < 0.12) k = 0;
    else if (u < 0.55) k = smooth((u - 0.12) / 0.43);
    else if (u < 0.70) k = 1;
    else show = false;
    Vec3.lerp(this._pos, this._from, this._to, k);
    this.node.setWorldPosition(this._pos);
    this.node.setScale(show ? (this._ui ? UI_SCALE : WORLD_SCALE) : 0, show ? (this._ui ? UI_SCALE : WORLD_SCALE) : 0, 1);
    this._poseHand(show ? 0.35 + k * 0.25 : 0);
    this._hideRings();
  }

  private _poseHand(press: number): void {
    const lift = 1 - press;
    const x = 18 * lift;
    const y = -22 * lift;
    const rot = -10 * lift + 7 * press;
    this._hand?.setPosition(x, y, 0);
    this._hand?.setRotationFromEuler(0, 0, rot);
    this._hand?.setScale(1 - press * 0.04, 1 - press * 0.04, 1);
    this._shadow?.setPosition(x + 10, y - 8, 0);
    this._shadow?.setRotationFromEuler(0, 0, rot);
    this._shadow?.setScale(1 - press * 0.04, 1 - press * 0.04, 1);
    const sd = this._shadow?.getComponent(Sprite);
    if (sd) {
      _tint.a = Math.round(70 + press * 50);
      sd.color = _tint;
    }
  }

  private _poseRings(u: number): void {
    const on = u >= 0.22 && u < 0.90;
    const t = on ? (u - 0.22) / 0.68 : 0;
    this._ring(0, on, 0.55 + t * 0.9, this._fade(t, 0.06, 0.42));
    this._ring(1, on && t > 0.04, 0.5 + t * 1.65, this._fade(t, 0.1, 0.72));
    this._ring(2, on && t > 0.14, 0.8 + t * 1.95, this._fade(t, 0.16, 0.82) * 0.8);
  }

  private _fade(t: number, a: number, b: number): number {
    if (t <= a) return smooth(t / Math.max(0.001, a));
    if (t >= b) return 1 - smooth((t - b) / Math.max(0.001, 1 - b));
    return 1;
  }

  private _ring(i: number, on: boolean, scale: number, alpha: number): void {
    const n = this._rings[i];
    if (!n) return;
    n.active = on && alpha > 0.02;
    if (!n.active) return;
    n.setScale(scale, scale, 1);
    const sp = n.getComponent(Sprite);
    if (sp) {
      _tint.a = Math.round(255 * alpha);
      sp.color = _tint;
    }
  }

  private _hideRings(): void {
    for (const n of this._rings) n.active = false;
  }

  private _setupNode(): void {
    this._syncLayer();
    let ut = this.node.getComponent(UITransform);
    if (!ut) ut = this.node.addComponent(UITransform);
    ut.setContentSize(8, 8);
    ut.setAnchorPoint(0.5, 0.5);
    const rootSp = this.node.getComponent(Sprite);
    if (rootSp) {
      rootSp.spriteFrame = null;
      rootSp.enabled = false;
    }
    this._rings = [
      this._child('Ring1', RING1, RING1, 0.5, 0.5),
      this._child('Ring2', RING2, RING2, 0.5, 0.5),
      this._child('Ring3', RING2, RING2, 0.5, 0.5),
    ];
    this._shadow = this._child('Shadow', HAND_W, HAND_H, TIP_AX, TIP_AY, true);
    this._hand = this._child('Hand', HAND_W, HAND_H, TIP_AX, TIP_AY, true);
    const scale = this._ui ? UI_SCALE : WORLD_SCALE;
    this.node.setScale(scale, scale, scale);
  }

  private _syncLayer(): void {
    if (this._ui) {
      this.node.layer = Layers.Enum.UI_2D;
      return;
    }
    this.node.layer = Layers.Enum.UI_3D;
    if (!this.node.getComponent(RenderRoot2D)) this.node.addComponent(RenderRoot2D);
    for (const n of this.node.children) n.layer = Layers.Enum.UI_3D;
  }

  private _child(name: string, w: number, h: number, ax: number, ay: number, on = false): Node {
    let n = this.node.getChildByName(name);
    if (!n) {
      n = new Node(name);
      this.node.addChild(n);
    }
    n.layer = this.node.layer;
    let ut = n.getComponent(UITransform);
    if (!ut) ut = n.addComponent(UITransform);
    ut.setContentSize(w, h);
    ut.setAnchorPoint(ax, ay);
    if (!n.getComponent(Sprite)) n.addComponent(Sprite);
    n.active = on;
    return n;
  }

  private _loadArt(): void {
    this._load('ui/hint-hand/spriteFrame', this._hand);
    this._load('ui/hint-hand-sd/spriteFrame', this._shadow);
    this._load('ui/hint-ring-1/spriteFrame', this._rings[0]);
    this._load('ui/hint-ring-2/spriteFrame', this._rings[1]);
    this._load('ui/hint-ring-2/spriteFrame', this._rings[2]);
  }

  private _load(path: string, node: Node | null): void {
    if (!node) return;
    resources.load(path, SpriteFrame, (err, sf) => {
      if (!this.isValid || err || !sf) return;
      const sp = node.getComponent(Sprite);
      if (!sp) return;
      sp.spriteFrame = sf;
      sp.sizeMode = Sprite.SizeMode.CUSTOM;
      sp.type = Sprite.Type.SIMPLE;
      sp.color = Color.WHITE;
    });
  }
}
