import { describe, expect, it } from 'vitest';
import { hintText } from './hint';

describe('hintText', () => {
  // Black to move: Bb4 hits the queen on c3 (a quiet move with a target).
  const fen = '4rrk1/pp3ppp/2pb4/1q6/3n2BB/2Q4P/PP3PP1/R3R1K1 b - - 1 20';

  it('names what to look for, not the move or its square', () => {
    expect(hintText(fen, 'Bb4', 'b')).toBe("No capture or check: look for a quiet move that attacks White's queen on c3.");
    expect(hintText(fen, 'Qxb2', 'b')).toBe("Look for a capture: White's pawn on b2 can be taken.");
    // A quiet move with no target of its own: the knight on d4 (attacked by the queen) is the clue.
    expect(hintText(fen, 'Qe2', 'b')).toBe("Your knight on d4 is under attack. What's the best way to deal with it?");
    // Nothing attacked, nothing threatened: the general line.
    expect(hintText('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'Nf3', 'w')).toBe('No capture or check here: look for a quiet move that improves one of your pieces.');
  });

  it('handles checks and mates', () => {
    expect(hintText('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'Ra8#', 'w')).toBe('There is a checkmate in one. Look at every check.');
  });

  it('gives nothing for an illegal or missing move', () => {
    expect(hintText(fen, 'Ke1', 'b')).toBeUndefined();
    expect(hintText(fen, undefined, 'b')).toBeUndefined();
  });
});

describe('hintText for quiet moves', () => {
  it('points at the piece under attack when the answer is to deal with it', () => {
    // From a real game: Black's rook on d2 is attacked by the king (and only Rc2 keeps it).
    expect(hintText('1q4k1/5pp1/Q3p2p/3p4/Pp6/1P1P3P/1P1r1PP1/1R2K3 b - - 1 30', 'Rc2', 'b')).toBe(
      "Your rook on d2 is under attack. What's the best way to deal with it?",
    );
  });

  it('warns of a mate threat first', () => {
    // White threatens Qxg7#; Black's answer is a quiet defence.
    expect(hintText('6k1/5ppp/8/8/8/2B5/5PPP/3Q2K1 b - - 0 1', 'f6', 'b')).toBe('Your opponent threatens mate: deal with that first.');
  });
});
