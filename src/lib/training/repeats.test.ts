import { describe, expect, it } from 'vitest';
import { keyMotif, repeatsOf } from './repeats';
import type { Puzzle } from '../types';

const DAY = 86400000;
const T = Date.UTC(2026, 10, 7, 12);

function puzzle(over: Partial<Puzzle> = {}): Puzzle {
  return {
    id: 'x', fen: '', gameIds: ['g1'], plies: [10], playedUci: 'e2e4', playedSan: 'e4', solutionUci: ['d2d4'], classification: 'blunder',
    motifs: ['hung_piece'], phase: 'middlegame', winLoss: 30, bestWin: 60, occurrences: 1, createdAt: T, due: T,
    interval: 0, ease: 2.5, reps: 0, lapses: 0, ...over,
  };
}

describe('repeats', () => {
  it('names the most specific kind of mistake', () => {
    expect(keyMotif(['positional', 'hung_piece', 'rushed'])).toBe('hung_piece');
    expect(keyMotif(['positional', 'time_trouble'])).toBeUndefined();
  });
  it('counts earlier games with the same kind of mistake in the two months before', () => {
    const now = puzzle({ id: 'a', gameIds: ['g9'], playedAt: T });
    const all = [
      now,
      puzzle({ id: 'b', gameIds: ['g8'], playedAt: T - 3 * DAY }),
      puzzle({ id: 'c', gameIds: ['g7'], playedAt: T - 10 * DAY, motifs: ['allowed_fork'] }),
      puzzle({ id: 'd', gameIds: ['g6'], playedAt: T - 90 * DAY }),
      puzzle({ id: 'e', gameIds: ['g10'], playedAt: T + DAY }),
    ];
    expect(repeatsOf(now, all)).toBe(1);
    expect(repeatsOf(all[4], all)).toBe(2);
  });
});
