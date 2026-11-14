import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { materialWord, moveIdea, moveIdeaSan } from './explain';
import { classify, detectMotifs, timeMotifs } from './analyzeGame';
import { winPercentFor } from './winprob';
import type { ParsedPly } from '../pgn/parse';
import type { Color, Score } from '../types';

describe('moveIdea', () => {
  it('says what a capture wins', () => {
    expect(moveIdea('4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1', ['f3e5'], 'w')).toBe('wins their pawn on e5 for free');
    expect(moveIdea('3qk3/8/8/8/8/8/8/3QK3 w - - 0 1', ['d1d8', 'e8d8'], 'w')).toBe('trades queens with check');
  });
  it('finds forks, mates and threats', () => {
    expect(moveIdea('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', ['b5c7'], 'w')).toBe('forks their king and rook on a8 with check');
    expect(moveIdea('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', ['a1a8'], 'w')).toBe('is checkmate');
    // Seen from the other side: the knight's move attacks *your* rook.
    expect(moveIdea('4k3/8/8/8/3n4/8/8/R3K3 b - - 0 1', ['d4b3'], 'w', { forcing: true })).toBe('attacks your undefended rook on a1');
  });
  it('says what a move defends or rescues', () => {
    expect(moveIdea('4k3/8/8/4p3/3N4/8/8/4K3 w - - 0 1', ['d4f5'], 'w')).toBe('moves your knight out of the attack');
  });
  it('gives a boxed-in castled king an escape square, but not in the opening', () => {
    expect(moveIdea('6k1/8/8/8/8/8/5PPP/6K1 w - - 0 1', ['h2h3'], 'w')).toBe('gives your king an escape square');
    expect(moveIdea('4k3/8/8/8/8/8/3PPP2/4K3 w - - 0 1', ['d2d4'], 'w')).not.toBe('gives your king an escape square');
  });
  it('reads a line in SAN too', () => {
    expect(moveIdeaSan('4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1', ['Nxe5'], 'w')).toBe('wins their pawn on e5 for free');
  });
});

// Fixes from the step 6 audit of the seed games' explanations.
describe('moveIdea: what the audit found', () => {
  it('calls an attack opened by moving out of the way a discovered one', () => {
    // The knight leaves the e-file: the rook now attacks the queen, not the knight.
    expect(moveIdea('k3q3/8/8/8/4N3/8/8/4R2K w - - 0 1', ['e4g5'], 'w')).toBe('uncovers an attack on their queen');
    // When the moved piece attacks the target too, it is a plain attack.
    const both = moveIdea('k7/8/8/4r3/8/4N3/8/4R2K w - - 0 1', ['e3c4'], 'w');
    expect(both).toContain('attacks their undefended rook on e5');
    expect(both).not.toContain('uncovers');
  });
  it("doesn't credit a traded piece with what it attacks, unless the line doesn't take back", () => {
    // Qxd4 exd4: the queen that "attacks a7" is gone at once.
    expect(moveIdea('k7/p7/8/4p3/3q4/8/8/3Q3K w - - 0 1', ['d1d4', 'e5d4'], 'w')).toBe('trades queens');
    // The same capture where the line doesn't recapture is not a trade.
    expect(moveIdea('k7/p7/8/4p3/3q4/8/8/3Q3K w - - 0 1', ['d1d4', 'a8b8'], 'w')).toMatch(/^takes their queen/);
  });
  it('says a reply takes back, counting material from before the move it answers', () => {
    const after = 'k7/8/8/8/8/2b5/8/2R4K w - - 0 1';
    const before = 'k7/8/8/8/1b6/2N5/8/2R4K b - - 0 1';
    expect(moveIdea(after, ['c1c3'], 'b', { forcing: true })).toBe('wins your bishop on c3 for free');
    expect(moveIdea(after, ['c1c3'], 'b', { forcing: true, recaptureOn: 'c3', gainFrom: before })).toBe('takes back on c3');
  });
  it('gives no escape square with check: the check is the point', () => {
    expect(moveIdea('8/8/8/8/7k/8/5PPP/6K1 w - - 0 1', ['g2g3'], 'w') ?? '').not.toContain('escape square');
  });
  it("doesn't call a queen undefended", () => {
    expect(moveIdea('k7/8/8/3q4/8/8/4N2K/8 w - - 0 1', ['e2c3'], 'w')).toBe('attacks their queen');
  });
  it('says more than a queen when it is', () => {
    expect(materialWord(12)).toBe('more than a queen');
    expect(materialWord(9)).toBe('a queen');
  });
});

/** One move from a position, as the analysis sees it. */
function plyOf(fen: string, san: string): ParsedPly {
  const c = new Chess(fen);
  const m = c.move(san);
  return { ply: 0, moveNumber: 1, color: m.color as Color, san: m.san, uci: m.from + m.to + (m.promotion ?? ''), fenBefore: fen, fenAfter: c.fen() };
}
const cp = (v: number): Score => ({ kind: 'cp', v });

describe('detectMotifs: what the audit found', () => {
  it('says a missed win comes from queening a pawn', () => {
    const p = plyOf('k7/5P2/8/8/8/7r/8/K7 w - - 0 1', 'Ka2');
    const r = detectMotifs({ p, evalBefore: cp(900), evalAfter: cp(50), winBefore: 88, winAfter: 51, bestUci: ['f7f8q'], replyUci: ['h3h1'] });
    expect(r.motifs).toContain('missed_win');
    expect(r.explanation).toContain('would have let your f-pawn queen');
  });
  it('says an allowed tactic lets their pawn queen', () => {
    const p = plyOf('8/8/k7/8/8/8/3p4/4R2K w - - 0 1', 'Re5');
    const r = detectMotifs({ p, evalBefore: cp(0), evalAfter: cp(-900), winBefore: 50, winAfter: 12, bestUci: ['e1d1'], replyUci: ['d2d1q', 'h1h2'] });
    expect(r.explanation).toContain('This lets their d-pawn queen');
  });
  it('names the king first in a fork', () => {
    const p = plyOf('4k3/8/8/8/3n4/8/7P/R3K3 w - - 0 1', 'h3');
    const r = detectMotifs({ p, evalBefore: cp(0), evalAfter: cp(-500), winBefore: 50, winAfter: 24, bestUci: ['e1e2'], replyUci: ['d4c2', 'e1d1', 'c2a1', 'd1c1'] });
    expect(r.explanation).toBe('Nc2+ forks your king and rook.');
  });
  it('says what a quiet slip did from where you stood', () => {
    const p = plyOf('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'Kd1');
    const r = detectMotifs({ p, evalBefore: cp(300), evalAfter: cp(100), winBefore: winPercentFor(cp(300), 'w'), winAfter: winPercentFor(cp(100), 'w'), bestUci: ['e2e4'], replyUci: ['e8d7'] });
    expect(r.motifs).toContain('positional');
    expect(r.explanation).toMatch(/^This lets your advantage slip\./);
  });
});

describe('classify: what the audit found', () => {
  it("never calls the engine's own first choice an error", () => {
    const p = plyOf('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'e4');
    const before = { fen: p.fenBefore, depth: 14, lines: [{ score: cp(300), pv: [p.uci] }] };
    expect(classify({ ply: p, before, winBefore: 67, winAfter: 61, winLoss: 6, isBook: false, prevWinLoss: 0 })).toBe('best');
  });
});

describe('timeMotifs: what the audit found', () => {
  const game = { headers: {}, startFen: '', plies: [], timeControl: { base: 600, increment: 0 } };
  const at = (timeSpent: number): ParsedPly => ({ ...plyOf('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'Kd1'), ply: 30, clock: 300, timeSpent });
  it('calls a quick error rushed only when it was quicker than your own pace', () => {
    // 10 minutes: up to 6 s counts as quick. Your usual move takes 3.8 s.
    expect(timeMotifs(at(3.1), game, 3.8, 'mistake')).toContain('rushed');
    expect(timeMotifs(at(5.7), game, 3.8, 'mistake')).not.toContain('rushed');
    // Under 1.5 s is rushed whatever your pace.
    expect(timeMotifs(at(1.2), game, 1.0, 'mistake')).toContain('rushed');
  });
});
