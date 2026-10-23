import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import type { AnalyzedGame } from '../lib/insights/compute';
import { skillProfile, type SkillProfile } from '../lib/insights/skills';
import { userElo } from '../lib/games/build';
import { EMPTY_FOCUS, rankAreas, updateFocus, type AreaRank, type FocusStore } from '../lib/training/focus';
import { FOCUS_KEY } from '../lib/training/today';
import type { StoredGame } from '../lib/types';

/** Fewer analysed games than this and the profile is too noisy to act on. */
export const MIN_PROFILE_GAMES = 10;

export interface SkillsData {
  /** The time class the profile is about (the one you play most). */
  timeClass: string;
  /** Your current rating in that time class. */
  rating?: number;
  /** Analysed games the profile uses, oldest first. */
  ag: AnalyzedGame[];
  profile: SkillProfile;
  ranked: AreaRank[];
  ready: boolean;
  focus: FocusStore;
}

/**
 * The timed control you play most among your recent games. Daily only when you play nothing else:
 * daily games can't be compared with other players (see baselineClass).
 */
export function mainTimeClass(games: StoredGame[]): string {
  const c = new Map<string, number>();
  for (const g of games.slice(0, 100)) c.set(g.timeClass, (c.get(g.timeClass) ?? 0) + 1);
  const ranked = [...c.entries()].sort((a, b) => b[1] - a[1]).map(([tc]) => tc);
  return ranked.find((tc) => tc !== 'daily') ?? ranked[0] ?? 'blitz';
}

/** Median of your rating over your last 20 games in a time class. */
export function currentRating(games: StoredGame[], timeClass: string): number | undefined {
  const rs = games
    .filter((g) => g.timeClass === timeClass)
    .slice(0, 20)
    .map(userElo)
    .filter((r): r is number => !!r)
    .sort((a, b) => a - b);
  return rs.length ? rs[Math.floor(rs.length / 2)] : undefined;
}

/**
 * Skill profile, area ranking and weekly focus. `games` newest first, `ag` oldest first (as from
 * useInsightData). Keeps the stored focus up to date as a side effect, unless `manageFocus` is false
 * (pages showing filtered data must not move your focus).
 */
export function useSkills(games: StoredGame[], ag: AnalyzedGame[], manageFocus = true): SkillsData {
  const stored = useLiveQuery(async () => ((await db.kv.get(FOCUS_KEY))?.value as FocusStore | undefined) ?? EMPTY_FOCUS, [], undefined);
  const data = useMemo(() => {
    const timeClass = mainTimeClass(games);
    // Costs differ a lot between bullet and rapid, so the profile sticks to one time class when
    // there are enough games in it.
    const inClass = ag.filter((a) => a.game.timeClass === timeClass);
    const timed = timeClass === 'daily' ? ag : ag.filter((a) => a.game.timeClass !== 'daily');
    const used = inClass.length >= MIN_PROFILE_GAMES ? inClass : timed.length >= MIN_PROFILE_GAMES ? timed : ag;
    const rating = currentRating(games, timeClass);
    const profile = skillProfile(used);
    return { timeClass, rating, ag: used, profile, ranked: rankAreas(profile, timeClass, rating), ready: used.length >= MIN_PROFILE_GAMES };
  }, [games, ag]);

  useEffect(() => {
    if (!manageFocus || !stored || !data.ready) return;
    const next = updateFocus(stored, data.ranked, data.ag);
    if (next !== stored) void db.kv.put({ key: FOCUS_KEY, value: next });
  }, [stored, data, manageFocus]);

  return { ...data, focus: stored ?? EMPTY_FOCUS };
}
