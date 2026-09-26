import { describe, expect, it } from 'vitest';
import { gameAccuracy, moveAccuracy } from '../analysis/accuracy';
import { winPercent, winPercentFromCp } from '../analysis/winprob';

describe('win percent', () => {
  it('matches the lichess curve', () => {
    expect(winPercentFromCp(0)).toBeCloseTo(50);
    expect(winPercentFromCp(100)).toBeCloseTo(59.1, 1);
    expect(winPercentFromCp(-300)).toBeCloseTo(24.9, 1);
    expect(winPercentFromCp(5000)).toBe(winPercentFromCp(1000));
  });
  it('handles mate and finished games', () => {
    expect(winPercent({ kind: 'mate', v: 3 })).toBe(100);
    expect(winPercent({ kind: 'mate', v: -1 })).toBe(0);
    expect(winPercent({ kind: 'over', v: 0 })).toBe(50);
  });
});

describe('accuracy', () => {
  it('is 100 for moves that do not lose', () => {
    expect(moveAccuracy(50, 50)).toBe(100);
    expect(moveAccuracy(50, 60)).toBe(100);
  });
  it('drops with win-% loss', () => {
    expect(moveAccuracy(50, 45)).toBeGreaterThan(80);
    expect(moveAccuracy(80, 20)).toBeLessThan(10);
  });
  it('gives a perfect game 100 and punishes a blunder', () => {
    const flat = Array(41).fill(50);
    const acc = gameAccuracy(flat);
    expect(acc.w).toBeCloseTo(100, 0);
    expect(acc.b).toBeCloseTo(100, 0);
    const blunder = [...flat];
    for (let i = 21; i < blunder.length; i++) blunder[i] = 5; // white blunders on ply 20
    const acc2 = gameAccuracy(blunder);
    expect(acc2.w).toBeLessThan(90);
    expect(acc2.b).toBeCloseTo(100, 0);
  });
});
