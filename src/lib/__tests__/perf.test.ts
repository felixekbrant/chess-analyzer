import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeAll, describe, expect, it } from 'vitest';
import { ChessDB } from '../../db/schema';
import { buildAnalysis } from '../analysis/analyzeGame';
import { readonlyChess } from '../analysis/board';
import { buildSummary } from '../insights/summary';
import { joinAnalyzed, motifStats, overview, phaseStats, repeatedErrors, timeStats } from '../insights/compute';
import { ensureOpenings, detectOpening } from '../openings/eco';
import { parsePgn, quickScanPgn } from '../pgn/parse';
import type { GameAnalysis, PositionEval, Score, StoredGame } from '../types';

const PGN = `[Event "Live Chess"]
[White "me"]
[Black "you"]
[Result "0-1"]
[TimeControl "300+2"]

1. e4 {[%clk 0:05:01]} 1... e5 {[%clk 0:05:01]} 2. Nf3 {[%clk 0:05:00]} 2... Nc6 {[%clk 0:04:58]} 3. Bc4 {[%clk 0:04:55]} (3. Bb5 a6) 3... Nf6 {[%clk 0:04:50]} 4. Ng5 {[%clk 0:04:40]} 4... d5 {[%clk 0:04:30]} 5. exd5 {[%clk 0:04:35]} 5... Nxd5 {[%clk 0:04:20]} 6. Qf3?? {[%clk 0:03:10]} 6... Nd4 {[%clk 0:04:00]} 7. Qd3 {[%clk 0:02:50]} 7... Qxg5 {[%clk 0:03:50]} 0-1`;

const cp = (v: number): Score => ({ kind: 'cp', v });

function fixture(): { game: StoredGame; analysis: GameAnalysis } {
  const parsed = parsePgn(PGN);
  const fens = [parsed.startFen, ...parsed.plies.map((p) => p.fenAfter)];
  const scores = [20, 30, 25, 30, 30, 20, 40, 30, 60, 50, 40, -350, -340, -600].map(cp);
  const evals: PositionEval[] = fens.map((fen, i) => ({ fen, depth: 12, lines: [{ score: scores[i] ?? cp(-600), pv: [] }] }));
  const analysis = buildAnalysis('g', parsed, evals, 12);
  const game = { id: 'g', userColor: 'w', userResult: 'loss', endTime: 1, timeControl: '300+2', timeClass: 'blitz', endReason: 'resigned' } as StoredGame;
  return { game, analysis };
}

describe('summaries', () => {
  beforeAll(() => ensureOpenings());

  it('give the same insights as full analyses and are much smaller', () => {
    const { game, analysis } = fixture();
    const summary = buildSummary(analysis, 'w');
    const ag = joinAnalyzed([game], new Map([['g', summary]]));
    expect(ag[0].moves.map((m) => m.san)).toEqual(analysis.moves.filter((m) => m.color === 'w').map((m) => m.san));
    expect(overview([game], ag).accuracy).toBeCloseTo(analysis.accuracy.w, 5);
    expect(phaseStats(ag)[0].accuracy).toBeCloseTo(analysis.phaseAccuracy.w.opening!, 5);
    expect(motifStats(ag).length).toBeGreaterThan(0);
    expect(timeStats(ag).gamesWithClock).toBe(1);
    expect(repeatedErrors([...ag, { ...ag[0], game: { ...game, id: 'g2' } }]).length).toBeGreaterThan(0);
    expect(JSON.stringify(summary).length).toBeLessThan(JSON.stringify(analysis).length / 3);
  });
});

describe('quickScanPgn', () => {
  beforeAll(() => ensureOpenings());

  it('matches the full parser for move count and opening, ignoring variations and comments', () => {
    const quick = quickScanPgn(PGN);
    const full = parsePgn(PGN);
    expect(quick.plyCount).toBe(full.plies.length);
    expect(quick.headers.TimeControl).toBe('300+2');
    expect(detectOpening(quick.openingFens)?.name).toBe(detectOpening(full.plies.map((p) => p.fenAfter))?.name);
    expect(detectOpening(quick.openingFens)?.name).toMatch(/Two Knights|Italian/);
  });

  it('rejects garbage', () => {
    expect(() => quickScanPgn('1. e4 e5 2. Qxz9')).toThrow();
  });
});

describe('readonlyChess cache', () => {
  it('returns the same instance for the same FEN and the right position', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const a = readonlyChess(fen);
    expect(readonlyChess(fen)).toBe(a);
    expect(a.fen()).toBe(fen);
    for (let i = 0; i < 100; i++) readonlyChess(`8/8/8/8/8/8/8/K1k5 w - - 0 ${i + 1}`);
    expect(readonlyChess(fen)).not.toBe(a); // evicted
    expect(readonlyChess(fen).fen()).toBe(fen);
  });
});

describe('database v2 migration', () => {
  it('builds summaries for games analysed before the upgrade', async () => {
    const name = 'migrate-' + Math.random();
    const { game, analysis } = fixture();
    const v1 = new Dexie(name);
    v1.version(1).stores({ games: 'id, endTime, analysisStatus, timeClass, userResult, eco', analyses: 'gameId', puzzles: 'id, due, phase', sync: 'username', kv: 'key' });
    await v1.table('games').put({ ...game, analysisStatus: 'done' });
    await v1.table('games').put({ ...game, id: 'stuck', analysisStatus: 'running' });
    await v1.table('analyses').put(analysis);
    v1.close();

    const db = new ChessDB(name);
    const s = await db.summaries.get('g');
    expect(s?.moves.length).toBe(analysis.moves.filter((m) => m.color === 'w').length);
    expect((await db.games.get('stuck'))?.analysisStatus).toBe('pending');
  });
});
