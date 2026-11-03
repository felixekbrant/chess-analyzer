import { describe, expect, it } from 'vitest';
import { hideBestMove } from './hideBest';

describe('hideBestMove', () => {
  it('keeps what went wrong and takes out what to play', () => {
    expect(hideBestMove('You had a forced mate in 3 starting with Qh7+.', 'Qh7+')).toBe('You had a forced mate in 3.');
    expect(hideBestMove('Nxe5 would have won material (Nxe5 dxe5 Qxd8+).', 'Nxe5')).toBe('You could have won material.');
    expect(hideBestMove('Gives your opponent the better game. Bd3 was better.', 'Bd3')).toBe('Gives your opponent the better game.');
    expect(hideBestMove('Better was O-O.', 'O-O')).toBe('There was a better move.');
    expect(hideBestMove('Fine. The engine slightly preferred c4.', 'c4')).toBe('Fine. The engine slightly preferred another move.');
  });

  it('leaves explanations that only describe the punishment', () => {
    const t = 'Your knight on f3 was already under attack and Bd2 didn\'t deal with it: e4 wins it.';
    expect(hideBestMove(t, 'Nd4')).toBe(t);
  });

  it('drops any other sentence that names the best move, and nothing else', () => {
    expect(hideBestMove('This throws away a winning advantage. Try Re1 next time.', 'Re1')).toBe('This throws away a winning advantage.');
    // "e4" inside "Qe4" isn't the move e4.
    expect(hideBestMove('Qe4 forks your rook and king.', 'e4')).toBe('Qe4 forks your rook and king.');
  });
});
