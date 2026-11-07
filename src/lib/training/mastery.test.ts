import { describe, expect, it } from 'vitest';
import { backfilledMastery, countMastery, masteryOf, nextMastery } from './mastery';
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

describe('mastery', () => {
  it('needs three clean solves on separate days', () => {
    let m = nextMastery(puzzle(), 'good', T);
    expect(m).toHaveLength(1);
    // A second clean solve the same day doesn't count.
    expect(nextMastery({ mastery: m }, 'easy', T + 3600e3)).toEqual(m);
    m = nextMastery({ mastery: m }, 'good', T + DAY);
    m = nextMastery({ mastery: m }, 'easy', T + 5 * DAY);
    expect(masteryOf(puzzle({ mastery: m, lastResult: 'solved', reps: 3 }))).toBe('mastered');
  });
  it('keeps progress on a solve with help, and starts over on a miss', () => {
    const m = [T, T + DAY];
    expect(nextMastery({ mastery: m }, 'hard', T + 3 * DAY)).toEqual(m);
    expect(nextMastery({ mastery: m }, 'again', T + 3 * DAY)).toEqual([]);
  });
  it('counts new, learning and mastered', () => {
    const c = countMastery([puzzle(), puzzle({ lastResult: 'failed', lapses: 1 }), puzzle({ mastery: [1, 2, 3] })]);
    expect(c).toEqual({ mastered: 1, learning: 1, new: 1, total: 3 });
  });
  it('credits older puzzles only with solves the schedule proves were clean', () => {
    expect(backfilledMastery(puzzle({ reps: 2, ease: 2.5, lastResult: 'solved', seenAt: T }))).toEqual([T - DAY, T]);
    expect(backfilledMastery(puzzle({ reps: 2, ease: 2.36, lastResult: 'solved', seenAt: T }))).toEqual([]);
    expect(backfilledMastery(puzzle({ reps: 1, lapses: 1, lastResult: 'solved', seenAt: T }))).toEqual([]);
  });
});

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
