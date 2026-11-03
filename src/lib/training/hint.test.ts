import { describe, expect, it } from 'vitest';
import { hintText } from './hint';

describe('hintText', () => {
  // Black to move: Bb4 hits the queen on c3 (a quiet move with a target).
  const fen = '4rrk1/pp3ppp/2pb4/1q6/3n2BB/2Q4P/PP3PP1/R3R1K1 b - - 1 20';

  it('names what to look for, not the move or its square', () => {
    expect(hintText(fen, 'Bb4', 'b')).toBe("No capture or check: look for a quiet move that attacks White's queen on c3.");
    expect(hintText(fen, 'Qxb2', 'b')).toBe("Look for a capture: White's pawn on b2 can be taken.");
    expect(hintText(fen, 'Qe2', 'b')).toBe('No capture or check here: look for a quiet move that improves one of your pieces.');
  });

  it('handles checks and mates', () => {
    expect(hintText('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'Ra8#', 'w')).toBe('There is a checkmate in one. Look at every check.');
  });

  it('gives nothing for an illegal or missing move', () => {
    expect(hintText(fen, 'Ke1', 'b')).toBeUndefined();
    expect(hintText(fen, undefined, 'b')).toBeUndefined();
  });
});
