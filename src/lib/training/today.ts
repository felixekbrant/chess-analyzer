import { db } from '../../db/schema';
import { areaOf, type SkillArea } from '../insights/skills';
import type { Puzzle, StoredGame } from '../types';

export type SessionMinutes = 10 | 15 | 25;

/** What fits in a session of each length (a review ~3 min, a puzzle ~30 s). */
export const SESSION_TARGETS: Record<SessionMinutes, { reviews: number; puzzles: number; drill: number }> = {
  10: { reviews: 1, puzzles: 5, drill: 5 },
  15: { reviews: 2, puzzles: 8, drill: 8 },
  25: { reviews: 3, puzzles: 12, drill: 12 },
};
const REVIEW_MIN = 3;
const PUZZLE_MIN = 0.5;
/** Unreviewed games older than this aren't offered for review. */
const REVIEW_WINDOW = 14 * 86400000;

/** Puzzles done today, per part of the plan. Stored in kv under PROGRESS_KEY. */
export interface TodayProgress {
  date: string;
  puzzles: number;
  drill: number;
}

export interface Streak {
  /** Last date the plan was completed. */
  last?: string;
  count: number;
}

export const PROGRESS_KEY = 'today';
export const STREAK_KEY = 'streak';
export const FOCUS_KEY = 'focus';

/** Local calendar date, e.g. 2026-10-24. */
export function dateKey(t = Date.now()): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function startOfDay(t = Date.now()): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function progressFor(stored: TodayProgress | undefined, now = Date.now()): TodayProgress {
  const date = dateKey(now);
  return stored?.date === date ? stored : { date, puzzles: 0, drill: 0 };
}

/** Records a finished puzzle in today's plan. */
export async function addProgress(part: 'puzzles' | 'drill', now = Date.now()) {
  await db.transaction('rw', db.kv, async () => {
    const cur = progressFor((await db.kv.get(PROGRESS_KEY))?.value as TodayProgress | undefined, now);
    await db.kv.put({ key: PROGRESS_KEY, value: { ...cur, [part]: cur[part] + 1 } });
  });
}

/** Counts the plan as completed today, extending the streak if yesterday was completed too. */
export function nextStreak(s: Streak | undefined, now = Date.now()): Streak {
  const today = dateKey(now);
  if (s?.last === today) return s;
  const yesterday = dateKey(startOfDay(now) - 12 * 3600000);
  return { last: today, count: s?.last === yesterday ? s.count + 1 : 1 };
}

/** The streak as it should be displayed: it lapses after a day without the plan. */
export function currentStreak(s: Streak | undefined, now = Date.now()): number {
  if (!s?.last) return 0;
  const yesterday = dateKey(startOfDay(now) - 12 * 3600000);
  return s.last === dateKey(now) || s.last === yesterday ? s.count : 0;
}

/** The skill area a puzzle trains. Clock motifs are ignored: the position itself is what you train. */
export const puzzleArea = (p: Puzzle): SkillArea | null =>
  areaOf({ classification: p.classification, motifs: p.motifs, phase: p.phase, winBefore: p.bestWin, winLoss: p.winLoss }, false);

/** Puzzles for a focus drill, most costly mistakes first. */
export function drillPuzzles(puzzles: Puzzle[], area: SkillArea): Puzzle[] {
  return puzzles.filter((p) => puzzleArea(p) === area).sort((a, b) => b.occurrences - a.occurrences || b.winLoss - a.winLoss);
}

export interface TodayItem {
  id: string;
  kind: 'review' | 'puzzles' | 'drill';
  title: string;
  detail: string;
  minutes: number;
  done: boolean;
  /** Puzzles done / target. */
  progress?: [number, number];
  game?: StoredGame;
}

export interface TodayPlan {
  items: TodayItem[];
  done: boolean;
  minutesLeft: number;
  /** Targets for the puzzle parts, shared with the training session. */
  targets: { puzzles: number; drill: number };
}

export interface TodayInput {
  now?: number;
  minutes: SessionMinutes;
  games: StoredGame[];
  progress: TodayProgress;
  /** Puzzles due right now. */
  due: number;
  focus?: SkillArea;
  /** Puzzles available for the focus drill. */
  drillAvailable: number;
  opponent: (g: StoredGame) => string;
}

/**
 * Today's plan: review new games, the puzzles due, then a drill on this week's focus. Built from
 * live data, so it stays right as games arrive and puzzles get done; finished items stay listed.
 */
export function buildToday(x: TodayInput): TodayPlan {
  const now = x.now ?? Date.now();
  const t = SESSION_TARGETS[x.minutes];
  const dayStart = startOfDay(now);
  const items: TodayItem[] = [];

  const analysed = x.games.filter((g) => g.analysisStatus === 'done' && g.userColor);
  const reviewedToday = analysed.filter((g) => (g.reviewedAt ?? 0) >= dayStart);
  const toReview = analysed.filter((g) => !g.reviewedAt && g.endTime > now - REVIEW_WINDOW).sort((a, b) => b.endTime - a.endTime);
  for (const g of [...reviewedToday, ...toReview].slice(0, t.reviews)) {
    const done = (g.reviewedAt ?? 0) >= dayStart;
    items.push({
      id: `review:${g.id}`,
      kind: 'review',
      title: `Review your game vs ${x.opponent(g)}`,
      detail: g.userResult === 'win' ? 'Won' : g.userResult === 'loss' ? 'Lost' : g.userResult === 'draw' ? 'Draw' : '',
      minutes: REVIEW_MIN,
      done,
      game: g,
    });
  }

  const puzzles = Math.min(t.puzzles, x.progress.puzzles + x.due);
  if (puzzles > 0) {
    items.push({
      id: 'puzzles',
      kind: 'puzzles',
      title: 'Puzzles from your mistakes',
      detail: 'Positions due for another try',
      minutes: puzzles * PUZZLE_MIN,
      done: x.progress.puzzles >= puzzles,
      progress: [Math.min(x.progress.puzzles, puzzles), puzzles],
    });
  }

  const drill = x.focus && x.focus !== 'time' ? Math.min(t.drill, x.drillAvailable) : 0;
  if (drill > 0) {
    items.push({
      id: 'drill',
      kind: 'drill',
      title: 'Focus drill',
      detail: 'Your own positions from this week\'s focus',
      minutes: drill * PUZZLE_MIN,
      done: x.progress.drill >= drill,
      progress: [Math.min(x.progress.drill, drill), drill],
    });
  }

  const left = items.filter((i) => !i.done);
  return {
    items,
    done: items.length > 0 && !left.length,
    minutesLeft: Math.round(left.reduce((s, i) => s + (i.progress ? (i.progress[1] - i.progress[0]) * PUZZLE_MIN : i.minutes), 0)),
    targets: { puzzles, drill },
  };
}
