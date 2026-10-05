import { describe, expect, it } from 'vitest';
import { gameAccuracy } from '../analysis/accuracy';
import { winPercent } from '../analysis/winprob';
import type { Score } from '../types';
import data from './fixtures/chesscom-accuracy.json';

// Stockfish 19 lite (depth 14, the app's default) scores for 129 chess.com games that were reviewed
// on chess.com, with chess.com's own accuracy for both players. Bullet to daily, ratings ~500-2050.
const games = data as { w: boolean; s: (number | string)[]; a: [number, number] }[];

function toScore(x: number | string): Score {
  if (typeof x === 'number') return { kind: 'cp', v: x };
  const v = Number(x.slice(1));
  return x[0] === 'M' ? { kind: 'mate', v } : { kind: 'over', v: v as 1 | 0 | -1 };
}

describe('accuracy matches chess.com', () => {
  it('is within a few points of chess.com on real games', () => {
    const errors: number[] = [];
    for (const g of games) {
      const acc = gameAccuracy(g.s.map((x) => winPercent(toScore(x))), g.w ? 'w' : 'b');
      errors.push(acc.w - g.a[0], acc.b - g.a[1]);
    }
    const mae = errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length;
    const bias = errors.reduce((s, e) => s + e, 0) / errors.length;
    // Before calibration (lichess formulas) this was MAE 6.2 with a +2.4 bias.
    expect(mae).toBeLessThan(2.6);
    expect(Math.abs(bias)).toBeLessThan(0.5);
  });
});
