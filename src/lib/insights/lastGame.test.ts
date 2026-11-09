import { describe, expect, it } from 'vitest';
import type { AnalyzedGame } from './compute';
import { lastGameMoment } from './lastGame';
import type { SummaryMove } from './summary';

const move = (over: Partial<SummaryMove>): SummaryMove => ({
  ply: 20, moveNumber: 11, color: 'w', san: 'Nf3', classification: 'good', motifs: [], phase: 'middlegame',
  winBefore: 50, winAfter: 50, winLoss: 0, accuracy: 95, isBook: false, bestSan: 'Nf3', ...over,
});

const game = (userResult: 'win' | 'loss' | 'draw', moves: SummaryMove[], over: object = {}): AnalyzedGame =>
  ({ game: { id: 'g', userResult, userColor: 'w', timeClass: 'rapid', timeControl: '600', endReason: 'resigned', ...over }, summary: {}, moves, color: 'w' }) as unknown as AnalyzedGame;

describe('lastGameMoment', () => {
  it('a loss shows the move that decided it, and why', () => {
    const blunder = move({ ply: 40, moveNumber: 21, san: 'Qh6', classification: 'blunder', motifs: ['hung_piece'], winBefore: 55, winAfter: 10, winLoss: 45, timeSpent: 20, clock: 300 });
    const m = lastGameMoment(game('loss', [move({}), blunder]));
    expect(m.move).toBe(blunder);
    expect(m.headline).toBe('It turned on 21.Qh6.');
    expect(m.tags[0]).toBe('Blunder check');
  });

  it('a loss on time in a playable position has no move to show', () => {
    const m = lastGameMoment(game('loss', [move({})], { endReason: 'timeout' }));
    expect(m.move).toBeUndefined();
    expect(m.headline).toBe('Lost on time in a playable position.');
  });

  it('a win shows the biggest slip only when it was a real one', () => {
    const slip = move({ san: 'Bd3', classification: 'mistake', winBefore: 80, winAfter: 55, winLoss: 25 });
    expect(lastGameMoment(game('win', [slip])).headline).toBe('Your biggest slip was 11.Bd3.');
    const small = move({ classification: 'mistake', winBefore: 95, winAfter: 85, winLoss: 10 });
    expect(lastGameMoment(game('win', [small]))).toEqual({ headline: 'No big mistakes.', tags: [] });
    expect(lastGameMoment(game('win', [move({})])).headline).toBe('No mistakes or blunders.');
  });
});
