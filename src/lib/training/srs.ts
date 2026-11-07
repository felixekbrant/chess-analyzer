import type { Puzzle } from '../types';

/**
 * Puzzles are done once. There's no spaced repetition: repeating the same position trains memory
 * of that position, not the idea. A finished puzzle (solved or missed) is retired for good, and
 * practice continues with new positions, a missed one followed by a new one with the same idea.
 */

/** How the try went: missed (or revealed), solved with help, solved, solved fast. */
export type Grade = 'again' | 'hard' | 'good' | 'easy';

/** A due date that never comes: everything that looks for puzzles that are ready skips it. */
export const RETIRED = 8.64e15;

/** Scheduling fields of a new puzzle (kept for the stored shape; they aren't used to repeat). */
export const NEW_CARD = { interval: 0, ease: 2.5, reps: 0, lapses: 0 };

/** What to store when a puzzle is finished: done, and never due again. */
export function retire(grade: Grade, now = Date.now()): Pick<Puzzle, 'doneAt' | 'due' | 'lastResult' | 'seenAt'> {
  return { doneAt: now, due: RETIRED, lastResult: grade === 'again' ? 'failed' : 'solved', seenAt: now };
}

export const isDone = (p: Pick<Puzzle, 'doneAt'>) => p.doneAt !== undefined;
