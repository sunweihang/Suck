import { Quat, Vec3 } from 'cc';
import { SPECIAL_SPAN } from '../game/GameConfig';

export const OCTOPUS_STAND_Y = 0.018;
/** Visual size vs the baked 0.4-wide shooter so slots match the original chunk. */
export const TURRET_SCALE = 1.68;
/** Raise the barrel around X by 45° (top tilts toward camera). */
export const TURRET_PITCH_DEG = 45;
export const TURRET_YAW_DEG = 0;
export const OCTO_POWER_LOCAL = new Vec3(0, 0.22, 0.16);
/** Sit on the shooter lid (max Y 0.376). Label is rotated +90° X to lie flat. */
export const TURRET_POWER_LOCAL = new Vec3(0, 0.382, 0);
export const TURRET_MUZZLE_LOCAL = new Vec3(0, 0.376, 0.023);
/** After the 45° sit, the lid faces the camera (the number). Visual neck is along camera-up. */
export const TURRET_MUZZLE_LEN = 0.30;
const _invRest = new Quat();
const _camUpDef = new Vec3(0, 0.9063, -0.4226);
Quat.fromEuler(_invRest, -TURRET_PITCH_DEG, -TURRET_YAW_DEG, 0);

/** Body-local mouth: rest pose puts it at the on-screen neck, not the forehead. */
export function turretFireLocal(out: Vec3, camUp?: Readonly<Vec3>): Vec3 {
  out.set(camUp?.x ?? _camUpDef.x, camUp?.y ?? _camUpDef.y, camUp?.z ?? _camUpDef.z);
  Vec3.transformQuat(out, out, _invRest);
  const len = Math.sqrt(out.x * out.x + out.y * out.y + out.z * out.z) || 1;
  const s = TURRET_MUZZLE_LEN / len;
  out.x *= s;
  out.y *= s;
  out.z *= s;
  return out;
}

export const TURRET_FIRE_LOCAL = turretFireLocal(new Vec3());
/** Body centroid. Keep Z at 0 so the blob stays in the window, not behind the wall. */
export const OCTO_BODY_LOCAL = new Vec3(0, 0.188, 0);
const OCTO_BODY_R = 0.2;
const OCTO_CAGE_FILL = 0.86;
export const OCTO_CAGE_SCALE = (SPECIAL_SPAN * OCTO_CAGE_FILL) / (2 * OCTO_BODY_R);
