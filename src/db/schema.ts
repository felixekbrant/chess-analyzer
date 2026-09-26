import Dexie, { type Table } from 'dexie';
import type { GameAnalysis, Puzzle, Settings, StoredGame } from '../lib/types';
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

export interface KV<T = unknown> {
  key: string;
  value: T;
}

export class ChessDB extends Dexie {
  games!: Table<StoredGame, string>;
  analyses!: Table<GameAnalysis, string>;
  summaries!: Table<GameSummary, string>;
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
