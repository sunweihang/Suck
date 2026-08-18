import { Vec3 } from 'cc';
import { SPECIAL_SPAN } from '../game/GameConfig';

export const OCTOPUS_STAND_Y = 0.012;
export const OCTO_POWER_LOCAL = new Vec3(0, 0.4, -0.06);
/** Body centroid. Keep Z at 0 so the blob stays in the window, not behind the wall. */
export const OCTO_BODY_LOCAL = new Vec3(0, 0.26716, 0);
/** Main blob radius from bake-toy-prefabs. */
const OCTO_BODY_R = 0.148;
/** How much of the 4-cell cage the body should fill. */
const OCTO_CAGE_FILL = 0.86;
export const OCTO_CAGE_SCALE = (SPECIAL_SPAN * OCTO_CAGE_FILL) / (2 * OCTO_BODY_R);
