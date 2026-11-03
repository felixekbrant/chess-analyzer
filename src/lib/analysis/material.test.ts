import { describe, expect, it } from 'vitest';
import { materialOf } from './material';

describe('materialOf', () => {
  it('is empty at the start', () => {
    expect(materialOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toEqual({ w: { captured: [], advantage: 0 }, b: { captured: [], advantage: 0 } });
  });

  it('lists what each side took, pawns first, and the lead', () => {
    // White took a knight and a pawn; Black took a pawn.
    const m = materialOf('r1bqkbnr/pp1ppppp/8/8/8/8/PPP1PPPP/RNBQKBNR w KQkq - 0 1');
    expect(m.w).toEqual({ captured: ['p', 'n'], advantage: 3 });
    expect(m.b).toEqual({ captured: ['p'], advantage: 0 });
  });

  it("doesn't count a promotion as a capture", () => {
    // White promoted a pawn to a second queen; nothing was captured.
    const m = materialOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPP1/RNBQKBNQ w Qkq - 0 1');
    expect(m.b.captured).toEqual(['r']);
    expect(m.w.captured).toEqual([]);
    expect(m.w.advantage).toBe(3);
  });
});
