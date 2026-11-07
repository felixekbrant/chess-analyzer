import type { Puzzle } from '../types';
import type { Grade } from './srs';

/** Clean solves (first try, no help) on different days that make a puzzle mastered. */
export const MASTERY_SOLVES = 3;
const DAY = 86400000;
/** Solves count only when spread out: at least most of a day after the last one that counted. */
const GAP = 20 * 3600 * 1000;

export type Mastery = 'mastered' | 'learning' | 'new';

/**
 * A puzzle's mastery after a try: a clean solve counts (once per day), a solve with help keeps what
 * you had, and a miss starts over, so "mastered" means you've found it cleanly on three separate days
 * without missing it in between.
 */
export function nextMastery(p: Pick<Puzzle, 'mastery'>, grade: Grade, now = Date.now()): number[] {
  const m = p.mastery ?? [];
  if (grade === 'again') return [];
  if (grade === 'hard') return m;
  if (m.length && now - m[m.length - 1] < GAP) return m;
  return [...m, now].slice(-MASTERY_SOLVES);
}

/** Whether this try counted towards mastery (not a second clean solve on the same day). */
export const counted = (after: number[], now: number) => after[after.length - 1] === now;

export function masteryOf(p: Pick<Puzzle, 'mastery' | 'lastResult' | 'reps' | 'lapses'>): Mastery {
  if ((p.mastery?.length ?? 0) >= MASTERY_SOLVES) return 'mastered';
  return p.lastResult || p.reps || p.lapses || p.mastery?.length ? 'learning' : 'new';
}

export interface MasteryCount {
  mastered: number;
  learning: number;
  new: number;
  total: number;
}

export function countMastery(ps: Puzzle[]): MasteryCount {
  const c: MasteryCount = { mastered: 0, learning: 0, new: 0, total: ps.length };
  for (const p of ps) c[masteryOf(p)]++;
  return c;
}

export const masteryText = (c: MasteryCount) => `${c.mastered} mastered · ${c.learning} learning · ${c.new} new`;

/**
 * For puzzles made before mastery existed: credit what the schedule proves. With no miss and an
 * unchanged or higher ease, every solve was a clean one (a solve with help lowers the ease), and
 * the schedule kept them days apart.
 */
export function backfilledMastery(p: Puzzle): number[] {
  if (p.reps < 1 || p.lapses > 0 || p.ease < 2.5 || p.lastResult !== 'solved') return [];
  const last = p.seenAt ?? p.due - p.interval * DAY;
  const n = Math.min(p.reps, MASTERY_SOLVES);
  return Array.from({ length: n }, (_, i) => last - (n - 1 - i) * DAY);
}
