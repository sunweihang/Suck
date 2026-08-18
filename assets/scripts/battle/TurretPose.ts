import { Node } from 'cc';
import { TURRET_FIRE_LOCAL, TURRET_PITCH_DEG, TURRET_YAW_DEG } from './ToyLook';

const turretEuler = { x: TURRET_PITCH_DEG, y: TURRET_YAW_DEG, z: 0 };

export function getTurretEuler(): { x: number; y: number; z: number } {
  return turretEuler;
}

function bodyOf(host: Node): Node | null {
  return host.getChildByName('Body') ?? host.getChildByName('Rig')?.getChildByName('Body') ?? null;
}

function mouthOf(host: Node): Node | null {
  return host.getChildByName('Mouth')
    ?? host.getChildByName('Rig')?.getChildByName('Mouth')
    ?? bodyOf(host)?.getChildByName('Mouth')
    ?? null;
}

/** Pitch +45° around X so the barrel sits up; no yaw. */
export function applyTurretPose(host: Node): void {
  const rig = host.getChildByName('Rig');
  if (rig) {
    rig.setPosition(0, 0, 0);
    rig.setRotationFromEuler(0, 0, 0);
    rig.setScale(1, 1, 1);
  }
  const body = bodyOf(host);
  if (body) {
    body.setPosition(0, 0, 0);
    body.setRotationFromEuler(TURRET_PITCH_DEG, TURRET_YAW_DEG, 0);
    body.setScale(1, 1, 1);
  }
  const mouth = mouthOf(host);
  if (!mouth || !body) return;
  if (mouth.parent !== body) mouth.setParent(body, false);
  mouth.setPosition(TURRET_FIRE_LOCAL);
  mouth.setRotationFromEuler(0, 0, 0);
}
