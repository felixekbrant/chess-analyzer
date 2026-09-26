import { useEffect, useState } from 'react';
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

export function useQueueStatus(): QueueStatus {
  const [s, setS] = useState<QueueStatus>({ running: false, paused: false, active: {}, pending: 0, workers: 1 });
  useEffect(() => {
    const unsub = analysisQueue.subscribe(setS);
    return () => void unsub();
  }, []);
  return s;
}

export function useGames() {
  return useLiveQuery(() => db.games.orderBy('endTime').reverse().toArray(), [], undefined);
}

/** Compact summaries of all analysed games, keyed by game id (full analyses are only loaded per game). */
export function useSummaries(): Map<string, GameSummary> | undefined {
  return useLiveQuery(async () => new Map((await db.summaries.toArray()).map((s) => [s.gameId, s])), [], undefined);
}
