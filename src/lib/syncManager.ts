import { db, getSettings } from '../db/schema';
import { syncChessCom, type SyncProgress } from './chesscom/sync';
import { analysisQueue } from './engine/queue';
import { toast } from './toast';

export interface SyncStatus {
  syncing: boolean;
  progress?: SyncProgress;
  lastSync?: number;
  lastNew?: number;
  error?: string;
}

type Listener = (s: SyncStatus) => void;
const AUTO_SYNC_MS = 10 * 60 * 1000;

/** Runs chess.com syncs (on start, on an interval and on demand) and feeds new games to the analysis queue. */
class SyncManager {
  private status: SyncStatus = { syncing: false };
  private listeners = new Set<Listener>();
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private failedInARow = 0;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    for (const l of this.listeners) l(this.status);
  }

  start() {
    if (this.timer) return;
    // Show the real "last synced" time straight away instead of "not synced yet".
    void getSettings().then(async (s) => {
      if (!s.username || this.status.lastSync) return;
      const prev = await db.sync.get(s.username.toLowerCase());
      if (prev?.lastSync && !this.status.lastSync) this.set({ lastSync: prev.lastSync });
    });
    void this.syncNow();
    this.timer = setInterval(() => void this.syncNow(), AUTO_SYNC_MS);
    // Also sync when the tab becomes visible again after a while.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - (this.status.lastSync ?? 0) > 2 * 60 * 1000) void this.syncNow();
    });
  }

  syncNow(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.run().finally(() => (this.running = undefined));
    return this.running;
  }

  private async run() {
    const settings = await getSettings();
    if (!settings.username) {
      void analysisQueue.kick();
      return;
    }
    const prev = await db.sync.get(settings.username.toLowerCase());
    this.set({ syncing: true, error: undefined, lastSync: prev?.lastSync });
    try {
      const added = await syncChessCom(db, settings.username, {
        historyMonths: settings.historyMonths,
        onProgress: (progress) => this.set({ progress }),
      });
      this.failedInARow = 0;
      this.set({ syncing: false, lastSync: Date.now(), lastNew: added, progress: undefined });
      if (added > 0) toast(`${added} new game${added === 1 ? '' : 's'} imported from chess.com`, 'success');
    } catch (e) {
      const message = (e as Error).message;
      this.set({ syncing: false, error: message, progress: undefined });
      // Don't repeat the same error every 10 minutes while offline.
      if (this.failedInARow++ === 0) toast(`Couldn't sync with chess.com: ${message}`, 'error', { label: 'Retry', run: () => void this.syncNow() });
    }
    void analysisQueue.kick();
  }
}

export const syncManager = new SyncManager();
