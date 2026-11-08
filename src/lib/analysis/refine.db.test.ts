import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import seedJson from '../../../e2e/fixtures/seed.json';
import { Chess } from 'chess.js';
import { db } from '../../db/schema';
import { saveBetterLine } from './refine';
import { upsertPuzzlesFromAnalysis } from '../training/puzzles';
import type { GameAnalysis, StoredGame } from '../types';

describe('saveBetterLine', () => {
  it('makes a better line the recommendation, its puzzle included, and keeps the scores', async () => {
    const seed = seedJson as unknown as { games: (StoredGame & { pgn: string })[]; analyses: GameAnalysis[] };
    const a = seed.analyses.find((x) => seed.games.find((g) => g.id === x.gameId)?.userColor)!;
    const g = seed.games.find((x) => x.id === a.gameId)!;
    await db.games.put({ ...g, pgn: undefined } as unknown as StoredGame);
    await db.pgns.put({ gameId: g.id, pgn: g.pgn });
    await db.analyses.put(a);
    await upsertPuzzlesFromAnalysis(g, a);
    // One of your mistakes, and another legal move to stand in for "the deeper engine's choice".
    const ply = a.moves.findIndex((m) => m.color === g.userColor && ['mistake', 'blunder'].includes(m.classification) && m.bestUci);
    const m = a.moves[ply];
    const other = new Chess(m.fenBefore).moves({ verbose: true }).find((x) => x.from + x.to !== m.bestUci && x.from + x.to !== m.uci)!;
    const pv = [other.from + other.to + (other.promotion ?? '')];

    expect(await saveBetterLine(g.id, ply, pv)).toBe(true);
    const next = (await db.analyses.get(g.id))!;
    expect(next.moves[ply].bestUci).toBe(pv[0]);
    expect(next.moves[ply].bestSan).toBe(other.san);
    // Scores, classifications and accuracy are those of the analysis; only the recommendation changes.
    expect(next.moves[ply].evalBefore).toEqual(m.evalBefore);
    expect(next.moves.map((x) => x.classification)).toEqual(a.moves.map((x) => x.classification));
    expect(next.accuracy).toEqual(a.accuracy);
    // The puzzle from that mistake now asks for the new move.
    const puzzle = (await db.puzzles.toArray()).find((p) => p.gameIds.includes(g.id) && p.plies.includes(ply));
    if (puzzle) expect(puzzle.solutionUci[0]).toBe(pv[0]);
    // Saving the same line again changes nothing.
    expect(await saveBetterLine(g.id, ply, pv)).toBe(false);
  });
});
