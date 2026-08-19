import {
  Color,
  Component,
  Layers,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Quat,
  Vec3,
  _decorator,
  gfx,
  utils,
} from 'cc';

const { ccclass } = _decorator;

const POOL_MAX = 22;
const CHIP_PRI = 36;
const STREAK_PRI = 38;
const GRAVITY = 16;
const _pos = new Vec3();
const _dir = new Vec3();
const _q = new Quat();
const _negY = new Vec3(0, -1, 0);
const _chipMats = new Map<string, Material>();
const _streakMats = new Map<string, Material>();
const _colors = new Map<string, Color>();

let _cube: Mesh | null = null;
let _streak: Mesh | null = null;

function colorOf(rgb: readonly [number, number, number], a = 255): Color {
  const key = `${rgb[0]}-${rgb[1]}-${rgb[2]}-${a}`;
  let c = _colors.get(key);
  if (c) return c;
  c = new Color(rgb[0], rgb[1], rgb[2], a);
  _colors.set(key, c);
  return c;
}

function cubeMesh(): Mesh {
  if (_cube?.isValid) return _cube;
  const p = 0.5;
  _cube = utils.MeshUtils.createMesh({
    positions: [
      -p, -p, p, p, -p, p, p, p, p, -p, p, p,
      -p, -p, -p, -p, p, -p, p, p, -p, p, -p, -p,
      -p, p, -p, -p, p, p, p, p, p, p, p, -p,
      -p, -p, -p, p, -p, -p, p, -p, p, -p, -p, p,
      p, -p, -p, p, p, -p, p, p, p, p, -p, p,
      -p, -p, -p, -p, -p, p, -p, p, p, -p, p, -p,
    ],
    normals: [
      0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
      0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
      0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
      0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
      1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
      -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
    ],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1],
    indices: [
      0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7,
      8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15,
      16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23,
    ],
    minPos: new Vec3(-p, -p, -p),
    maxPos: new Vec3(p, p, p),
    boundingRadius: Math.sqrt(0.75),
  });
  return _cube;
}

function streakMesh(): Mesh {
  if (_streak?.isValid) return _streak;
  _streak = utils.MeshUtils.createMesh({
    positions: [-0.5, 0, 0, 0.5, 0, 0, 0.5, -1, 0, -0.5, -1, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 1, 1, 1, 1, 0, 0, 0],
    indices: [0, 1, 2, 0, 2, 3],
    minPos: new Vec3(-0.5, -1, 0),
    maxPos: new Vec3(0.5, 0, 0),
    boundingRadius: 1.12,
  });
  return _streak;
}

function chipMat(rgb: readonly [number, number, number]): Material {
  const key = `${rgb[0]},${rgb[1]},${rgb[2]}`;
  let mat = _chipMats.get(key);
  if (mat?.passes?.length) return mat;
  const color = colorOf(rgb);
  mat = new Material();
  mat.initialize({ effectName: 'builtin-standard' });
  mat.setProperty('mainColor', color);
  mat.setProperty('roughness', 0.34);
  mat.setProperty('metallic', 0.04);
  mat.setProperty('emissive', color);
  mat.setProperty('emissiveScale', new Vec3(0.04, 0.04, 0.04));
  _chipMats.set(key, mat);
  return mat;
}

function streakMat(rgb: readonly [number, number, number]): Material {
  const key = `${rgb[0]},${rgb[1]},${rgb[2]}`;
  let mat = _streakMats.get(key);
  if (mat?.passes?.length) return mat;
  const tint = new Color(
    Math.min(255, Math.round(rgb[0] + (255 - rgb[0]) * 0.42)),
    Math.min(255, Math.round(rgb[1] + (255 - rgb[1]) * 0.42)),
    Math.min(255, Math.round(rgb[2] + (255 - rgb[2]) * 0.42)),
    200,
  );
  mat = new Material();
  mat.initialize({
    effectName: 'builtin-unlit',
    technique: 0,
    states: {
      rasterizerState: { cullMode: gfx.CullMode.NONE },
      depthStencilState: { depthTest: true, depthWrite: false },
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
  mat.setProperty('mainColor', tint);
  _streakMats.set(key, mat);
  return mat;
}

function bindMr(node: Node, mesh: Mesh, mat: Material, pri: number): MeshRenderer {
  let mr = node.getComponent(MeshRenderer);
  if (!mr) mr = node.addComponent(MeshRenderer);
  mr.mesh = mesh;
  mr.setSharedMaterial(mat, 0);
  mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
  mr.shadowReceivingMode = MeshRenderer.ShadowReceivingMode.OFF;
  mr.priority = pri;
  mr.enabled = true;
  return mr;
}

@ccclass('DebrisBit')
export class DebrisBit extends Component {
  private readonly _vel = new Vec3();
  private _life = 0;
  private _lifeMax = 1;
  private _size = 0.14;
  private _rgbKey = '';
  private _streak: Node | null = null;

  onLoad(): void {
    this.enabled = false;
    this._ensureParts();
  }

  get busy(): boolean {
    return this.node.active && this._life > 0;
  }

  burst(from: Vec3, rgb: readonly [number, number, number]): void {
    this._ensureParts();
    this._paint(rgb);
    this.node.setWorldPosition(
      from.x + (Math.random() - 0.5) * 0.22,
      from.y + (Math.random() - 0.5) * 0.18,
      from.z + (Math.random() - 0.5) * 0.22,
    );
    this._size = 0.1 + Math.random() * 0.07;
    this.node.setScale(this._size, this._size, this._size);
    this.node.setRotationFromEuler(Math.random() * 360, Math.random() * 360, Math.random() * 360);
    this._vel.set(
      (Math.random() - 0.5) * 1.8,
      0.6 + Math.random() * 1.8,
      (Math.random() - 0.5) * 1.8,
    );
    this._lifeMax = 0.62 + Math.random() * 0.34;
    this._life = this._lifeMax;
    this.node.active = true;
    this.enabled = true;
    if (this._streak) this._streak.active = true;
  }

  update(dt: number): void {
    if (!this.node.active || this._life <= 0) return;
    this._life -= dt;
    this._vel.y -= GRAVITY * dt;
    this.node.getPosition(_pos);
    _pos.x += this._vel.x * dt;
    _pos.y += this._vel.y * dt;
    _pos.z += this._vel.z * dt;
    this.node.setPosition(_pos);
    const u = this._life / this._lifeMax;
    if (u <= 0.32) {
      const s = this._size * Math.max(0.04, u / 0.32);
      this.node.setScale(s, s, s);
    }
    this._poseStreak();
    if (this._life > 0) return;
    if (this._streak) this._streak.active = false;
    this.node.active = false;
    this.enabled = false;
  }

  private _ensureParts(): void {
    if (!this._streak?.isValid) {
      let n = this.node.getChildByName('Streak');
      if (!n) {
        n = new Node('Streak');
        this.node.addChild(n);
      }
      n.layer = this.node.layer || Layers.Enum.DEFAULT;
      this._streak = n;
    }
    if (!this.node.getComponent(MeshRenderer)) {
      bindMr(this.node, cubeMesh(), chipMat([236, 220, 188]), CHIP_PRI);
    }
  }

  private _paint(rgb: readonly [number, number, number]): void {
    const key = `${rgb[0]},${rgb[1]},${rgb[2]}`;
    if (this._rgbKey === key) return;
    this._rgbKey = key;
    bindMr(this.node, cubeMesh(), chipMat(rgb), CHIP_PRI);
    if (this._streak) bindMr(this._streak, streakMesh(), streakMat(rgb), STREAK_PRI);
  }

  private _poseStreak(): void {
    const streak = this._streak;
    if (!streak?.isValid) return;
    const spd = Math.sqrt(this._vel.lengthSqr());
    if (spd < 0.35) {
      streak.active = false;
      return;
    }
    streak.active = true;
    _dir.set(-this._vel.x, -this._vel.y, -this._vel.z);
    const inv = 1 / spd;
    _dir.multiplyScalar(inv);
    Quat.rotationTo(_q, _negY, _dir);
    streak.setWorldRotation(_q);
    const len = (0.22 + spd * 0.045) / Math.max(0.04, this.node.scale.x);
    const fade = Math.min(1, this._life / 0.18);
    streak.setScale(0.42, len * fade, 1);
    streak.setPosition(0, 0, 0);
  }
}

export function makeDebrisBit(host: Node, name: string): DebrisBit {
  const n = new Node(name);
  n.layer = host.layer || Layers.Enum.DEFAULT;
  host.addChild(n);
  n.setPosition(0, -2, 0);
  n.active = false;
  return n.addComponent(DebrisBit);
}

export const DEBRIS_POOL_MAX = POOL_MAX;
