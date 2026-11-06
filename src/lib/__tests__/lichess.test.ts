import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { bandFor, PACK_AREAS, pickNew, playerRating, readyExt, targetRating, toPuzzle, type Pack, type PackRow } from '../training/lichess';
import type { Puzzle } from '../types';
import { buildToday, drillCount, drillPuzzles, ownDrillCount, puzzleArea } from '../training/today';
import type { StoredGame } from '../types';

const with_ = (id: string, rating = ROW[3]): PackRow => [id, ROW[1], ROW[2], rating, ROW[4]];
const ROW: PackRow = ['0000D', '5rk1/1p3ppp/pq3b2/8/8/1P1Q1N2/P4PPP/3R2K1 w - - 2 27', 'd3d6 f8d8 d6d8 f6d8', 1433, 'advantage endgame short'];

describe('Lichess puzzle packs', () => {
  it('plays the opponent move and keeps the rest as the solution', () => {
    const p = toPuzzle(ROW, 'endgame', 1000)!;
    expect(p.id).toBe('lichess:0000D');
    expect(p.fen.split(' ')[1]).toBe('b');
    expect(p.solutionUci).toEqual(['f8d8', 'd6d8', 'f6d8']);
    expect(p.lichess).toMatchObject({ rating: 1433, area: 'endgame', lastMove: 'd3d6' });
    expect(p.phase).toBe('endgame');
    // The solution is legal from the puzzle position.
    const c = new Chess(p.fen);
    for (const m of p.solutionUci) c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
  });

  it('rejects malformed rows', () => {
    expect(toPuzzle(['x', ROW[1], 'a1a8 b1b2', 1000, ''], 'endgame')).toBeUndefined();
    expect(toPuzzle(['x', ROW[1], 'd3d6', 1000, ''], 'endgame')).toBeUndefined();
  });

  it('aims above the chess.com rating and picks the band that holds it', () => {
    expect(targetRating(1100)).toBe(1350);
    expect(bandFor(1350)).toBe(1300);
    expect(bandFor(500)).toBe(0);
    expect(bandFor(2900)).toBe(2200);
    expect(targetRating(undefined)).toBeGreaterThan(1000);
  });

  it('picks unseen puzzles closest to the target rating', () => {
    const pack: Pack = { area: 'endgame', min: 1300, max: 1600, puzzles: [ROW, with_('A', 1500), with_('B', 1350)] };
    const got = pickNew(pack, new Set(['lichess:B']), 1350, 2);
    expect(got.map((p) => p.id)).toEqual(['lichess:0000D', 'lichess:A']);
  });

  it('uses the median rating of recent timed games', () => {
    const g = (elo: number, t: number, timeClass = 'rapid') =>
      ({ id: String(t), userColor: 'w', whiteElo: elo, endTime: t, timeClass }) as unknown as StoredGame;
    expect(playerRating([g(1000, 1), g(1200, 2), g(1100, 3), g(2000, 4, 'daily')])).toBe(1100);
    expect(playerRating([])).toBeUndefined();
  });

  it('ships a pack for every area and band, all legal', () => {
    const packs = import.meta.glob<Pack>(['../../../public/puzzles/*.json', '!**/index.json'], { eager: true, import: 'default' });
    expect(Object.keys(packs).length).toBe(PACK_AREAS.length * 6);
    for (const pack of Object.values(packs)) {
      expect(pack.puzzles.length).toBeGreaterThan(50);
      for (const row of pack.puzzles) expect(toPuzzle(row, pack.area)).toBeDefined();
    }
  });
});

describe('focus drill with Lichess puzzles', () => {
  const now = Date.UTC(2026, 10, 2, 12);
  const ext = [toPuzzle(ROW, 'endgame', now - 1000)!, { ...toPuzzle(with_('L'), 'endgame', now)!, due: now + 86400000 }];

  it('adds ready Lichess puzzles after your own', () => {
    expect(drillPuzzles([], 'endgame', ext, now).map((p) => p.id)).toEqual(['lichess:0000D']);
    expect(readyExt(ext, 'opening', now)).toEqual([]);
  });

  it('leaves out your own puzzles that you solved recently (not due), but counts ones done today', () => {
    const own = { id: 'own', classification: 'mistake', motifs: ['hung_piece'], phase: 'middlegame', bestWin: 60, winLoss: 20, due: now - 1, occurrences: 1, createdAt: 0 } as unknown as Puzzle;
    const area = puzzleArea(own)!;
    const solved = { ...own, id: 'solved', due: now + 4 * 86400000 };
    expect(drillPuzzles([own, solved], area, [], now).map((p) => p.id)).toEqual(['own']);
    expect(ownDrillCount([own, solved], area, now)).toBe(1);
    expect(ownDrillCount([own, { ...solved, seenAt: now - 1000 }], area, now)).toBe(2);
  });

  it('counts puzzles done today towards the drill', () => {
    expect(drillCount([], 'endgame', ext, now)).toBe(1);
    const seen = [ext[0], { ...ext[1], lichess: { ...ext[1].lichess!, seenAt: now - 1000 } }];
    expect(drillCount([], 'endgame', seen, now)).toBe(2);
  });

  it('says where the drill puzzles come from', () => {
    const base = { now, minutes: 10 as const, games: [], progress: { date: '', puzzles: 0, drill: 0 }, due: 0, focus: 'endgame' as const, opponent: () => 'x' };
    expect(buildToday({ ...base, drillAvailable: 5, drillOwn: 0 }).items[0].detail).toBe('Lichess puzzles');
    expect(buildToday({ ...base, drillAvailable: 5, drillOwn: 2 }).items[0].detail).toMatch(/\+ Lichess/);
    expect(buildToday({ ...base, drillAvailable: 5, drillOwn: 5 }).items[0].detail).toBe('Your positions');
  });
});
