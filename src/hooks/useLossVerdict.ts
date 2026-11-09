import { useMemo } from 'react';
import type { AnalyzedGame } from '../lib/insights/compute';
import { LOSSES, lossFocus, lossReport, type LossFocus } from '../lib/insights/losses';
import type { StoredGame } from '../lib/types';
import { mainTimeClass } from './useSkills';

/** Enough analysed losses to say something. */
export const MIN_LOSSES = 3;

/**
 * What your last losses (in your main time control) have in common, as on the losses page:
 * `games` newest first. Undefined until a few of them are analysed.
 */
export function useLossVerdict(games: StoredGame[], ag: AnalyzedGame[]): LossFocus | undefined {
  return useMemo(() => {
    const timeClass = mainTimeClass(games);
    const ids = games.filter((g) => g.userResult === 'loss' && g.timeClass === timeClass).slice(0, LOSSES).map((g) => g.id);
    const byId = new Map(ag.map((a) => [a.game.id, a]));
    const analysed = ids.flatMap((id) => byId.get(id) ?? []);
    return analysed.length >= MIN_LOSSES ? lossFocus(lossReport(analysed)) : undefined;
  }, [games, ag]);
}
