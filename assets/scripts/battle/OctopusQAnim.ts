import { Node, Vec3 } from 'cc';

type AnimState = 'bench' | 'drag' | 'walk' | 'attack';

type Face = {
  node: Node;
  px: number;
  py: number;
  pz: number;
  sx: number;
  sy: number;
  sz: number;
};

const SPRING_K = 64;
const SPRING_D = 11.5;
const SCALE_MIN = 0.9;
const SCALE_MAX = 1.16;
const SQUASH_LIM = 0.14;
const ROT_LIM = 11;
const VEL_LIM = 3.2;
const ANG_LIM = 18;

function bindFace(root: Node, name: string): Face | null {
  const node = root.getChildByName(name);
  if (!node) return null;
  return {
    node,
    px: node.position.x,
    py: node.position.y,
    pz: node.position.z,
    sx: node.scale.x,
    sy: node.scale.y,
    sz: node.scale.z,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function spring(x: number, v: number, dt: number): [number, number] {
  v += (-x * SPRING_K - v * SPRING_D) * dt;
  x += v * dt;
  if (Math.abs(x) < 1e-4 && Math.abs(v) < 1e-3) return [0, 0];
  return [x, v];
}

const KEEP_OFF_RIG = new Set(['Power', 'Rig', 'LockNails']);
/** Face (+Z mouth) toward the wall. Camera sits at +Z, 28° down. */
const FACE_YAW = 180;
/** Tilt the crown-face toward the 28° camera. */
const FACE_PITCH = -26;
const AIM_YAW_MAX = 72;
const AIM_PITCH_LO = -22;
const AIM_PITCH_HI = 14;
const AIM_RATE = 14;
const RAD2DEG = 180 / Math.PI;
const _aimLocal = new Vec3();

function wrapDeg(d: number): number {
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

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

export class OctopusQAnim {
  private _root: Node | null = null;
  private _rig: Node | null = null;
  private _t = 0;
  private _phase = 0;

  private _sx = 0;
  private _sy = 0;
  private _sz = 0;
  private _vx = 0;
  private _vy = 0;
  private _vz = 0;
  private _rx = 0;
  private _ry = 0;
  private _rz = 0;
  private _vrx = 0;
  private _vry = 0;
  private _vrz = 0;

  private _blinkWait = 2;
  private _blinkT = -1;
  private _blinkAgain = false;
  private _wink = 0;

  private _lookX = 0;
  private _lookY = 0;
  private _lookTX = 0;
  private _lookTY = 0;
  private _lookWait = 1.2;

  private _jiggleWait = 2.4;
  private _appliedClose = 0;

  private _aimYaw = FACE_YAW;
  private _aimPitch = FACE_PITCH;
  private _aimYawT = FACE_YAW;
  private _aimPitchT = FACE_PITCH;

  private _eyeL: Face | null = null;
  private _eyeR: Face | null = null;
  private _pupilL: Face | null = null;
  private _pupilR: Face | null = null;
  private _hiL: Face | null = null;
  private _hiR: Face | null = null;
  private _mouth: Face | null = null;

  bind(root: Node, seed: number): void {
    this._root = root;
    this._rig = ensureRig(root);
    this._phase = seed * 1.618 + Math.random() * 6.28;
    this._t = Math.random() * 4;
    this._sx = this._sy = this._sz = 0;
    this._vx = this._vy = this._vz = 0;
    this._rx = this._ry = this._rz = 0;
    this._vrx = this._vry = this._vrz = 0;
    this._blinkWait = 1.2 + Math.random() * 2.2;
    this._blinkT = -1;
    this._lookWait = 0.6 + Math.random() * 1.4;
    this._jiggleWait = 1.6 + Math.random() * 2.8;
    this._appliedClose = 0;
    this._aimYaw = this._aimYawT = FACE_YAW;
    this._aimPitch = this._aimPitchT = FACE_PITCH;
    const faceRoot = this._rig ?? root;
    this._eyeL = bindFace(faceRoot, 'EyeL');
    this._eyeR = bindFace(faceRoot, 'EyeR');
    this._pupilL = bindFace(faceRoot, 'PupilL');
    this._pupilR = bindFace(faceRoot, 'PupilR');
    this._hiL = bindFace(faceRoot, 'HighlightL');
    this._hiR = bindFace(faceRoot, 'HighlightR');
    this._mouth = bindFace(faceRoot, 'Mouth');
    root.setRotationFromEuler(0, 0, 0);
    this._rig.setScale(1, 1, 1);
    this._rig.setRotationFromEuler(FACE_PITCH, FACE_YAW, 0);
  }

  punchPick(): void {
    this._impulse(-0.35, 1.1, -0.35, -4, 3, 2);
  }

  punchLand(): void {
    this._impulse(0.55, -0.85, 0.55, 5, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3);
  }

  punchInhale(): void {
    this.punchSpit();
  }

  punchSpit(): void {
    const side = clamp(wrapDeg(this._aimYawT - FACE_YAW) * 0.08, -6, 6);
    this._impulse(0.22, -0.62, -0.48, 7, side + (Math.random() - 0.5) * 2, -side * 0.45);
  }

  /** Point the mouth at a world-space brick. */
  aimAt(world: Vec3): void {
    const root = this._root;
    if (!root?.isValid) return;
    root.inverseTransformPoint(_aimLocal, world);
    const dx = _aimLocal.x;
    const dy = _aimLocal.y;
    const dz = _aimLocal.z;
    const horiz = Math.hypot(dx, dz);
    if (horiz < 1e-4) return;
    const yawOff = clamp(wrapDeg(Math.atan2(dx, dz) * RAD2DEG - FACE_YAW), -AIM_YAW_MAX, AIM_YAW_MAX);
    const geoPitch = -Math.atan2(dy, horiz) * RAD2DEG;
    this._aimYawT = FACE_YAW + yawOff;
    this._aimPitchT = FACE_PITCH + clamp(geoPitch - FACE_PITCH, AIM_PITCH_LO, AIM_PITCH_HI);
  }

  punchEat(): void {
    this._impulse(0.5, -0.7, 0.22, 5, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3);
  }

  punchMerge(): void {
    this._impulse(-0.45, 1.2, -0.45, -3, (Math.random() - 0.5) * 6, 4);
  }

  tick(dt: number, state: AnimState, inflight = 0): void {
    const root = this._root;
    if (!root?.isValid) return;
    const step = Math.min(dt, 0.05);
    this._t += step;

    [this._sx, this._vx] = spring(this._sx, this._vx, step);
    [this._sy, this._vy] = spring(this._sy, this._vy, step);
    [this._sz, this._vz] = spring(this._sz, this._vz, step);
    [this._rx, this._vrx] = spring(this._rx, this._vrx, step);
    [this._ry, this._vry] = spring(this._ry, this._vry, step);
    [this._rz, this._vrz] = spring(this._rz, this._vrz, step);
    this._sx = clamp(this._sx, -SQUASH_LIM, SQUASH_LIM);
    this._sy = clamp(this._sy, -SQUASH_LIM, SQUASH_LIM);
    this._sz = clamp(this._sz, -SQUASH_LIM, SQUASH_LIM);
    this._rx = clamp(this._rx, -ROT_LIM, ROT_LIM);
    this._ry = clamp(this._ry, -ROT_LIM, ROT_LIM);
    this._rz = clamp(this._rz, -ROT_LIM, ROT_LIM);

    this._tickAim(step, state);

    const firing = state === 'attack' && inflight > 0;
    const excited = state === 'drag' || firing;
    const freq = state === 'drag' ? 5.2 : firing ? 8.4 : state === 'attack' ? 2.8 : 2.15;
    const amp = state === 'drag' ? 0.055 : firing ? 0.055 : 0.04;
    const breath = Math.sin(this._t * freq + this._phase);
    const side = Math.sin(this._t * (freq * 0.62) + this._phase * 1.37);
    const spit = firing ? 0.5 + 0.5 * Math.sin(this._t * 12.6 + this._phase) : 0;
    const turn = wrapDeg(this._aimYaw - FACE_YAW);

    const sx = clamp(1 + breath * amp + side * amp * 0.22 + this._sx + spit * 0.03, SCALE_MIN, SCALE_MAX);
    const sy = clamp(1 - breath * amp * 1.05 + this._sy - spit * 0.04, SCALE_MIN, SCALE_MAX);
    const sz = clamp(1 + breath * amp * 0.7 - side * amp * 0.16 + this._sz + spit * 0.09, SCALE_MIN, SCALE_MAX);
    const sway = state === 'drag' ? 7.5 : firing ? 1.4 : 3.6;
    const lean = firing ? 9 + spit * 5 : state === 'attack' ? 4.5 : state === 'drag' ? -4.5 : 1.4;
    const pitch = clamp(lean + Math.sin(this._t * 1.15 + this._phase) * (excited ? 2.4 : 1.8) + this._rx, -16, 16);
    const yaw = clamp(Math.sin(this._t * 1.28 + this._phase * 0.7) * sway + this._ry, -16, 16);
    const roll = clamp(
      Math.sin(this._t * 0.92 + this._phase * 1.8) * sway * 0.55 + this._rz + turn * 0.12,
      -14,
      14,
    );
    const rig = this._rig ?? root;
    rig.setScale(sx, sy, sz);
    rig.setRotationFromEuler(this._aimPitch + pitch, this._aimYaw + yaw, roll);

    this._tickIdleJiggle(step, state, firing);
    this._tickLook(step, state);
    this._tickBlink(step);
    this._tickMouth(spit);
  }

  private _tickMouth(spit: number): void {
    const mouth = this._mouth;
    if (!mouth) return;
    mouth.node.setScale(
      mouth.sx * (1 + spit * 0.2),
      mouth.sy * (1 + spit * 0.2),
      mouth.sz * (1 + spit * 0.06),
    );
  }

  private _impulse(dx: number, dy: number, dz: number, drx: number, dry: number, drz: number): void {
    this._vx = clamp(this._vx + dx, -VEL_LIM, VEL_LIM);
    this._vy = clamp(this._vy + dy, -VEL_LIM, VEL_LIM);
    this._vz = clamp(this._vz + dz, -VEL_LIM, VEL_LIM);
    this._vrx = clamp(this._vrx + drx, -ANG_LIM, ANG_LIM);
    this._vry = clamp(this._vry + dry, -ANG_LIM, ANG_LIM);
    this._vrz = clamp(this._vrz + drz, -ANG_LIM, ANG_LIM);
  }

  private _tickIdleJiggle(dt: number, state: AnimState, sucking: boolean): void {
    if (state === 'drag' || sucking) return;
    this._jiggleWait -= dt;
    if (this._jiggleWait > 0) return;
    this._jiggleWait = 2.2 + Math.random() * 3.2;
    this._impulse(
      (Math.random() - 0.5) * 0.9,
      Math.random() * 0.8 + 0.25,
      (Math.random() - 0.5) * 0.9,
      (Math.random() - 0.5) * 5,
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 5,
    );
  }

  private _tickAim(dt: number, state: AnimState): void {
    if (state !== 'attack') {
      this._aimYawT = FACE_YAW;
      this._aimPitchT = FACE_PITCH;
    }
    const k = 1 - Math.exp(-AIM_RATE * dt);
    this._aimYaw += wrapDeg(this._aimYawT - this._aimYaw) * k;
    this._aimPitch += (this._aimPitchT - this._aimPitch) * k;
  }

  private _tickLook(dt: number, state: AnimState): void {
    this._lookWait -= dt;
    if (state === 'attack') {
      this._lookTX = clamp(wrapDeg(this._aimYaw - FACE_YAW) / 48, -0.85, 0.85);
      if (this._lookWait <= 0) {
        this._lookTY = 0.22 + Math.random() * 0.4;
        this._lookWait = 0.7 + Math.random() * 1.8;
      }
    } else if (this._lookWait <= 0) {
      if (state === 'drag') {
        this._lookTX = (Math.random() - 0.5) * 0.9;
        this._lookTY = 0.15 + Math.random() * 0.45;
      } else {
        this._lookTX = (Math.random() - 0.5) * 1.1;
        this._lookTY = (Math.random() - 0.5) * 0.7;
      }
      this._lookWait = 0.7 + Math.random() * 1.8;
    }
    this._lookX += (this._lookTX - this._lookX) * Math.min(1, dt * 4.5);
    this._lookY += (this._lookTY - this._lookY) * Math.min(1, dt * 4.5);
  }

  private _tickBlink(dt: number): void {
    if (this._blinkT < 0) {
      this._blinkWait -= dt;
      if (this._blinkWait <= 0) {
        this._blinkT = 0;
        this._wink = Math.random() < 0.18 ? (Math.random() < 0.5 ? 1 : 2) : 0;
        this._blinkAgain = this._wink === 0 && Math.random() < 0.28;
        this._blinkWait = 1.6 + Math.random() * 2.8;
      }
    } else {
      this._blinkT += dt;
      if (this._blinkT >= 0.11) {
        if (this._blinkAgain) {
          this._blinkAgain = false;
          this._blinkT = 0;
          this._wink = 0;
        } else {
          this._blinkT = -1;
        }
      }
    }

    const close = this._blinkAmount();
    const lookMoved =
      Math.abs(this._lookX - this._lookTX) > 0.002 || Math.abs(this._lookY - this._lookTY) > 0.002;
    if (close === 0 && this._appliedClose === 0 && !lookMoved) return;
    this._appliedClose = close;
    this._applyEye(this._eyeL, this._hiL, this._wink === 2 ? 0 : close);
    this._applyEye(this._eyeR, this._hiR, this._wink === 1 ? 0 : close);
    this._applyPupil(this._pupilL, -1, this._wink === 2 ? 0 : close);
    this._applyPupil(this._pupilR, 1, this._wink === 1 ? 0 : close);
  }

  private _blinkAmount(): number {
    if (this._blinkT < 0) return 0;
    const u = this._blinkT / 0.11;
    if (u < 0.42) return u / 0.42;
    return 1 - (u - 0.42) / 0.58;
  }

  private _applyEye(eye: Face | null, hi: Face | null, close: number): void {
    if (!eye) return;
    const lid = 1 - close * 0.9;
    eye.node.setScale(eye.sx, eye.sy * lid, eye.sz);
    if (!hi) return;
    hi.node.setScale(hi.sx, hi.sy * lid, hi.sz);
    hi.node.setPosition(hi.px, hi.py - close * 0.006, hi.pz);
  }

  private _applyPupil(face: Face | null, side: number, close: number): void {
    if (!face) return;
    const ox = this._lookX * 0.012 + side * 0.0015;
    const oy = this._lookY * 0.008 - close * 0.01;
    face.node.setPosition(face.px + ox, face.py + oy, face.pz);
    const lid = 1 - close * 0.72;
    face.node.setScale(face.sx, face.sy * lid, face.sz);
  }
}
