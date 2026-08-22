import { GAME } from './GameConfig';

/** Rewarded-ad boost; shown on the HUD timer. */
let left = 0;
/** Auto boost from end-of-level auto-place; level-scoped, no HUD timer. */
let autoLeft = 0;

export function boostLeft(): number {
  return left;
}

export function boostOn(): boolean {
  return left > 0 || autoLeft > 0;
}

export function boostMul(): number {
  return boostOn() ? GAME.boostMul : 1;
}

export function grantBoost(sec = GAME.boostSec): void {
  left = Math.max(0, left) + Math.max(0, sec);
}

export function grantAutoBoost(sec = GAME.boostSec): void {
  autoLeft = Math.max(autoLeft, Math.max(0, sec));
}

export function clearAutoBoost(): void {
  autoLeft = 0;
}

export function tickBoost(dt: number, playing: boolean): void {
  if (!playing) return;
  if (left > 0) left = Math.max(0, left - dt);
  if (autoLeft > 0) autoLeft = Math.max(0, autoLeft - dt);
}
