import { Node, Quat, Vec3 } from 'cc';
import { CLIP_DIE, CLIP_IDLE, CLIP_JUMP, CLIP_SHOT } from './TurretClips';
import { TURRET_FIRE_LOCAL, TURRET_MUZZLE_LOCAL, TURRET_PITCH_DEG, TURRET_SCALE, TURRET_YAW_DEG } from './ToyLook';

type AnimState = 'bench' | 'drag' | 'walk' | 'attack';

type Clip = {
  stop: number;
  times: readonly number[];
  rootP: readonly (readonly number[])[];
  rootR: readonly (readonly number[])[];
  rootS: readonly (readonly number[])[];
  gunR: readonly (readonly number[])[];
  gunS: readonly (readonly number[])[];
};

const KEEP_OFF_RIG = new Set(['Rig', 'LockNails', 'BlobShadow', 'Mouth', 'Power']);
/** Unity Die hops ~2.5 on a ~1-unit shooter; retarget onto our 0.376 mesh under host scale. */
const CLIP_POS_SCALE = TURRET_MUZZLE_LOCAL.y / TURRET_SCALE;
let sharedIdle = 0;
const _clipQ = new Quat();
const _rootQ = new Quat();
const _gunQ = new Quat();
const _restQ = new Quat();
const _slerpA = new Quat();
const _slerpB = new Quat();
const _scale = new Vec3();
const _pos = new Vec3();
const _ident = new Quat();
Quat.fromEuler(_restQ, TURRET_PITCH_DEG, TURRET_YAW_DEG, 0);

function ensureRig(root: Node): Node {
  let rig = root.getChildByName('Rig');
  if (!rig) {
    rig = new Node('Rig');
    root.addChild(rig);
  }
  rig.layer = root.layer;
  const kids = root.children.slice();
  for (const child of kids) {
    if (KEEP_OFF_RIG.has(child.name)) continue;
    child.setParent(rig, false);
  }
  return rig;
}

function sampleIndex(times: readonly number[], t: number): [number, number, number] {
  const last = times.length - 1;
  if (last <= 0) return [0, 0, 0];
  if (t <= times[0]) return [0, 0, 0];
  if (t >= times[last]) return [last, last, 0];
  let i = 0;
  while (i < last && times[i + 1] < t) i += 1;
  const j = Math.min(i + 1, last);
  const span = times[j] - times[i];
  return [i, j, span <= 1e-6 ? 0 : (t - times[i]) / span];
}

function readQuat(out: Quat, keys: readonly (readonly number[])[], i: number, j: number, k: number): Quat {
  const a = keys[i];
  const b = keys[j];
  _slerpA.set(a[0], a[1], a[2], a[3]);
  _slerpB.set(b[0], b[1], b[2], b[3]);
  if (Quat.dot(_slerpA, _slerpB) < 0) {
    _slerpB.set(-_slerpB.x, -_slerpB.y, -_slerpB.z, -_slerpB.w);
  }
  Quat.slerp(out, _slerpA, _slerpB, k);
  return out;
}

function readScale(out: Vec3, keys: readonly (readonly number[])[], i: number, j: number, k: number): Vec3 {
  const a = keys[i];
  const b = keys[j];
  out.set(
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  );
  return out;
}

function evalClip(clip: Clip, t: number, loop: boolean, rot: Quat, scale: Vec3, pos: Vec3): void {
  let u = t;
  if (loop) {
    const stop = clip.stop || 1;
    u = ((t % stop) + stop) % stop;
  } else {
    u = Math.min(Math.max(t, 0), clip.stop);
  }
  const [i, j, k] = sampleIndex(clip.times, u);
  readQuat(_rootQ, clip.rootR, i, j, k);
  readQuat(_gunQ, clip.gunR, i, j, k);
  Quat.multiply(rot, _rootQ, _gunQ);
  readScale(pos, clip.rootP, i, j, k);
  readScale(_scale, clip.rootS, i, j, k);
  const gs = clip.gunS;
  const ga = gs[i];
  const gb = gs[j];
  scale.set(
    _scale.x * (ga[0] + (gb[0] - ga[0]) * k),
    _scale.y * (ga[1] + (gb[1] - ga[1]) * k),
    _scale.z * (ga[2] + (gb[2] - ga[2]) * k),
  );
}

export class TurretAnim {
  private _root: Node | null = null;
  private _rig: Node | null = null;
  private _body: Node | null = null;
  private _muzzle: Node | null = null;
  private _idleT = 0;
  private _oneshot: Clip | null = null;
  private _oneshotT = 0;
  private _hold = false;
  private _onDone: (() => void) | null = null;
  private _hasAim = false;

  rest(): void {
    const rig = this._rig;
    const body = this._body;
    if (rig?.isValid) {
      rig.setPosition(0, 0, 0);
      rig.setRotationFromEuler(0, 0, 0);
      rig.setScale(1, 1, 1);
    }
    if (body?.isValid) {
      body.setPosition(0, 0, 0);
      body.setRotationFromEuler(0, 0, 0);
      body.setScale(1, 1, 1);
    }
  }

  bind(root: Node, seed: number): void {
    this._root = root;
    this._rig = ensureRig(root);
    this._body = this._rig.getChildByName('Body') ?? root.getChildByName('Body');
    this._muzzle = this._body?.getChildByName('Mouth')
      ?? root.getChildByName('Mouth')
      ?? this._rig.getChildByName('Mouth')
      ?? null;
    void seed;
    this._idleT = sharedIdle;
    this._oneshot = null;
    this._oneshotT = 0;
    this._hold = false;
    this._onDone = null;
    this._rig.setScale(1, 1, 1);
    this._rig.setRotationFromEuler(0, 0, 0);
    root.setRotationFromEuler(0, 0, 0);
    if (this._body?.isValid) this._body.setRotation(_restQ);
  }

  /** Body stays at the 45° rest pitch; InkShot still owns the bullet path. */
  aimAt(_world: Vec3): void {
    this._hasAim = false;
  }

  punchPick(): void {
    this._play(CLIP_JUMP);
  }

  punchLand(): void {
    this._play(CLIP_JUMP);
  }

  punchInhale(): void {
    this.punchSpit();
  }

  punchSpit(): void {
    this._play(CLIP_SHOT);
  }

  punchEat(): void {
    /* original clip set has no eat; keep pose */
  }

  punchMerge(): void {
    this._play(CLIP_JUMP);
  }

  playDie(done?: () => void): void {
    this._play(CLIP_DIE);
    this._hold = true;
    this._onDone = done ?? null;
  }

  tick(dt: number, _state: AnimState, _inflight = 0): void {
    const root = this._root;
    const rig = this._rig;
    const body = this._body;
    if (!root?.isValid || !rig?.isValid || !body?.isValid) return;
    const step = Math.min(dt, 0.05);
    this._idleT += step;
    if (this._idleT > sharedIdle) sharedIdle = this._idleT;

    let finished: (() => void) | null = null;
    if (this._oneshot) {
      this._oneshotT += step;
      if (this._oneshotT >= this._oneshot.stop) {
        if (this._hold) {
          this._oneshotT = this._oneshot.stop;
          finished = this._onDone;
          this._onDone = null;
          this._hold = false;
        } else {
          this._oneshot = null;
        }
      }
    }

    const lock = _state === 'bench' || _state === 'attack';
    if (_state === 'attack') {
      rig.setRotation(_ident);
      if (this._oneshot) {
        evalClip(this._oneshot, this._oneshotT, false, _clipQ, _scale, _pos);
        Quat.multiply(_clipQ, _restQ, _clipQ);
        body.setRotation(_clipQ);
        body.setScale(_scale);
      } else {
        body.setRotation(_restQ);
        body.setScale(1, 1, 1);
        _scale.set(1, 1, 1);
      }
      _pos.set(0, 0, 0);
    } else if (this._oneshot) {
      evalClip(this._oneshot, this._oneshotT, false, _clipQ, _scale, _pos);
      rig.setRotation(_ident);
      Quat.multiply(_clipQ, _restQ, _clipQ);
      body.setRotation(_clipQ);
      body.setScale(_scale);
    } else {
      evalClip(CLIP_IDLE, sharedIdle, true, _clipQ, _scale, _pos);
      rig.setRotation(_ident);
      Quat.multiply(_rootQ, _restQ, _clipQ);
      body.setRotation(_rootQ);
      body.setScale(1, 1, 1);
      _scale.set(1, 1, 1);
    }
    rig.setPosition(
      lock ? 0 : _pos.x * CLIP_POS_SCALE,
      this._oneshot && !lock ? _pos.y * CLIP_POS_SCALE : 0,
      lock ? 0 : _pos.z * CLIP_POS_SCALE,
    );
    this._placeMuzzle();
    if (finished) finished();
  }

  private _play(clip: Clip): void {
    this._oneshot = clip;
    this._oneshotT = 0;
    this._hold = false;
    this._onDone = null;
  }

  private _placeMuzzle(): void {
    const mouth = this._muzzle;
    const body = this._body;
    if (!mouth?.isValid || !body?.isValid) return;
    if (mouth.parent !== body) mouth.setParent(body, false);
    mouth.setPosition(TURRET_FIRE_LOCAL);
    mouth.setRotation(_ident);
  }
}
