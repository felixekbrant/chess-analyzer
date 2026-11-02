import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import type { SkillArea } from '../lib/insights/skills';
import { playerRating, topUpDrill } from '../lib/training/lichess';
import { drillCount, SESSION_TARGETS, type SessionMinutes } from '../lib/training/today';
import type { Puzzle, StoredGame } from '../lib/types';

/**
 * The Lichess puzzles stored for drills. While a focus is set and your own games don't give today's
 * drill enough puzzles, tops it up from the matching pack (in the background; the live query then
 * picks the new puzzles up).
 */
export function useDrillStock(focus: SkillArea | undefined, own: Puzzle[] | undefined, games: StoredGame[] | undefined, minutes: SessionMinutes) {
  const ext = useLiveQuery(() => db.extPuzzles.toArray(), []);
  const rating = useMemo(() => (games ? playerRating(games) : undefined), [games]);
  const need = SESSION_TARGETS[minutes].drill;
  const available = focus && own && ext ? drillCount(own, focus, ext) : undefined;
  useEffect(() => {
    if (!focus || focus === 'time' || available === undefined || !games) return;
    if (available < need) void topUpDrill(focus, rating, need - available);
  }, [focus, available, need, rating, games]);
  return ext;
}
