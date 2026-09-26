import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeAll, describe, expect, it } from 'vitest';
import { ChessDB } from '../../db/schema';
import { buildAnalysis } from '../analysis/analyzeGame';
import { ensureOpenings } from '../openings/eco';
import { parsePgn } from '../pgn/parse';
import { coachSummary, gradeFor } from '../review/coachSummary';
import { relativeDay } from '../format';
import type { PositionEval, Score, StoredGame } from '../types';

const PGN = `[White "me"]\n[Black "rival"]\n[Result "0-1"]\n\n1. e4 e5 2. Qh5 Nc6 3. Qxf7+ Kxf7 4. Nf3 d5 0-1`;
const cp = (v: number): Score => ({ kind: 'cp', v });

describe('coach summary', () => {
  beforeAll(() => ensureOpenings());

  it('names the result, accuracy and the turning point without mangling moves', () => {
    const parsed = parsePgn(PGN);
    const fens = [parsed.startFen, ...parsed.plies.map((p) => p.fenAfter)];
    const scores = [20, 30, 25, 10, 20, -900, -880, -870, -860].map(cp);
    const evals: PositionEval[] = fens.map((fen, i) => ({ fen, depth: 12, lines: [{ score: scores[i], pv: ['g1f3'] }] }));
    const analysis = buildAnalysis('g', parsed, evals, 12);
    const game = { id: 'g', white: 'me', black: 'rival', userColor: 'w', userResult: 'loss' } as StoredGame;
    const s = coachSummary(game, analysis);
    expect(s.lines[0]).toMatch(/tough loss against rival/);
    expect(s.turningPoint?.san).toBe('Qxf7+');
    const tp = s.lines.find((l) => l.startsWith('The turning point'));
    expect(tp).toMatch(/3\.Qxf7\+/);
    // Ordinary first words get lower-cased, SAN never does.
    expect(tp).not.toMatch(/: [a-h][1-8]\b/);
  });

  it('grades phases', () => {
    expect(gradeFor(95)).toBe('excellent');
    expect(gradeFor(85)).toBe('good');
    expect(gradeFor(70)).toBe('inaccurate');
    expect(gradeFor(50)).toBe('poor');
    expect(gradeFor(undefined)).toBeUndefined();
  });
});

describe('relative day labels', () => {
  it('uses Today / Yesterday / weekday / date', () => {
    const now = new Date(2026, 8, 26, 15).getTime();
    expect(relativeDay(new Date(2026, 8, 26, 9).getTime(), now)).toBe('Today');
    expect(relativeDay(new Date(2026, 8, 25, 23).getTime(), now)).toBe('Yesterday');
    expect(relativeDay(new Date(2026, 8, 22, 12).getTime(), now)).toMatch(/day$/);
    expect(relativeDay(new Date(2026, 7, 1, 12).getTime(), now)).not.toMatch(/day$/);
  });
});

describe('database v3 migration', () => {
  it('moves PGNs out of the games table and keeps everything else', async () => {
    const name = 'migrate3-' + Math.random();
    const v2 = new Dexie(name);
    v2.version(1).stores({ games: 'id, endTime, analysisStatus, timeClass, userResult, eco', analyses: 'gameId', puzzles: 'id, due, phase', sync: 'username', kv: 'key' });
    v2.version(2).stores({ summaries: 'gameId' });
    await v2.table('games').put({ id: 'a', pgn: PGN, white: 'me', black: 'rival', userColor: 'w', endTime: 1, analysisStatus: 'done', plyCount: 10 });
    await v2.table('games').put({ id: 'b', white: 'x', black: 'y', userColor: 'b', endTime: 2, analysisStatus: 'pending', plyCount: 0 });
    v2.close();

    const db = new ChessDB(name);
    const a = await db.games.get('a');
    expect(a?.plyCount).toBe(10);
    expect((a as unknown as { pgn?: string }).pgn).toBeUndefined();
    expect((await db.pgns.get('a'))?.pgn).toBe(PGN);
    expect(await db.pgns.get('b')).toBeUndefined();
    expect(await db.games.count()).toBe(2);
  });
});
