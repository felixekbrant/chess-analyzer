import type { ChessDB, SyncState } from '../../db/schema';
import { buildGameFromChessCom } from '../games/build';
import { ensureOpenings } from '../openings/eco';
import type { StoredGame } from '../types';
import { archiveMonth, fetchArchives, fetchMonth, gameIdFromUrl, isMonthComplete, type ChessComGame, type Fetcher } from './api';

export interface SyncProgress {
  phase: 'archives' | 'months' | 'done';
  monthsTotal: number;
  monthsDone: number;
  newGames: number;
}

export interface SyncOptions {
  /** Only import months within this many months back on the first sync. 0 = all history. */
  historyMonths: number;
  fetcher?: Fetcher;
  now?: number;
  onProgress?: (p: SyncProgress) => void;
}

/** Keeps archives within `historyMonths` of `now` (inclusive of the current month). */
export function selectArchives(archives: string[], historyMonths: number, now: number): string[] {
  if (!historyMonths) return archives;
  const d = new Date(now);
  const cutoff = d.getUTCFullYear() * 12 + d.getUTCMonth() - (historyMonths - 1);
  return archives.filter((url) => {
    const { year, month } = archiveMonth(url);
    return year * 12 + (month - 1) >= cutoff;
  });
}

/**
 * Incremental sync: months that were already complete when last fetched are skipped,
 * the current (and any unfinished) month is always refetched. Games are deduplicated by URL.
 */
export async function syncChessCom(db: ChessDB, username: string, opts: SyncOptions): Promise<number> {
  const now = opts.now ?? Date.now();
  const key = username.toLowerCase();
  const state: SyncState = (await db.sync.get(key)) ?? { username: key, completedMonths: [] };
  const report = (p: SyncProgress) => opts.onProgress?.(p);

  report({ phase: 'archives', monthsTotal: 0, monthsDone: 0, newGames: 0 });
  await ensureOpenings();
  let archives: string[];
  try {
    archives = await fetchArchives(username, opts.fetcher);
  } catch (e) {
    await db.sync.put({ ...state, lastError: (e as Error).message });
    throw e;
  }

  // The first sync honours the history limit; later syncs cover everything from the oldest month imported.
  const candidate =
    state.oldestMonth === undefined
      ? selectArchives(archives, opts.historyMonths, now)
      : archives.filter((u) => monthIndex(u) >= state.oldestMonth!);
  const todo = candidate.filter((u) => !state.completedMonths.includes(u));
  const oldestMonth = Math.min(state.oldestMonth ?? Infinity, ...candidate.map(monthIndex));

  let newGames = 0;
  const completed = new Set(state.completedMonths);
  // Newest first, so recent games show up quickly.
  const ordered = [...todo].reverse();
  for (let i = 0; i < ordered.length; i++) {
    const url = ordered[i];
    report({ phase: 'months', monthsTotal: ordered.length, monthsDone: i, newGames });
    const games = await fetchMonth(url, opts.fetcher);
    newGames += await storeGames(db, await buildInBatches(games, username));
    if (isMonthComplete(url, now)) completed.add(url);
  }

  await db.sync.put({
    username: key,
    completedMonths: [...completed],
    oldestMonth: Number.isFinite(oldestMonth) ? oldestMonth : undefined,
    lastSync: now,
    lastError: undefined,
  });
  report({ phase: 'done', monthsTotal: ordered.length, monthsDone: ordered.length, newGames });
  return newGames;
}

/** Imports an older range of history on request (e.g. "load 6 more months"). */
export async function syncMonths(db: ChessDB, username: string, archiveUrls: string[], fetcher?: Fetcher, now = Date.now()) {
  const key = username.toLowerCase();
  const state: SyncState = (await db.sync.get(key)) ?? { username: key, completedMonths: [] };
  const completed = new Set(state.completedMonths);
  await ensureOpenings();
  let added = 0;
  for (const url of archiveUrls) {
    if (completed.has(url)) continue;
    const games = await fetchMonth(url, fetcher);
    added += await storeGames(db, await buildInBatches(games, username));
    if (isMonthComplete(url, now)) completed.add(url);
  }
  const oldestMonth = Math.min(state.oldestMonth ?? Infinity, ...archiveUrls.map(monthIndex));
  await db.sync.put({ ...state, completedMonths: [...completed], oldestMonth: Number.isFinite(oldestMonth) ? oldestMonth : undefined });
  return added;
}

/** Converts archive entries, yielding to the browser every few games so a big import never freezes the UI. */
async function buildInBatches(games: ChessComGame[], username: string): Promise<(StoredGame | null)[]> {
  const out: (StoredGame | null)[] = [];
  for (let i = 0; i < games.length; i++) {
    out.push(buildGameFromChessCom(games[i], username));
    if (i % 40 === 39) await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

async function storeGames(db: ChessDB, games: (StoredGame | null)[]): Promise<number> {
  const valid = games.filter((g): g is StoredGame => !!g);
  if (!valid.length) return 0;
  const existing = new Set((await db.games.bulkGet(valid.map((g) => g.id))).filter(Boolean).map((g) => g!.id));
  const fresh = valid.filter((g) => !existing.has(g.id));
  await db.games.bulkAdd(fresh);
  return fresh.length;
}

export function monthIndex(url: string) {
  const { year, month } = archiveMonth(url);
  return year * 12 + month;
}

/**
 * Finds a single chess.com game by link by scanning the user's archives newest first.
 * The public API has no lookup-by-id, so we search up to `maxMonths` months.
 */
export async function importGameByUrl(
  db: ChessDB,
  link: string,
  username: string,
  fetcher?: Fetcher,
  maxMonths = 12,
): Promise<StoredGame> {
  const id = gameIdFromUrl(link);
  if (!id) throw new Error('That does not look like a chess.com game link.');
  await ensureOpenings();
  const archives = (await fetchArchives(username, fetcher)).reverse().slice(0, maxMonths);
  for (const url of archives) {
    const games = await fetchMonth(url, fetcher);
    const hit = games.find((g) => g.url.endsWith('/' + id));
    if (hit) {
      const game = buildGameFromChessCom(hit, username);
      if (!game) throw new Error('That game is a variant, which is not supported.');
      await db.games.put((await db.games.get(game.id)) ?? game);
      return game;
    }
  }
  throw new Error(`Game ${id} was not found in ${username}'s last ${maxMonths} months of games.`);
}
