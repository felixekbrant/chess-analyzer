import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db/schema';
import { analysisQueue, type QueueStatus } from '../lib/engine/queue';
import { syncManager, type SyncStatus } from '../lib/syncManager';
import { DEFAULT_SETTINGS, type Settings } from '../lib/types';
import type { GameSummary } from '../lib/insights/summary';

export function useSettings(): Settings {
  return useLiveQuery(getSettings, [], DEFAULT_SETTINGS);
}

export function useSyncStatus(): SyncStatus {
  const [s, setS] = useState<SyncStatus>({ syncing: false });
  useEffect(() => {
    const unsub = syncManager.subscribe(setS);
    return () => void unsub();
  }, []);
  return s;
}

/**
 * Subscribes to the analysis queue. Pass a selector returning a primitive (or the whole status):
 * the component then only re-renders when that value changes, e.g. `useQueue((s) => s.pending)`.
 */
export function useQueue<T>(selector: (s: QueueStatus) => T): T {
  return useSyncExternalStore(analysisQueue.subscribe, () => selector(analysisQueue.getSnapshot()));
}

/** Analysis progress (0-1) of one game, or undefined when it isn't being analysed. */
export function useQueueProgress(gameId: string): number | undefined {
  return useQueue((s) => s.active[gameId]);
}

export function useGames() {
  return useLiveQuery(() => db.games.orderBy('endTime').reverse().toArray(), [], undefined);
}

/** Compact summaries of all analysed games, keyed by game id (full analyses are only loaded per game). */
export function useSummaries(): Map<string, GameSummary> | undefined {
  return useLiveQuery(async () => new Map((await db.summaries.toArray()).map((s) => [s.gameId, s])), [], undefined);
}
