import { describe, expect, it } from 'vitest';
import { playMove, stepBack, stepForward, toEnd, toStart } from './moveSteps';

describe('moveSteps', () => {
  const s: { base: string } & import('./moveSteps').MoveSteps = { base: 'x', moves: ['e2e4', 'e7e5', 'g1f3'] };

  it('steps back and forward again', () => {
    const back = stepBack(stepBack(s));
    expect(back.moves).toEqual(['e2e4']);
    expect(back.future).toEqual(['e7e5', 'g1f3']);
    expect(stepForward(back).moves).toEqual(['e2e4', 'e7e5']);
    expect(stepForward(stepForward(stepForward(back))).moves).toEqual(s.moves);
  });

  it('jumps to the start and the end', () => {
    expect(toStart(s).moves).toEqual([]);
    expect(toEnd(toStart(s)).moves).toEqual(s.moves);
  });

  it('keeps the moves ahead when the next one is played, drops them for another move', () => {
    const back = stepBack(stepBack(s));
    expect(playMove(back, 'e7e5').future).toEqual(['g1f3']);
    expect(playMove(back, 'c7c5')).toMatchObject({ moves: ['e2e4', 'c7c5'], future: [] });
  });

  it('does nothing at either end', () => {
    expect(stepBack({ moves: [] })).toEqual({ moves: [] });
    expect(stepForward(s)).toBe(s);
  });
});
