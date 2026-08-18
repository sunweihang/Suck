import { Vec3 } from 'cc';
import { SPECIAL_SPAN } from '../game/GameConfig';

export const OCTOPUS_STAND_Y = 0.018;
/** Visual size vs the baked 0.4-wide shooter so slots match the original chunk. */
export const TURRET_SCALE = 1.52;
/** Raise the barrel around X by 45° (top tilts toward camera). */
export const TURRET_PITCH_DEG = 45;
export const TURRET_YAW_DEG = 0;
export const OCTO_POWER_LOCAL = new Vec3(0, 0.22, 0.16);
/** Sit on the shooter lid (max Y 0.376). Label is rotated +90° X to lie flat. */
export const TURRET_POWER_LOCAL = new Vec3(0, 0.382, 0);
export const TURRET_MUZZLE_LOCAL = new Vec3(0, 0.376, 0.023);
/** Same as the barrel tip once the body is pitched. */
export const TURRET_FIRE_LOCAL = TURRET_MUZZLE_LOCAL;
/** Body centroid. Keep Z at 0 so the blob stays in the window, not behind the wall. */
export const OCTO_BODY_LOCAL = new Vec3(0, 0.188, 0);
const OCTO_BODY_R = 0.2;
const OCTO_CAGE_FILL = 0.86;
export const OCTO_CAGE_SCALE = (SPECIAL_SPAN * OCTO_CAGE_FILL) / (2 * OCTO_BODY_R);
