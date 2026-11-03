import { describe, expect, it } from 'vitest';
import { THROWN_CP, formatPeak, isThrown, peakAdvantage } from '../games/thrown';
import type { GameAnalysis, StoredGame } from '../types';
import seed from '../../../e2e/fixtures/seed.json';

const data = seed as unknown as { games: StoredGame[]; analyses: GameAnalysis[] };

describe('thrown games', () => {
  it('measures your biggest advantage after your own moves, from your side', () => {
    const moves = [{ color: 'w' }, { color: 'b' }, { color: 'w' }, { color: 'b' }] as GameAnalysis['moves'];
    const evals = [
      { kind: 'cp', v: 0 },
      { kind: 'cp', v: 120 }, // after White's move
      { kind: 'cp', v: 900 }, // after Black's move: not Black's own advantage, and not counted for White
      { kind: 'cp', v: 350 }, // after White's move
      { kind: 'cp', v: -200 }, // after Black's move
    ] as GameAnalysis['evals'];
    expect(peakAdvantage({ moves, evals }, 'w')).toBe(350);
    expect(peakAdvantage({ moves, evals }, 'b')).toBe(200);
    expect(peakAdvantage({ moves, evals: [...evals.slice(0, 3), { kind: 'mate', v: 3 }, evals[4]] }, 'w')).toBe(10000);
  });

  it('counts losses from +3 or better only', () => {
    expect(isThrown({ userResult: 'loss', peakEval: THROWN_CP })).toBe(true);
    expect(isThrown({ userResult: 'loss', peakEval: THROWN_CP - 1 })).toBe(false);
    expect(isThrown({ userResult: 'draw', peakEval: 800 })).toBe(false);
    expect(isThrown({ userResult: 'win', peakEval: 800 })).toBe(false);
    expect(isThrown({ userResult: 'loss' })).toBe(false);
    expect(formatPeak(746)).toBe('+7.5');
    expect(formatPeak(10000)).toBe('mate');
  });

  it('finds the two thrown games in the fixture', () => {
    const byId = new Map(data.analyses.map((a) => [a.gameId, a]));
    const thrown = data.games.filter((g) => {
      const a = byId.get(g.id);
      return a && g.userColor && isThrown({ ...g, peakEval: peakAdvantage(a, g.userColor) });
    });
    expect(thrown.map((g) => g.black).sort()).toEqual(['AdoNur', 'mikula68']);
  });
});
