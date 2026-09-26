import { useDeferredValue, useMemo } from 'react';
import { useGames, useSummaries } from './useStores';
import { joinAnalyzed, type AnalyzedGame } from '../lib/insights/compute';
import type { StoredGame } from '../lib/types';
import type { GameSummary } from '../lib/insights/summary';

export interface InsightFilters {
  timeClass: string;
  days: number; // 0 = all
  color: string;
}

export const DEFAULT_FILTERS: InsightFilters = { timeClass: 'all', days: 0, color: 'all' };

export function useInsightData(f: InsightFilters): { games: StoredGame[]; summaries: Map<string, GameSummary>; ag: AnalyzedGame[]; loading: boolean } {
  // Deferred so that a burst of DB updates (e.g. the analysis queue finishing games) never blocks input.
  const games = useDeferredValue(useGames());
  const summaries = useDeferredValue(useSummaries());
  return useMemo(() => {
    if (!games || !summaries) return { games: [], summaries: new Map(), ag: [], loading: true };
    const since = f.days ? Date.now() - f.days * 86400000 : 0;
    const filtered = games.filter(
      (g) =>
        g.userColor &&
        (f.timeClass === 'all' || g.timeClass === f.timeClass) &&
        (f.color === 'all' || g.userColor === f.color) &&
        g.endTime >= since,
    );
    return { games: filtered, summaries, ag: joinAnalyzed(filtered, summaries), loading: false };
  }, [games, summaries, f.timeClass, f.days, f.color]);
}
