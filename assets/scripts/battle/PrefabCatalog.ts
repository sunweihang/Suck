import { ColorToken } from '../game/GameConfig';

type PrefabKey =
  | 'Slot'
  | 'Ground'
  | 'Debris'
  | 'HintHand'
  | 'LockNails'
  | 'LockChain'
  | 'IronPlate'
  | 'HomePanel'
  | 'VictoryPanel'
  | 'FailPanel'
  | 'ItemShopPanel'
  | 'SettingsPanel'
  | 'Chest'
  | 'Baozha'
  | 'Xingxing'
  | 'Shuaxin'
  | 'InkShot';

/** uuid + bundle path. Paths are relative to the `prefabs` bundle. */
const PREFAB_ROWS: readonly (readonly [PrefabKey, string, string])[] = [
  ['Slot', '7e22bb20-0007-4b02-8002-000000000007', 'board/Slot'],
  ['Ground', '7e22bb20-0008-4b02-8002-000000000008', 'board/Ground'],
  ['Debris', '7e22bb20-0009-4b02-8002-000000000009', 'fx/Debris'],
  ['HintHand', '7e22bb20-000a-4b02-8002-00000000000a', 'board/HintHand'],
  ['LockNails', '7e22bb20-0031-4b02-8002-000000000031', 'board/LockNails'],
  ['LockChain', '7e22bb20-0033-4b02-8002-000000000033', 'board/LockChain'],
  ['IronPlate', '7e22bb20-0032-4b02-8002-000000000032', 'board/IronPlate'],
  ['HomePanel', '7e22bb20-0040-4b02-8002-000000000040', 'ui/HomePanel'],
  ['VictoryPanel', '7e22bb20-0041-4b02-8002-000000000041', 'ui/VictoryPanel'],
  ['FailPanel', '7e22bb20-0042-4b02-8002-000000000042', 'ui/FailPanel'],
  ['ItemShopPanel', '7e22bb20-0043-4b02-8002-000000000043', 'ui/ItemShopPanel'],
  ['SettingsPanel', '7e22bb20-0044-4b02-8002-000000000044', 'ui/SettingsPanel'],
  ['Chest', '84174c78-c604-437f-bfd2-f914ec17b899', 'board/Chest'],
  ['Baozha', '758f9311-08b5-4b56-928a-b6c60a832690', 'fx/Baozha'],
  ['Xingxing', 'd72d75b5-3b32-42c2-9eff-33153126dca6', 'fx/Xingxing'],
  ['Shuaxin', '29821b8d-1014-439d-81ef-9f11e3487797', 'fx/Shuaxin'],
  ['InkShot', '7e22bb20-0035-4b02-8002-000000000035', 'fx/InkShot'],
];

function colMap(col: 1 | 2): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < PREFAB_ROWS.length; i++) out[PREFAB_ROWS[i][0]] = PREFAB_ROWS[i][col];
  return out;
}

const UUID_BY_KEY = colMap(1);
const PATH_BY_KEY = colMap(2);

export const PREFAB_UUID = {
  Slot: UUID_BY_KEY['Slot'],
  Ground: UUID_BY_KEY['Ground'],
  Debris: UUID_BY_KEY['Debris'],
  HintHand: UUID_BY_KEY['HintHand'],
  LockNails: UUID_BY_KEY['LockNails'],
  LockChain: UUID_BY_KEY['LockChain'],
  IronPlate: UUID_BY_KEY['IronPlate'],
  HomePanel: UUID_BY_KEY['HomePanel'],
  VictoryPanel: UUID_BY_KEY['VictoryPanel'],
  FailPanel: UUID_BY_KEY['FailPanel'],
  ItemShopPanel: UUID_BY_KEY['ItemShopPanel'],
  SettingsPanel: UUID_BY_KEY['SettingsPanel'],
  Chest: UUID_BY_KEY['Chest'],
  Baozha: UUID_BY_KEY['Baozha'],
  Xingxing: UUID_BY_KEY['Xingxing'],
  Shuaxin: UUID_BY_KEY['Shuaxin'],
  InkShot: UUID_BY_KEY['InkShot'],
} as const;

export function prefabUuid(key: string): string {
  return UUID_BY_KEY[key] || '';
}

export function prefabPath(key: string): string {
  return PATH_BY_KEY[key] || '';
}

/** Packed `token|uuid|path` rows. String keys survive WeChat minify; `{ g: ... }` does not. */
function parseRows(packed: string): {
  tokens: string[];
  uuid: Record<string, string>;
  path: Record<string, string>;
} {
  const tokens: string[] = [];
  const uuid: Record<string, string> = Object.create(null);
  const path: Record<string, string> = Object.create(null);
  const rows = packed.split(';');
  for (let i = 0; i < rows.length; i++) {
    const parts = rows[i].split('|');
    const token = parts[0];
    if (!token) continue;
    tokens.push(token);
    uuid[token] = parts[1] || '';
    path[token] = parts[2] || '';
  }
  return { tokens, uuid, path };
}

const BLOCKS = parseRows(
  'o|7e22bb20-0001-4b02-8002-000000000001|blocks/BlockOrange;' +
    'y|7e22bb20-0011-4b02-8002-000000000011|blocks/BlockYellow;' +
    'c|7e22bb20-0002-4b02-8002-000000000002|blocks/BlockCyan;' +
    'g|7e22bb20-0012-4b02-8002-000000000012|blocks/BlockLime;' +
    'p|7e22bb20-0013-4b02-8002-000000000013|blocks/BlockPink;' +
    'v|7e22bb20-0014-4b02-8002-000000000014|blocks/BlockViolet;' +
    'r|7e22bb20-0015-4b02-8002-000000000015|blocks/BlockRed;' +
    's|7e22bb20-0016-4b02-8002-000000000016|blocks/BlockSky;' +
    'k|7e22bb20-0003-4b02-8002-000000000003|blocks/BlockCoral;' +
    'm|7e22bb20-0018-4b02-8002-000000000018|blocks/BlockMint;' +
    'a|7e22bb20-0019-4b02-8002-000000000019|blocks/BlockMagenta;' +
    'd|7e22bb20-001a-4b02-8002-00000000001a|blocks/BlockGold',
);

const UNITS = parseRows(
  'o|7e22bb20-0004-4b02-8002-000000000004|units/UnitOrange;' +
    'y|7e22bb20-0021-4b02-8002-000000000021|units/UnitYellow;' +
    'c|7e22bb20-0005-4b02-8002-000000000005|units/UnitCyan;' +
    'g|7e22bb20-0022-4b02-8002-000000000022|units/UnitLime;' +
    'p|7e22bb20-0023-4b02-8002-000000000023|units/UnitPink;' +
    'v|7e22bb20-0024-4b02-8002-000000000024|units/UnitViolet;' +
    'r|7e22bb20-0025-4b02-8002-000000000025|units/UnitRed;' +
    's|7e22bb20-0026-4b02-8002-000000000026|units/UnitSky;' +
    'k|7e22bb20-0006-4b02-8002-000000000006|units/UnitCoral;' +
    'm|7e22bb20-0028-4b02-8002-000000000028|units/UnitMint;' +
    'a|7e22bb20-0029-4b02-8002-000000000029|units/UnitMagenta;' +
    'd|7e22bb20-002a-4b02-8002-00000000002a|units/UnitGold',
);

export function allPrefabTokens(): string[] {
  return BLOCKS.tokens.slice();
}

export const BLOCK_PREFAB = BLOCKS.uuid as Record<ColorToken, string>;
export const UNIT_PREFAB = UNITS.uuid as Record<ColorToken, string>;

export function blockPrefabUuid(token: string): string {
  return BLOCKS.uuid[token] || BLOCKS.uuid['o'] || '';
}

export function unitPrefabUuid(token: string): string {
  return UNITS.uuid[token] || UNITS.uuid['o'] || '';
}

export function blockPrefabPath(token: string): string {
  return BLOCKS.path[token] || BLOCKS.path['o'] || '';
}

export function unitPrefabPath(token: string): string {
  return UNITS.path[token] || UNITS.path['o'] || '';
}
