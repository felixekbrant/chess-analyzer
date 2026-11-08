import { describe, expect, it } from 'vitest';
import { betterLine } from './refine';
import type { PositionEval } from '../types';

// The position from a real game: Black to move. Analysed at depth 14, Rh5 was "best"; the open
// engine at depth 22 found f5 clearly better (−4.7 against −3.9).
const FEN = '5rk1/p4p1p/1p1p2p1/2p1r3/2P1Pq2/1Q3P1P/PP3P2/2R3RK b - - 0 25';
const m = { fenBefore: FEN, bestUci: 'e5h5', color: 'b' as const };
const live = (depth: number, lines: [number, string][]): PositionEval => ({
  fen: FEN,
  depth,
  lines: lines.map(([cp, move]) => ({ score: { kind: 'cp', v: cp }, pv: [move, 'c1c3'] })),
});

describe('betterLine', () => {
  it('takes a clearly better move from a much deeper search', () => {
    expect(betterLine(m, 14, live(22, [[-470, 'f7f5'], [-390, 'e5h5'], [-390, 'f4h6']]))?.[0]).toBe('f7f5');
  });
  it('keeps the stored move when the search is not deep enough, agrees, or the difference is small', () => {
    expect(betterLine(m, 14, live(18, [[-470, 'f7f5'], [-390, 'e5h5']]))).toBeUndefined();
    expect(betterLine(m, 14, live(22, [[-470, 'e5h5'], [-390, 'f7f5']]))).toBeUndefined();
    expect(betterLine(m, 14, live(22, [[-400, 'f7f5'], [-390, 'e5h5']]))).toBeUndefined();
  });
  it('treats a stored move missing from the lines as no better than the last of them', () => {
    expect(betterLine(m, 14, live(22, [[-470, 'f7f5'], [-400, 'f4h6'], [-380, 'c5c4']]))?.[0]).toBe('f7f5');
  });
  it('only looks at the position the move was played from', () => {
    expect(betterLine({ ...m, fenBefore: '8/8/8/8/8/8/8/K6k w - - 0 1' }, 14, live(22, [[-470, 'f7f5'], [-390, 'e5h5']]))).toBeUndefined();
  });
});
