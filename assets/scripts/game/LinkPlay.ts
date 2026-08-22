import { sys } from 'cc';
import { ALL_COLOR_TOKENS, TOKEN_RGB, type ColorToken } from './GameConfig';
import { notifyPlayerDirty } from '../net/PlayerCloud';

/** Clear this many official stages to unlock 连线. */
export const LINK_UNLOCK_AFTER = 5;
export const LINK_LEVEL_COUNT = 40;
export const LINK_GOLD = 5;

const SAVE_KEY = 'suck.link.level';

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

export type LinkPoint = { r: number; c: number };

export type LinkBoard = {
  id: number;
  cols: number;
  rows: number;
  cells: number[];
};

export type LinkUnlockView = {
  have: number;
  need: number;
  remain: number;
  unlocked: boolean;
};

export function linkClearedOf(nextLevel: number): number {
  return Math.max(0, (nextLevel | 0) - 1);
}

export function isLinkUnlocked(nextLevel: number): boolean {
  return linkClearedOf(nextLevel) >= LINK_UNLOCK_AFTER;
}

export function linkUnlockRemain(nextLevel: number): number {
  return Math.max(0, LINK_UNLOCK_AFTER - linkClearedOf(nextLevel));
}

export function linkUnlockView(cleared: number): LinkUnlockView | null {
  const n = Math.max(0, cleared | 0);
  if (n <= 0 || n > LINK_UNLOCK_AFTER) return null;
  return {
    have: Math.min(n, LINK_UNLOCK_AFTER),
    need: LINK_UNLOCK_AFTER,
    remain: Math.max(0, LINK_UNLOCK_AFTER - n),
    unlocked: n >= LINK_UNLOCK_AFTER,
  };
}

export function loadLinkLevel(): number {
  try {
    const n = Number(sys.localStorage.getItem(SAVE_KEY));
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, n | 0);
  } catch {
    return 1;
  }
}

export function saveLinkLevel(n: number): void {
  try {
    sys.localStorage.setItem(SAVE_KEY, String(Math.max(1, n | 0)));
    notifyPlayerDirty();
  } catch (e) {
    console.warn('[LinkPlay] save failed', e);
  }
}

export function resetLinkProgress(): void {
  saveLinkLevel(1);
}

export function linkTokenOf(kind: number): ColorToken {
  const i = Math.max(0, (kind | 0) - 1);
  return ALL_COLOR_TOKENS[i % ALL_COLOR_TOKENS.length];
}

export function linkRgbOf(kind: number): readonly [number, number, number] {
  return TOKEN_RGB[linkTokenOf(kind)];
}

export function remainingPairs(cells: readonly number[]): number {
  let n = 0;
  for (let i = 0; i < cells.length; i++) if (cells[i] > 0) n += 1;
  return n >> 1;
}

function cellAt(cells: readonly number[], rows: number, cols: number, r: number, c: number): number {
  if (r < 0 || c < 0 || r >= rows || c >= cols) return 0;
  return cells[r * cols + c];
}

function walkable(
  cells: readonly number[],
  rows: number,
  cols: number,
  r: number,
  c: number,
  er: number,
  ec: number,
): boolean {
  if (r === er && c === ec) return true;
  if (r < -1 || c < -1 || r > rows || c > cols) return false;
  return cellAt(cells, rows, cols, r, c) === 0;
}

/**
 * 连连看：两端同色，路径最多两个拐角，可绕出棋盘一圈空边。
 */
export function findLinkPath(
  cells: readonly number[],
  rows: number,
  cols: number,
  a: number,
  b: number,
): LinkPoint[] | null {
  if (a === b || a < 0 || b < 0 || a >= cells.length || b >= cells.length) return null;
  const kind = cells[a];
  if (kind <= 0 || cells[b] !== kind) return null;
  const r0 = (a / cols) | 0;
  const c0 = a % cols;
  const r1 = (b / cols) | 0;
  const c1 = b % cols;

  type Step = { r: number; c: number; dir: number; turns: number; prev: number };
  const q: Step[] = [{ r: r0, c: c0, dir: -1, turns: 0, prev: -1 }];
  const best = new Uint8Array((rows + 3) * (cols + 3) * 4);
  best.fill(255);
  const mark = (r: number, c: number, dir: number, turns: number): boolean => {
    if (dir < 0) return false;
    const i = ((r + 1) * (cols + 3) + (c + 1)) * 4 + dir;
    if (best[i] <= turns) return false;
    best[i] = turns;
    return true;
  };

  let head = 0;
  while (head < q.length) {
    const cur = q[head];
    if (cur.r === r1 && cur.c === c1 && head > 0) {
      const path: LinkPoint[] = [];
      let i = head;
      while (i >= 0) {
        const s = q[i];
        path.push({ r: s.r, c: s.c });
        i = s.prev;
      }
      path.reverse();
      return path;
    }
    for (let d = 0; d < 4; d++) {
      const turns = cur.dir < 0 || cur.dir === d ? cur.turns : cur.turns + 1;
      if (turns > 2) continue;
      const nr = cur.r + DIRS[d][0];
      const nc = cur.c + DIRS[d][1];
      if (!walkable(cells, rows, cols, nr, nc, r1, c1)) continue;
      if (!mark(nr, nc, d, turns)) continue;
      q.push({ r: nr, c: nc, dir: d, turns, prev: head });
    }
    head += 1;
  }
  return null;
}

export function firstLinkMove(board: LinkBoard): [number, number] | null {
  const { cells, rows, cols } = board;
  const byKind = new Map<number, number[]>();
  for (let i = 0; i < cells.length; i++) {
    const k = cells[i];
    if (k <= 0) continue;
    const list = byKind.get(k);
    if (list) list.push(i);
    else byKind.set(k, [i]);
  }
  let found: [number, number] | null = null;
  byKind.forEach((spots) => {
    if (found) return;
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        if (findLinkPath(cells, rows, cols, spots[i], spots[j])) {
          found = [spots[i], spots[j]];
          return;
        }
      }
    }
  });
  return found;
}

export function isLinkSolvable(board: LinkBoard): boolean {
  const cells = board.cells.slice();
  const next: LinkBoard = { id: board.id, cols: board.cols, rows: board.rows, cells };
  while (remainingPairs(cells) > 0) {
    const mv = firstLinkMove(next);
    if (!mv) return false;
    cells[mv[0]] = 0;
    cells[mv[1]] = 0;
  }
  return true;
}

function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleIn<T>(list: T[], rnd: () => number): void {
  for (let i = list.length - 1; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const t = list[i];
    list[i] = list[j];
    list[j] = t;
  }
}

function specOf(id: number): { cols: number; rows: number; colors: number; empty: number } {
  const n = Math.max(1, id | 0);
  if (n <= 3) return { cols: 4, rows: 4, colors: 3, empty: 0 };
  if (n <= 8) return { cols: 6, rows: 4, colors: 4, empty: 0 };
  if (n <= 16) return { cols: 6, rows: 6, colors: 5, empty: 0 };
  if (n <= 24) return { cols: 8, rows: 6, colors: 6, empty: 2 };
  return { cols: 8, rows: 8, colors: 8, empty: 4 };
}

function placeReverse(cols: number, rows: number, colors: number, empty: number, rnd: () => number): number[] | null {
  const total = cols * rows;
  const pairs = ((total - empty) >> 1);
  if (pairs <= 0) return null;
  const cells = new Array<number>(total).fill(0);
  const kinds: number[] = [];
  for (let i = 0; i < pairs; i++) kinds.push(1 + (i % colors));
  shuffleIn(kinds, rnd);

  const empties: number[] = [];
  for (let i = 0; i < total; i++) empties.push(i);

  for (let p = 0; p < kinds.length; p++) {
    shuffleIn(empties, rnd);
    let put = false;
    for (let i = 0; i < empties.length && !put; i++) {
      for (let j = i + 1; j < empties.length; j++) {
        const a = empties[i];
        const b = empties[j];
        cells[a] = kinds[p];
        cells[b] = kinds[p];
        const ok = !!findLinkPath(cells, rows, cols, a, b);
        if (!ok) {
          cells[a] = 0;
          cells[b] = 0;
          continue;
        }
        empties.splice(j, 1);
        empties.splice(i, 1);
        put = true;
        break;
      }
    }
    if (!put) return null;
  }
  return cells;
}

function randomFill(cols: number, rows: number, colors: number, empty: number, rnd: () => number): number[] {
  const total = cols * rows;
  const pairs = (total - empty) >> 1;
  const cells = new Array<number>(total).fill(0);
  const slots: number[] = [];
  for (let i = 0; i < total; i++) slots.push(i);
  shuffleIn(slots, rnd);
  let k = 0;
  for (let p = 0; p < pairs; p++) {
    const kind = 1 + (p % colors);
    cells[slots[k++]] = kind;
    cells[slots[k++]] = kind;
  }
  return cells;
}

export function makeLinkBoard(id: number): LinkBoard {
  const n = Math.max(1, id | 0);
  if (n === 1) {
    return {
      id: 1,
      cols: 4,
      rows: 4,
      cells: [
        1, 1, 2, 2,
        3, 3, 1, 1,
        2, 2, 3, 3,
        4, 4, 4, 4,
      ],
    };
  }
  const spec = specOf(n);
  const rnd = mulberry(n * 10007 + 17);
  for (let t = 0; t < 16; t++) {
    const cells = placeReverse(spec.cols, spec.rows, spec.colors, spec.empty, rnd);
    if (!cells) continue;
    const board = { id: n, cols: spec.cols, rows: spec.rows, cells };
    if (isLinkSolvable(board)) return board;
  }
  for (let t = 0; t < 40; t++) {
    const cells = randomFill(spec.cols, spec.rows, spec.colors, spec.empty, rnd);
    const board = { id: n, cols: spec.cols, rows: spec.rows, cells };
    if (isLinkSolvable(board)) return board;
    shuffleLinkBoard(board, rnd);
    if (isLinkSolvable(board)) return board;
  }
  const cells = randomFill(spec.cols, spec.rows, spec.colors, spec.empty, rnd);
  return { id: n, cols: spec.cols, rows: spec.rows, cells };
}

export function shuffleLinkBoard(board: LinkBoard, rnd: () => number = Math.random): boolean {
  const kinds: number[] = [];
  const slots: number[] = [];
  for (let i = 0; i < board.cells.length; i++) {
    if (board.cells[i] <= 0) continue;
    kinds.push(board.cells[i]);
    slots.push(i);
    board.cells[i] = 0;
  }
  for (let t = 0; t < 24; t++) {
    shuffleIn(kinds, rnd);
    for (let i = 0; i < slots.length; i++) board.cells[slots[i]] = kinds[i];
    if (isLinkSolvable(board) || t === 23) return remainingPairs(board.cells) === 0 || !!firstLinkMove(board);
  }
  return !!firstLinkMove(board);
}

export function displayLinkLevel(id: number): number {
  return Math.max(1, id | 0);
}
