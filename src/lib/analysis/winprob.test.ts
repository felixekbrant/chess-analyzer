import { describe, expect, it } from 'vitest';
import { evalBarPercent } from './winprob';

describe('evalBarPercent', () => {
  it("matches chess.com's eval bar (measured on its analysis board)", () => {
    // Engine score → white's share of chess.com's bar.
    const measured: [number, number][] = [
      [10, 51.125],
      [109, 62.2625],
      [308, 84.65],
      [322, 86.225],
      [-28, 46.85],
    ];
    for (const [cp, bar] of measured) expect(evalBarPercent({ kind: 'cp', v: cp })).toBeCloseTo(bar, 2);
  });
  it('is full at ±4 and beyond, and for a forced mate', () => {
    expect(evalBarPercent({ kind: 'cp', v: 500 })).toBe(95);
    expect(evalBarPercent({ kind: 'cp', v: -662 })).toBe(5);
    expect(evalBarPercent({ kind: 'mate', v: 3 })).toBe(100);
    expect(evalBarPercent({ kind: 'mate', v: -2 })).toBe(0);
  });
});
