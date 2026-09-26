import { beforeAll, describe, expect, it } from 'vitest';
import { ensureOpenings } from '../openings/eco';
import { buildAnalysis, detectMotifs, isSacrifice } from '../analysis/analyzeGame';
import { parsePgn, type ParsedPly } from '../pgn/parse';
import { playUci } from '../analysis/board';
import type { PositionEval, Score } from '../types';
import { schedule, NEW_CARD } from '../training/srs';
import { solutionFor } from '../training/puzzles';

const cp = (v: number): Score => ({ kind: 'cp', v });

function plyFrom(fen: string, uci: string): ParsedPly {
  const r = playUci(fen, [uci]);
  const [, color, , , , move] = fen.split(' ');
  return {
    ply: 20,
    moveNumber: Number(move),
    color: color as 'w' | 'b',
    san: r.sans[0],
    uci,
    fenBefore: fen,
    fenAfter: r.fens[0],
  };
}

describe('motif detection', () => {
  it('flags a hung piece', () => {
    // 1.e4 e5 2.Bc4 Nf6 and White plays 3.Bxf7+?? Kxf7
    const fen = 'rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3';
    const p = plyFrom(fen, 'c4f7');
    const r = detectMotifs({ p, evalBefore: cp(30), evalAfter: cp(-180), winBefore: 52, winAfter: 34, bestUci: ['g1f3'], replyUci: ['e8f7', 'd1h5', 'g7g6'] });
    expect(r.motifs).toContain('hung_piece');
    expect(r.explanation).toMatch(/bishop/);
  });

  it('flags an allowed mate (Scholar\'s mate)', () => {
    // 1.e4 e5 2.Qh5 Nc6 3.Bc4 and Black plays 3...Nf6??
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3';
    const p = plyFrom(fen, 'g8f6');
    const r = detectMotifs({ p, evalBefore: cp(-50), evalAfter: { kind: 'mate', v: 1 }, winBefore: 45, winAfter: 0, bestUci: ['g7g6'], replyUci: ['h5f7'] });
    expect(r.motifs).toContain('allowed_mate');
  });

  it('flags a back-rank mate', () => {
    // White to move, plays a2a3?? allowing ...Rd1#
    const fen = '3r2k1/5ppp/8/8/8/8/P4PPP/6K1 w - - 0 30';
    const p = plyFrom(fen, 'a2a3');
    const r = detectMotifs({ p, evalBefore: cp(-500), evalAfter: { kind: 'mate', v: -1 }, winBefore: 10, winAfter: 0, bestUci: ['h2h3'], replyUci: ['d8d1'] });
    expect(r.motifs).toEqual(expect.arrayContaining(['allowed_mate', 'back_rank']));
  });

  it('flags an allowed fork', () => {
    const fen = 'r3k3/pppppppp/8/8/1n6/8/PP1PPPPP/R3K2R w KQq - 0 12';
    const p = plyFrom(fen, 'h2h3');
    const r = detectMotifs({ p, evalBefore: cp(0), evalAfter: cp(-450), winBefore: 50, winAfter: 16, bestUci: ['e1d1'], replyUci: ['b4c2', 'e1d1', 'c2a1', 'd1c1'] });
    expect(r.motifs).toContain('allowed_fork');
  });

  it('catches material lost even if a pawn is won back later', () => {
    const fen = '1r3rk1/ppp2pp1/2n1q2p/3np2Q/5P2/2PP2P1/P1PB2BP/1R3RK1 b - - 0 15';
    const p = plyFrom(fen, 'e5f4');
    const r = detectMotifs({ p, evalBefore: cp(20), evalAfter: cp(350), winBefore: 48, winAfter: 12, bestUci: ['d5f6'], replyUci: ['g2d5', 'e6d6', 'd5g2', 'f4g3'] });
    expect(r.motifs.some((m) => ['hung_piece', 'allowed_tactic', 'allowed_fork', 'ignored_threat'].includes(m))).toBe(true);
    expect(r.motifs).not.toContain('positional');
  });

  it('labels quiet mistakes as positional', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    const p = plyFrom(fen, 'h2h4');
    const r = detectMotifs({ p, evalBefore: cp(40), evalAfter: cp(-60), winBefore: 54, winAfter: 41, bestUci: ['f1b5'], replyUci: ['d7d5', 'e4d5', 'd8d5'] });
    expect(r.motifs).toContain('positional');
  });

  it('flags a missed mate', () => {
    const fen = 'r1bqkbnr/pppp1ppp/8/n3p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4';
    const p = plyFrom(fen, 'd2d3');
    const r = detectMotifs({ p, evalBefore: { kind: 'mate', v: 1 }, evalAfter: cp(200), winBefore: 100, winAfter: 68, bestUci: ['h5f7'], replyUci: ['d7d6'] });
    expect(r.motifs).toContain('missed_mate');
    expect(r.explanation).toMatch(/Qxf7#/);
  });
});

describe('sacrifice detection', () => {
  it('recognises a piece left en prise', () => {
    // Bxh7+ Greek gift style: bishop can be taken by the king
    const fen = 'rnbq1rk1/ppp2ppp/4pn2/3p4/1b1P4/2NBPN2/PPP2PPP/R1BQK2R w KQ - 0 6';
    expect(isSacrifice(plyFrom(fen, 'd3h7'))).toBe(true);
    expect(isSacrifice(plyFrom(fen, 'e1g1'))).toBe(false);
  });
});

describe('buildAnalysis', () => {
  beforeAll(() => ensureOpenings());

  it('classifies moves and computes accuracy', () => {
    const pgn = `[White "a"]\n[Black "b"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;
    const parsed = parsePgn(pgn);
    const fens = [parsed.startFen, ...parsed.plies.map((p) => p.fenAfter)];
    const scores: Score[] = [cp(20), cp(30), cp(25), cp(10), cp(20), cp(20), { kind: 'mate', v: 1 }, { kind: 'over', v: 1 }];
    const best = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g7g6', 'h5f7', ''];
    const evals: PositionEval[] = fens.map((fen, i) => ({ fen, depth: 10, lines: [{ score: scores[i], pv: best[i] ? [best[i]] : [] }] }));
    const a = buildAnalysis('g1', parsed, evals, 10);
    expect(a.moves[0].classification).toBe('book');
    expect(a.moves[5].classification).toBe('blunder');
    expect(a.moves[6].classification).toBe('best');
    expect(a.moves[5].motifs).toContain('allowed_mate');
    expect(a.accuracy.b).toBeLessThan(a.accuracy.w);
  });
});

describe('training', () => {
  it('schedules with SM-2', () => {
    const now = 0;
    const s1 = schedule(NEW_CARD, 'good', now);
    expect(s1.interval).toBe(1);
    const s2 = schedule(s1, 'good', now);
    expect(s2.interval).toBe(3);
    const s3 = schedule(s2, 'good', now);
    expect(s3.interval).toBeGreaterThan(6);
    const fail = schedule(s3, 'again', now);
    expect(fail.reps).toBe(0);
    expect(fail.lapses).toBe(1);
    expect(fail.due).toBe(10 * 60 * 1000);
  });

  it('builds mate solutions ending on the user move', () => {
    const m = { color: 'w', evalBefore: { kind: 'mate', v: 2 }, bestLineUci: ['a', 'b', 'c', 'd'] } as never;
    expect(solutionFor(m)).toEqual(['a', 'b', 'c']);
    const m2 = { color: 'w', evalBefore: cp(300), bestLineUci: ['a', 'b', 'c'] } as never;
    expect(solutionFor(m2)).toEqual(['a']);
  });
});
