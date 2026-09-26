import Dexie, { type Table } from 'dexie';
import type { GameAnalysis, NewGame, Puzzle, Settings, StoredGame } from '../lib/types';
import { buildSummary, type GameSummary } from '../lib/insights/summary';
import { DEFAULT_SETTINGS } from '../lib/types';

export interface SyncState {
  username: string;
  /** Archive URLs of months that were already complete when fetched; never refetched. */
  completedMonths: string[];
  /** year*12+month of the oldest archive imported; later syncs cover everything from here on. */
  oldestMonth?: number;
  lastSync?: number;
  lastError?: string;
}

export interface PgnRow {
  gameId: string;
  pgn: string;
}

export interface KV<T = unknown> {
  key: string;
  value: T;
}

export class ChessDB extends Dexie {
  games!: Table<StoredGame, string>;
  analyses!: Table<GameAnalysis, string>;
  summaries!: Table<GameSummary, string>;
  pgns!: Table<PgnRow, string>;
  puzzles!: Table<Puzzle, string>;
  sync!: Table<SyncState, string>;
  kv!: Table<KV, string>;

  constructor(name = 'chess-analyzer') {
    super(name);
    this.version(1).stores({
      games: 'id, endTime, analysisStatus, timeClass, userResult, eco',
      analyses: 'gameId',
      puzzles: 'id, due, phase',
      sync: 'username',
      kv: 'key',
    });
    // v2: compact per-game summaries so insights don't need to load every full analysis.
    this.version(2)
      .stores({ summaries: 'gameId' })
      .upgrade(async (tx) => {
        const colors = new Map<string, StoredGame['userColor']>();
        await tx
          .table<StoredGame, string>('games')
          .toCollection()
          .each((g) => void colors.set(g.id, g.userColor));
        const out: GameSummary[] = [];
        await tx
          .table<GameAnalysis, string>('analyses')
          .toCollection()
          .each((a) => {
            const c = colors.get(a.gameId);
            if (c) out.push(buildSummary(a, c));
          });
        await tx.table('summaries').bulkPut(out);
        // "running" is no longer stored on games (the queue tracks it in memory).
        await tx
          .table<StoredGame, string>('games')
          .where('analysisStatus')
          .equals('running')
          .modify({ analysisStatus: 'pending' });
      });
    // v3: PGN text moves out of the games table. Game lists (and every live query on them) then
    // read ~5x less data, which matters on phones with hundreds of games.
    this.version(3)
      .stores({ pgns: 'gameId' })
      .upgrade(async (tx) => {
        const rows: PgnRow[] = [];
        await tx
          .table('games')
          .toCollection()
          .modify((g: StoredGame & { pgn?: string }) => {
            if (g.pgn) rows.push({ gameId: g.id, pgn: g.pgn });
            delete g.pgn;
          });
        await tx.table('pgns').bulkPut(rows);
      });
  }
}

export const db = new ChessDB();

export async function getSettings(): Promise<Settings> {
  const row = await db.kv.get('settings');
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await db.kv.put({ key: 'settings', value: next });
  return next;
}

/** Splits built games into the games and pgns tables. Existing games are left untouched. Returns how many were new. */
export async function addGames(database: ChessDB, games: NewGame[]): Promise<number> {
  if (!games.length) return 0;
  return database.transaction('rw', database.games, database.pgns, async () => {
    const existing = new Set((await database.games.bulkGet(games.map((g) => g.id))).filter(Boolean).map((g) => g!.id));
    const fresh = games.filter((g) => !existing.has(g.id));
    await database.games.bulkAdd(fresh.map(withoutPgn));
    await database.pgns.bulkPut(fresh.map((g) => ({ gameId: g.id, pgn: g.pgn })));
    return fresh.length;
  });
}

export function withoutPgn(g: NewGame): StoredGame {
  const { pgn: _pgn, ...rest } = g;
  void _pgn;
  return rest;
}

export async function getPgn(database: ChessDB, gameId: string): Promise<string | undefined> {
  return (await database.pgns.get(gameId))?.pgn;
}
