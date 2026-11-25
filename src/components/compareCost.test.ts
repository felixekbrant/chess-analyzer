import { describe, expect, it } from 'vitest';
import { compareCost } from './Coaching';

describe('compareCost', () => {
  it('follows the numbers, and says "clearly" only with the statistics behind it', () => {
    expect(compareCost({ cost: 3.2, typical: 1.1, verdict: 'worse' })).toBe('worse');
    expect(compareCost({ cost: 18, typical: 12, verdict: 'typical' })).toBe('above');
    expect(compareCost({ cost: 12, typical: 12.5, verdict: 'typical' })).toBe('typical');
    expect(compareCost({ cost: 7, typical: 10, verdict: 'typical' })).toBe('below');
    expect(compareCost({ cost: 1.7, typical: 4.1, verdict: 'better' })).toBe('better');
    expect(compareCost({ cost: 5 })).toBeUndefined();
  });
});
