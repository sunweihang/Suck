import { GAME } from './GameConfig';

let left = 0;

export function boostLeft(): number {
  return left;
}

export function boostOn(): boolean {
  return left > 0;
}

export function boostMul(): number {
  return left > 0 ? 3 : 1;
}

export function grantBoost(sec = GAME.boostSec): void {
  left = Math.max(0, left) + Math.max(0, sec);
}

export function tickBoost(dt: number, playing: boolean): void {
  if (!playing || left <= 0) return;
  left = Math.max(0, left - dt);
}
