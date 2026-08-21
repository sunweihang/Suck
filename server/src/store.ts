import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.ts';
import { ITEM_IDS, LIMITS, type PlayerItems, type PlayerRow, type PlayerSave, type SessionRow } from './types.ts';

type Disk = {
  players: Record<string, PlayerRow>;
  sessions: Record<string, SessionRow>;
};

const emptyItems = (): PlayerItems => ({
  shuffle: 0,
  hook: 0,
  shovel: 0,
  bomb: 0,
});

export function defaultSave(now = Date.now()): PlayerSave {
  return {
    level: 1,
    coins: 200,
    items: emptyItems(),
    rev: 0,
    updatedAt: now,
  };
}

function blank(): Disk {
  return { players: {}, sessions: {} };
}

export class Store {
  private file: string;
  private disk: Disk;

  constructor(dir = config.dataDir) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'store.json');
    this.disk = this.read();
  }

  private read(): Disk {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Disk;
      return {
        players: raw.players && typeof raw.players === 'object' ? raw.players : {},
        sessions: raw.sessions && typeof raw.sessions === 'object' ? raw.sessions : {},
      };
    } catch {
      return blank();
    }
  }

  private flush(): void {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.disk));
    renameSync(tmp, this.file);
  }

  getPlayer(openid: string): PlayerRow | undefined {
    return this.disk.players[openid];
  }

  upsertPlayer(row: PlayerRow): PlayerRow {
    this.disk.players[row.openid] = row;
    this.flush();
    return row;
  }

  putSession(row: SessionRow): void {
    this.disk.sessions[row.token] = row;
    this.flush();
  }

  getSession(token: string): SessionRow | undefined {
    const row = this.disk.sessions[token];
    if (!row) return undefined;
    if (row.expiresAt <= Date.now()) {
      delete this.disk.sessions[token];
      this.flush();
      return undefined;
    }
    return row;
  }

}

export function publicSave(row: PlayerRow): PlayerSave {
  return {
    level: row.save.level,
    coins: row.save.coins,
    items: { ...emptyItems(), ...row.save.items },
    rev: row.save.rev,
    updatedAt: row.save.updatedAt,
  };
}

export function clampSave(raw: Partial<PlayerSave> | undefined, prev: PlayerSave): PlayerSave | null {
  if (!raw || typeof raw !== 'object') return null;
  const level = Math.floor(Number(raw.level));
  const coins = Math.floor(Number(raw.coins));
  if (!Number.isFinite(level) || !Number.isFinite(coins)) return null;
  const items = emptyItems();
  const src = raw.items && typeof raw.items === 'object' ? raw.items : prev.items;
  for (const id of ITEM_IDS) {
    const n = Math.floor(Number((src as PlayerItems)[id]));
    items[id] = Number.isFinite(n) ? Math.max(0, Math.min(LIMITS.maxItem, n)) : 0;
  }
  return {
    level: Math.max(1, Math.min(LIMITS.maxLevel, level)),
    coins: Math.max(0, Math.min(LIMITS.maxCoins, coins)),
    items,
    rev: prev.rev,
    updatedAt: prev.updatedAt,
  };
}
