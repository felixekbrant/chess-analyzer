import { describe, expect, it } from 'vitest';
import seed from '../../../e2e/fixtures/seed.json';
import type { GameSummary } from '../insights/summary';
import type { StoredGame } from '../types';
import { STATS_TOOLS, applyFilter, describeFilter, runStatsTool, uncheckedNumbers } from './stats';

const games = (seed.games as unknown as StoredGame[]).slice().sort((a, b) => b.endTime - a.endTime);
const summaries = new Map((seed.summaries as unknown as GameSummary[]).map((s) => [s.gameId, s]));
const now = games[0].endTime + 1000;

describe('stats tools', () => {
  it('every tool answers, with how many games it rests on', () => {
    for (const t of STATS_TOOLS) {
      const r = runStatsTool(t.function.name, {}, games, summaries, now);
      expect(r.error).toBeUndefined();
      expect(r.games).toBe(games.filter((g) => g.userColor && g.userResult).length);
    }
  });

  it('results add up', () => {
    const r = runStatsTool('results', {}, games, summaries, now) as { games: number; wins: number; draws: number; losses: number };
    expect(r.wins + r.draws + r.losses).toBe(r.games);
  });

  it('filters by colour, time control, period and opening', () => {
    const white = applyFilter(games, { color: 'white' }, now);
    expect(white.every((g) => g.userColor === 'w')).toBe(true);
    expect(applyFilter(games, { fromDaysAgo: 0 }, now)).toHaveLength(0);
    const name = games.find((g) => g.openingName)!.openingName!.split(' ')[0];
    expect(applyFilter(games, { opening: name.toLowerCase() }, now).length).toBeGreaterThan(0);
    expect(describeFilter({ timeControl: 'blitz', color: 'black', fromDaysAgo: 60, toDaysAgo: 30 })).toBe('blitz games as Black from 60 to 30 days ago');
  });

  it('says when there are too few games', () => {
    const r = runStatsTool('results', { fromDaysAgo: 0 }, games, summaries, now);
    expect(r.games).toBe(0);
    expect(runStatsTool('openings', { opening: 'zzz' }, games, summaries, now).games).toBe(0);
  });
});

describe('uncheckedNumbers', () => {
  it('accepts numbers from the tools, rounded ones and small counts', () => {
    expect(uncheckedNumbers('You scored 64% in 29 games, with 2 losses on time and 74.4 accuracy.', '{"scorePct":64,"games":29,"accuracy":74.43}')).toEqual([]);
    expect(uncheckedNumbers('Accuracy about 74%.', '{"accuracy":74.4}')).toEqual([]);
  });

  it('flags numbers no tool returned', () => {
    expect(uncheckedNumbers('You won 71% of 40 games.', '{"scorePct":64,"games":29}')).toEqual(['71', '40']);
  });
});
