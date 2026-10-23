import { describe, expect, it } from 'vitest';
import type { AnalyzedGame } from '../insights/compute';
import type { GameSummary, SummaryMove } from '../insights/summary';
import { SKILL_AREAS, areaOf, gameAreaCosts, skillProfile, type SkillArea } from '../insights/skills';
import { skillLevel, typicalCost } from '../insights/baselines';
import { chooseFocus, rankAreas, updateFocus, type AreaRank, type FocusStore } from '../training/focus';
import { buildToday, currentStreak, dateKey, nextStreak, progressFor } from '../training/today';
import type { Motif, StoredGame } from '../types';
import { mainTimeClass } from '../../hooks/useSkills';

const DAY = 86400000;

function mv(over: Partial<SummaryMove> = {}): SummaryMove {
  return {
    ply: 20,
    moveNumber: 11,
    color: 'w',
    san: 'Nf3',
    classification: 'mistake',
    motifs: [],
    phase: 'middlegame',
    winBefore: 50,
    winAfter: 38,
    winLoss: 12,
    accuracy: 40,
    isBook: false,
    ...over,
  };
}

function game(moves: SummaryMove[], over: Partial<StoredGame> = {}, endTime = 0): AnalyzedGame {
  const g = { id: `g${Math.random()}`, timeClass: 'blitz', userColor: 'w', userResult: 'loss', endReason: 'resigned', endTime, ...over } as StoredGame;
  const summary = { gameId: g.id, userColor: 'w', moves, userWin: [50, 40] } as unknown as GameSummary;
  return { game: g, summary, moves, color: 'w' };
}

describe('skill areas', () => {
  it('charges each costly move to exactly one area, in priority order', () => {
    const tactic = (m: Motif) => mv({ motifs: [m] });
    expect(areaOf(mv({ winLoss: 3 }))).toBeNull();
    expect(areaOf(tactic('time_trouble'))).toBe('time');
    // Daily games: clock motifs fall through to what went wrong on the board.
    expect(areaOf(mv({ motifs: ['time_trouble', 'hung_piece'] }), false)).toBe('blunder_check');
    expect(areaOf(mv({ motifs: ['hung_piece', 'allowed_fork'] }))).toBe('blunder_check');
    expect(areaOf(tactic('allowed_fork'))).toBe('opp_tactics');
    expect(areaOf(mv({ classification: 'miss' }))).toBe('chances');
    expect(areaOf(tactic('missed_win'))).toBe('chances');
    // A hung piece in the opening is trained as a tactic, not as opening theory.
    expect(areaOf(mv({ phase: 'opening', motifs: ['hung_piece'] }))).toBe('blunder_check');
    expect(areaOf(mv({ phase: 'opening' }))).toBe('opening');
    expect(areaOf(mv({ winBefore: 85 }))).toBe('converting');
    expect(areaOf(mv({ winBefore: 20 }))).toBe('defending');
    expect(areaOf(mv({ phase: 'endgame' }))).toBe('endgame');
    expect(areaOf(mv({ motifs: ['positional'] }))).toBe('middlegame');
  });

  it('adds up to the total loss, and counts flagging from a decent position as time', () => {
    const moves = [mv({ winLoss: 12 }), mv({ winLoss: 30, motifs: ['hung_piece'] }), mv({ winLoss: 2 }), mv({ winLoss: 8, phase: 'endgame' })];
    const costs = gameAreaCosts({ moves, timed: true, lostOnTime: true, finalWin: 60 });
    const total = SKILL_AREAS.reduce((s, a) => s + costs[a], 0);
    expect(total).toBe(12 + 30 + 8 + 60);
    expect(costs.time).toBe(60);
    expect(gameAreaCosts({ moves, timed: true, lostOnTime: true, finalWin: 10 }).time).toBe(0);
    expect(gameAreaCosts({ moves, timed: false, lostOnTime: true, finalWin: 60 }).time).toBe(0);
  });

  it('builds a profile with shares, examples and a trend', () => {
    // 20 older games with an endgame error each, then 10 recent clean ones.
    const ag = [
      ...Array.from({ length: 20 }, (_, i) => game([mv({ phase: 'endgame', winLoss: 20 })], {}, i)),
      ...Array.from({ length: 10 }, (_, i) => game([mv({ winLoss: 1 })], {}, 100 + i)),
    ];
    const p = skillProfile(ag);
    const end = p.stats.find((s) => s.area === 'endgame')!;
    expect(p.games).toBe(30);
    expect(end.cost).toBeCloseTo((20 * 20) / 30);
    expect(end.share).toBeCloseTo(100);
    expect(end.trend).toBe('improving');
    expect(end.examples.length).toBeGreaterThan(0);
    expect(end.series.length).toBe(26);
  });
});

describe('reference data', () => {
  it('is monotone: a lower cost means a higher skill level', () => {
    const area: SkillArea = 'blunder_check';
    const t = typicalCost(area, 'blitz', 1200);
    if (t === undefined) return; // no reference data generated yet
    expect(typicalCost(area, 'blitz', 1800)!).toBeLessThan(t);
    expect(skillLevel(area, 'blitz', t)).toBeCloseTo(1200, -2);
    expect(skillLevel(area, 'blitz', t / 3)!).toBeGreaterThan(1200);
    expect(skillLevel(area, 'blitz', 0)).toBe(2400);
    expect(skillLevel(area, 'daily', t)).toBeUndefined();
  });
});

describe('weekly focus', () => {
  const rank = (areas: SkillArea[]): AreaRank[] => areas.map((area, i) => ({ area, cost: 10 - i, excess: 5 - i, score: 5 - i }));
  const t0 = 1_000 * DAY;
  const history = Array.from({ length: 20 }, (_, i) => game([mv({ phase: 'endgame', winLoss: 20 })], {}, t0 - (20 - i) * DAY));

  it('picks the area furthest behind and keeps it for a week', () => {
    const s1 = updateFocus({ history: [] }, rank(['endgame', 'opening']), history, t0);
    expect(s1.current?.area).toBe('endgame');
    expect(s1.current?.before).toBe(20);
    expect(updateFocus(s1, rank(['opening', 'endgame']), history, t0 + 3 * DAY)).toBe(s1);
  });

  it('moves on when clearly better, gives one extra week otherwise', () => {
    const s1 = updateFocus({ history: [] }, rank(['endgame', 'opening']), history, t0);
    const better = [...history, ...Array.from({ length: 4 }, (_, i) => game([mv({ phase: 'endgame', winLoss: 5 })], {}, t0 + (i + 1) * DAY))];
    const s2 = updateFocus(s1, rank(['endgame', 'opening']), better, t0 + 8 * DAY);
    expect(s2.last).toMatchObject({ area: 'endgame', improved: true });
    expect(s2.current?.area).toBe('opening');

    const same = [...history, ...Array.from({ length: 4 }, (_, i) => game([mv({ phase: 'endgame', winLoss: 20 })], {}, t0 + (i + 1) * DAY))];
    const s3 = updateFocus(s1, rank(['endgame', 'opening']), same, t0 + 8 * DAY);
    expect(s3.current).toMatchObject({ area: 'endgame', extended: true });
    const s4 = updateFocus(s3, rank(['endgame', 'opening']), same, t0 + 15 * DAY);
    expect(s4.last).toMatchObject({ area: 'endgame', improved: false });
    expect(s4.current?.area).toBe('opening');
  });

  it('waits for games before judging, and lets you choose', () => {
    const s1 = updateFocus({ history: [] }, rank(['endgame']), history, t0);
    const s2 = updateFocus(s1, rank(['endgame']), history, t0 + 8 * DAY);
    expect(s2.current).toMatchObject({ area: 'endgame', extended: false });
    expect(s2.current!.until).toBeGreaterThan(t0 + 8 * DAY);
    const s3: FocusStore = chooseFocus(s2, 'opening', history, t0 + 9 * DAY);
    expect(s3.current).toMatchObject({ area: 'opening', manual: true });
  });

  it('ranks by excess over players at your rating', () => {
    const ag = Array.from({ length: 12 }, () => game([mv({ phase: 'endgame', winLoss: 20 }), mv({ winBefore: 85, winLoss: 6 })]));
    const ranked = rankAreas(skillProfile(ag), 'blitz', 1200);
    expect(ranked[0].score).toBeGreaterThan(0);
    // An area you never err in is never picked.
    expect(ranked.find((r) => r.area === 'opening')!.score).toBe(-Infinity);
  });
});

describe('today', () => {
  const now = new Date(2026, 9, 24, 15, 0).getTime();
  const g = (id: string, over: Partial<StoredGame> = {}) =>
    ({ id, white: 'me', black: id, userColor: 'w', userResult: 'win', analysisStatus: 'done', endTime: now - DAY, ...over }) as StoredGame;
  const base = { now, minutes: 15 as const, due: 3, focus: 'endgame' as SkillArea, drillAvailable: 20, opponent: (x: StoredGame) => x.black };

  it('plans reviews, due puzzles and a focus drill', () => {
    const games = [g('a'), g('b', { endTime: now - 2 * DAY }), g('c', { endTime: now - 3 * DAY }), g('old', { endTime: now - 30 * DAY })];
    const plan = buildToday({ ...base, games, progress: progressFor(undefined, now) });
    expect(plan.items.map((i) => i.id)).toEqual(['review:a', 'review:b', 'puzzles', 'drill']);
    expect(plan.targets).toEqual({ puzzles: 3, drill: 8 });
    expect(plan.done).toBe(false);
  });

  it('keeps finished items and completes', () => {
    const games = [g('a', { reviewedAt: now - 3600000 }), g('b', { reviewedAt: now - 7200000 })];
    const plan = buildToday({ ...base, games, due: 0, progress: { date: dateKey(now), puzzles: 3, drill: 8 } });
    expect(plan.items.map((i) => [i.id, i.done])).toEqual([
      ['review:a', true],
      ['review:b', true],
      ['puzzles', true],
      ['drill', true],
    ]);
    expect(plan.done).toBe(true);
    expect(plan.minutesLeft).toBe(0);
  });

  it('has no drill for time management and resets progress each day', () => {
    const plan = buildToday({ ...base, focus: 'time', games: [], progress: progressFor(undefined, now) });
    expect(plan.items.map((i) => i.id)).toEqual(['puzzles']);
    expect(progressFor({ date: '2000-01-01', puzzles: 5, drill: 2 }, now)).toEqual({ date: dateKey(now), puzzles: 0, drill: 0 });
  });

  it('counts a streak of consecutive days', () => {
    const s1 = nextStreak(undefined, now);
    expect(s1.count).toBe(1);
    expect(nextStreak(s1, now)).toBe(s1);
    const s2 = nextStreak(s1, now + DAY);
    expect(s2.count).toBe(2);
    expect(currentStreak(s2, now + 2 * DAY)).toBe(2);
    expect(currentStreak(s2, now + 3 * DAY)).toBe(0);
    expect(nextStreak(s2, now + 4 * DAY).count).toBe(1);
  });
});

describe('main time control', () => {
  const tc = (...xs: string[]) => xs.map((timeClass) => ({ timeClass }) as StoredGame);
  it('prefers your most-played timed control over daily', () => {
    expect(mainTimeClass(tc('daily', 'daily', 'daily', 'blitz', 'rapid', 'blitz'))).toBe('blitz');
    expect(mainTimeClass(tc('daily', 'daily'))).toBe('daily');
    expect(mainTimeClass([])).toBe('blitz');
  });
});
