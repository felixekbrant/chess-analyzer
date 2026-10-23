import type { AnalyzedGame } from '../insights/compute';
import { skillLevel, typicalCost } from '../insights/baselines';
import { SKILL_META, areaCost, type SkillArea, type SkillProfile } from '../insights/skills';

const DAY = 86400000;
export const FOCUS_DAYS = 7;
/** Games needed in a focus week before it can be judged. */
const MIN_GAMES = 3;
/** "Clearly better": the area's cost dropped by at least this share. */
const IMPROVED = 0.8;

export interface FocusState {
  area: SkillArea;
  startedAt: number;
  until: number;
  /** Cost per game in the area over the 20 games before the focus started. */
  before: number;
  /** Already given a second week. */
  extended: boolean;
  /** Picked by the user rather than the app. */
  manual: boolean;
}

export interface FocusResult {
  area: SkillArea;
  startedAt: number;
  endedAt: number;
  before: number;
  after: number;
  improved: boolean;
}

export interface FocusStore {
  current?: FocusState;
  /** The most recently finished focus, for the "nice, down 35%" card. */
  last?: FocusResult;
  history: FocusResult[];
}

export const EMPTY_FOCUS: FocusStore = { history: [] };

export interface AreaRank {
  area: SkillArea;
  cost: number;
  typical?: number;
  level?: number;
  /** Your cost minus the typical cost at your rating (or your cost, without reference data). */
  excess: number;
  score: number;
}

/** Areas ordered by how much they hold you back compared with players at your rating. */
export function rankAreas(profile: SkillProfile, timeClass: string, rating: number | undefined): AreaRank[] {
  return profile.stats
    .map((s) => {
      const typical = rating ? typicalCost(s.area, timeClass, rating) : undefined;
      const excess = typical === undefined ? s.cost : s.cost - typical;
      // Needs a few real examples, or there is nothing to train.
      const enough = s.errorsPerGame * profile.games >= 3;
      return {
        area: s.area,
        cost: s.cost,
        typical,
        level: skillLevel(s.area, timeClass, s.cost),
        excess,
        score: enough ? excess * SKILL_META[s.area].trainable : -Infinity,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function start(area: SkillArea, now: number, ag: AnalyzedGame[], manual: boolean): FocusState {
  const prior = ag.filter((a) => a.game.endTime < now).slice(-20);
  return { area, startedAt: now, until: now + FOCUS_DAYS * DAY, before: areaCost(prior, area), extended: false, manual };
}

/**
 * Keeps the weekly focus up to date. A focus lasts a week. Then it's judged on the games played
 * during it: clearly better, or already extended once, and the next area is picked; otherwise
 * it gets one more week. Returns the same object when nothing changed.
 */
export function updateFocus(store: FocusStore, ranked: AreaRank[], ag: AnalyzedGame[], now = Date.now()): FocusStore {
  const pick = (exclude?: SkillArea) => ranked.find((r) => r.score > 0 && r.area !== exclude)?.area;
  const cur = store.current;
  if (!cur) {
    const area = pick();
    return area ? { ...store, current: start(area, now, ag, false) } : store;
  }
  if (now < cur.until) return store;

  const during = ag.filter((a) => a.game.endTime >= cur.startedAt);
  // Not enough games played this week to tell: give it another week without counting it.
  if (during.length < MIN_GAMES) return { ...store, current: { ...cur, until: now + FOCUS_DAYS * DAY } };

  const after = areaCost(during, cur.area);
  const improved = after <= cur.before * IMPROVED;
  if (!improved && !cur.extended) return { ...store, current: { ...cur, extended: true, until: now + FOCUS_DAYS * DAY } };

  const result: FocusResult = { area: cur.area, startedAt: cur.startedAt, endedAt: now, before: cur.before, after, improved };
  const area = pick(cur.area);
  return { current: area ? start(area, now, ag, false) : undefined, last: result, history: [...store.history, result].slice(-20) };
}

/** The user picks the focus themselves. */
export function chooseFocus(store: FocusStore, area: SkillArea, ag: AnalyzedGame[], now = Date.now()): FocusStore {
  return { ...store, current: start(area, now, ag, true) };
}

/** Day number (1-based) of the current focus week. */
export function focusDay(f: FocusState, now = Date.now()): number {
  return Math.max(1, Math.min(FOCUS_DAYS, Math.floor((now - (f.until - FOCUS_DAYS * DAY)) / DAY) + 1));
}
