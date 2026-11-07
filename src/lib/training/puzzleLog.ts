import { db } from '../../db/schema';
import type { SkillArea } from '../insights/skills';

/** One finished puzzle, for showing whether a weakness improves in training. */
export interface PuzzleTry {
  at: number;
  area: SkillArea | null;
  /** Solved first time, without a hint, the solution or the engine. */
  clean: boolean;
  /** From your own games (not a Lichess drill puzzle). */
  own: boolean;
}

export const PUZZLE_LOG_KEY = 'puzzleLog';
/** Plenty for months of training; older tries drop off. */
const MAX_TRIES = 3000;
const DAY = 86400000;

export async function logPuzzleTry(t: PuzzleTry) {
  await db.transaction('rw', db.kv, async () => {
    const log = ((await db.kv.get(PUZZLE_LOG_KEY))?.value as PuzzleTry[] | undefined) ?? [];
    await db.kv.put({ key: PUZZLE_LOG_KEY, value: [...log, t].slice(-MAX_TRIES) });
  });
}

export interface TryWindow {
  tries: number;
  clean: number;
}

/** First-try results in an area: the last `days` days, and everything before. */
export function areaTries(log: PuzzleTry[], area: SkillArea, now = Date.now(), days = 14): { recent: TryWindow; before: TryWindow } {
  const since = now - days * DAY;
  const recent = { tries: 0, clean: 0 };
  const before = { tries: 0, clean: 0 };
  for (const t of log) {
    if (t.area !== area) continue;
    const w = t.at >= since ? recent : before;
    w.tries++;
    if (t.clean) w.clean++;
  }
  return { recent, before };
}
