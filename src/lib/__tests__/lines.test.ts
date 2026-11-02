import { describe, expect, it } from 'vitest';
import { explainLine } from '../analysis/lines';

describe('explaining engine lines', () => {
  it('notes captures and checks, and counts only the settled material', () => {
    // White's queen takes an undefended knight on e5 with check; nothing comes back.
    const fen = 'rnb1kb1r/pppp1ppp/8/4n3/8/8/PPPPQPPP/RNB1KBNR w KQkq - 0 5';
    const line = explainLine(fen, ['e2e5', 'f8e7', 'e5g7'], 'w', { w: 'You', b: 'Your opponent' });
    expect(line.steps[0].note).toBe('You take the knight on e5, with check.');
    expect(line.steps[0].number).toBe('5.');
    expect(line.steps[1].number).toBe('5…');
    expect(line.steps[0].material).toBe(3);
    // The line ends with a capture (Qxg7), which might be answered: the summary counts the knight only.
    expect(line.summary).toBe('You come out 3 points ahead (a knight).');
  });

  it('sums up won material and mates', () => {
    const trade = explainLine('4k3/8/8/3r4/8/8/3R4/4K3 w - - 0 1', ['d2d5', 'e8e7', 'e1e2'], 'w');
    expect(trade.summary).toMatch(/White comes out 5 points ahead \(a rook\)/);
    const mate = explainLine('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', ['a1a8'], 'w', { w: 'You', b: 'Them' });
    expect(mate.steps[0].note).toBe('You play Ra8#: checkmate!');
    expect(mate.summary).toBe('You deliver checkmate.');
  });

  it('keeps the key part up to one reply after the last forcing move', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const quiet = explainLine(fen, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'], 'w');
    expect(quiet.keyLength).toBe(4);
    expect(quiet.summary).toMatch(/No material/);
  });
});
