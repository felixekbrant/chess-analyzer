import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ChessDB } from '../../db/schema';
import { gameIdFromUrl, isMonthComplete } from '../chesscom/api';
import { selectArchives, syncChessCom } from '../chesscom/sync';

const game = (id: number, day = 1) => ({
  url: `https://www.chess.com/game/live/${id}`,
  pgn: `[Event "Live Chess"]\n[White "me"]\n[Black "them"]\n[Result "1-0"]\n[UTCDate "2026.09.0${day}"]\n[UTCTime "10:00:00"]\n[TimeControl "600"]\n\n1. e4 {[%clk 0:10:00]} 1... e5 {[%clk 0:09:58]} 2. Qh5 {[%clk 0:09:50]} 2... Nc6 {[%clk 0:09:40]} 3. Bc4 {[%clk 0:09:45]} 3... Nf6 {[%clk 0:09:30]} 4. Qxf7# {[%clk 0:09:40]} 1-0`,
  time_control: '600',
  end_time: Date.UTC(2026, 8, day) / 1000,
  rated: true,
  time_class: 'rapid',
  rules: 'chess',
  white: { username: 'Me', rating: 1000, result: 'win' },
  black: { username: 'them', rating: 1010, result: 'checkmated' },
});

function fakeFetcher(months: Record<string, unknown[]>) {
  const calls: string[] = [];
  const fetcher = async (url: string) => {
    calls.push(url);
    if (url.endsWith('/archives')) {
      return new Response(JSON.stringify({ archives: Object.keys(months) }));
    }
    return new Response(JSON.stringify({ games: months[url] ?? [] }));
  };
  return { fetcher, calls };
}

const A = 'https://api.chess.com/pub/player/me/games';

describe('chess.com sync', () => {
  it('extracts game ids from links', () => {
    expect(gameIdFromUrl('https://www.chess.com/game/live/123456')).toBe('123456');
    expect(gameIdFromUrl('https://www.chess.com/analysis/game/daily/42?tab=review')).toBe('42');
    expect(gameIdFromUrl('https://example.com')).toBeNull();
  });

  it('knows when a month is complete', () => {
    expect(isMonthComplete(`${A}/2026/08`, Date.UTC(2026, 8, 26))).toBe(true);
    expect(isMonthComplete(`${A}/2026/09`, Date.UTC(2026, 8, 26))).toBe(false);
  });

  it('limits history on the first sync', () => {
    const urls = [`${A}/2025/01`, `${A}/2026/07`, `${A}/2026/08`, `${A}/2026/09`];
    expect(selectArchives(urls, 2, Date.UTC(2026, 8, 26))).toEqual([`${A}/2026/08`, `${A}/2026/09`]);
    expect(selectArchives(urls, 0, Date.UTC(2026, 8, 26))).toEqual(urls);
  });

  it('imports incrementally and dedupes', async () => {
    const db = new ChessDB('test-sync-' + Math.random());
    const now = Date.UTC(2026, 8, 26);
    const months = { [`${A}/2026/08`]: [game(1)], [`${A}/2026/09`]: [game(2), game(3)] };
    const first = fakeFetcher(months);
    expect(await syncChessCom(db, 'me', { historyMonths: 3, fetcher: first.fetcher, now })).toBe(3);
    const g = await db.games.get('https://www.chess.com/game/live/2');
    expect(g?.userColor).toBe('w');
    expect(g?.userResult).toBe('win');
    expect(g?.endReason).toBe('checkmated');
    expect(g?.plyCount).toBe(7);

    // Second sync: August is complete and skipped; September is refetched with one new game.
    months[`${A}/2026/09`].push(game(4));
    const second = fakeFetcher(months);
    expect(await syncChessCom(db, 'me', { historyMonths: 3, fetcher: second.fetcher, now })).toBe(1);
    expect(second.calls).toEqual([`https://api.chess.com/pub/player/me/games/archives`, `${A}/2026/09`]);
    expect(await db.games.count()).toBe(4);
  });
});
