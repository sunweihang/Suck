import { GAME } from './GameConfig';

let left = 0;

export function freeSpinLeft(): number {
  return left;
}

export function freeSpinOn(): boolean {
  return left > 0;
}

export function grantFreeSpin(sec = GAME.freeSpinSec): void {
  left = Math.max(0, left) + Math.max(0, sec);
}

export function tickFreeSpin(dt: number, playing: boolean): void {
  if (!playing || left <= 0) return;
  left = Math.max(0, left - dt);
}
