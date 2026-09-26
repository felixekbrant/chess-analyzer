import type { Puzzle } from '../types';

const DAY = 24 * 3600 * 1000;

export type Grade = 'again' | 'hard' | 'good' | 'easy';

const QUALITY: Record<Grade, number> = { again: 1, hard: 3, good: 4, easy: 5 };

/** SM-2 spaced repetition. Failed puzzles come back in 10 minutes, then 1 day, then grow by the ease factor. */
export function schedule(p: Pick<Puzzle, 'interval' | 'ease' | 'reps' | 'lapses'>, grade: Grade, now = Date.now()) {
  const q = QUALITY[grade];
  let { interval, ease, reps, lapses } = p;
  if (q < 3) {
    reps = 0;
    lapses += 1;
    interval = 0;
    return { interval, ease: Math.max(1.3, ease - 0.2), reps, lapses, due: now + 10 * 60 * 1000 };
  }
  reps += 1;
  if (reps === 1) interval = 1;
  else if (reps === 2) interval = grade === 'easy' ? 4 : 3;
  else interval = Math.round(interval * ease * (grade === 'hard' ? 0.8 : grade === 'easy' ? 1.3 : 1));
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  return { interval, ease, reps, lapses, due: now + interval * DAY };
}

export const NEW_CARD = { interval: 0, ease: 2.5, reps: 0, lapses: 0 };
