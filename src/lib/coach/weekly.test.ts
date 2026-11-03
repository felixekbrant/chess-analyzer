import { describe, expect, it } from 'vitest';
import seed from '../../../e2e/fixtures/seed.json';
import { joinAnalyzed } from '../insights/compute';
import type { GameSummary } from '../insights/summary';
import type { StoredGame } from '../types';
import { weekHasGames, weeklyFacts } from './weekly';

const games = (seed.games as unknown as StoredGame[]).slice().sort((a, b) => b.endTime - a.endTime);
const summaries = new Map((seed.summaries as unknown as GameSummary[]).map((s) => [s.gameId, s]));
const ag = joinAnalyzed(games, summaries);

describe('weeklyFacts', () => {
  const now = games[0].endTime + 1000;
  const f = weeklyFacts(games, ag, { now, focus: 'time' });
  const inWeek = games.filter((g) => g.endTime >= now - 7 * 864e5).length;

  it('counts the last 7 days and compares with the week before', () => {
    expect(f.thisWeek.games).toBe(inWeek);
    expect(f.changes[0]).toMatch(/^Games played: \d+/);
    expect(weekHasGames(games, now)).toBe(inWeek >= 3);
  });

  it('judges each comparison, so the wording cannot flip it', () => {
    for (const c of f.changes.slice(1)) expect(c).toMatch(/\((better|worse|nothing from the week before to compare with)\)$|about the same/);
  });

  it('names the focus area and the rating per time control', () => {
    expect(f.focus?.area).toBe('Time management');
    for (const r of f.ratings) expect(r.change).toBe((r.to ?? 0) - (r.from ?? 0));
  });

  it('is quiet with no games this week', () => {
    expect(weeklyFacts(games, ag, { now: now + 30 * 864e5 }).thisWeek.games).toBe(0);
    expect(weekHasGames(games, now + 30 * 864e5)).toBe(false);
  });
});
