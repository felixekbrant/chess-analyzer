import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueue, useSettings, useSyncStatus } from '../hooks/useStores';
import { analysisQueue, workerCount } from '../lib/engine/queue';
import { syncManager } from '../lib/syncManager';
import { saveSettings } from '../db/schema';
import { formatEta, timeAgo } from '../lib/format';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

/**
 * Sync + analysis status as one small button (top bar on phones, sidebar on desktop).
 * It only re-renders when counts change, not on every engine tick; details live in a sheet.
 */
export function StatusIndicator({ variant }: { variant: 'compact' | 'sidebar' }) {
  const settings = useSettings();
  const sync = useSyncStatus();
  const pending = useQueue((s) => s.pending);
  const running = useQueue((s) => s.running);
  const paused = useQueue((s) => s.paused);
  const [open, setOpen] = useState(false);
  if (!settings.username) return null;

  const busy = running && !paused;
  const label = sync.syncing
    ? 'Syncing…'
    : sync.error
      ? 'Sync failed'
      : busy
        ? `Analysing · ${pending} left`
        : paused && pending
          ? `Paused · ${pending} left`
          : sync.lastSync
            ? `Synced ${timeAgo(sync.lastSync)}`
            : 'Not synced';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          variant === 'compact'
            ? 'icon-btn relative gap-1 px-2 text-xs font-semibold'
            : 'w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-left muted hover:bg-[var(--panel-2)]'
        }
        aria-label={`Status: ${label}. Open details`}
      >
        <span className="relative inline-flex">
          <Icon name={busy ? 'engine' : 'sync'} size={variant === 'compact' ? 20 : 16} className={sync.syncing ? 'spin' : busy ? 'text-accent' : ''} />
          {sync.error && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#e02828]" />}
        </span>
        {variant === 'compact' ? (busy || (paused && pending > 0) ? <span className="tabular-nums">{pending}</span> : null) : <span className="truncate">{label}</span>}
      </button>
      <StatusSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function StatusSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Sync & analysis">
      {open && <StatusDetails onClose={onClose} />}
    </Sheet>
  );
}

/** Mounted only while the sheet is open, so its live progress bars cost nothing otherwise. */
function StatusDetails({ onClose }: { onClose: () => void }) {
  const sync = useSyncStatus();
  const queue = useQueue((s) => s);
  const settings = useSettings();
  return (
    <div className="space-y-5 text-sm">
      <section>
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-semibold">chess.com · {settings.username}</div>
            <div className="muted text-xs">
              {sync.syncing
                ? sync.progress?.phase === 'months'
                  ? `Importing month ${sync.progress.monthsDone + 1} of ${sync.progress.monthsTotal}…`
                  : 'Checking for new games…'
                : sync.error
                  ? `Last sync failed: ${sync.error}`
                  : sync.lastSync
                    ? `Synced ${timeAgo(sync.lastSync)}${sync.lastNew ? ` · ${sync.lastNew} new` : ''}. New games are fetched automatically.`
                    : 'Not synced yet'}
            </div>
          </div>
          <button className="btn shrink-0" onClick={() => void syncManager.syncNow()} disabled={sync.syncing}>
            <Icon name="sync" size={16} className={sync.syncing ? 'spin' : ''} /> Sync
          </button>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div>
            <div className="font-semibold">Engine analysis</div>
            <div className="muted text-xs">
              {queue.pending === 0 && !queue.running
                ? 'All caught up.'
                : `${queue.pending} game${queue.pending === 1 ? '' : 's'} left${queue.etaSeconds && !queue.paused ? ` · ${formatEta(queue.etaSeconds)}` : queue.paused ? ' · paused' : ' · estimating…'}`}
            </div>
          </div>
          {(queue.pending > 0 || queue.running) && (
            <button className="btn shrink-0" onClick={() => (queue.paused ? analysisQueue.resume() : analysisQueue.pause())}>
              <Icon name={queue.paused ? 'play' : 'pause'} size={14} /> {queue.paused ? 'Resume' : 'Pause'}
            </button>
          )}
        </div>
        {Object.entries(queue.active).map(([id, p]) => (
          <div key={id} className="h-1.5 mt-1 rounded bg-[var(--panel-2)]">
            <div className="h-1.5 rounded bg-accent transition-all" style={{ width: `${p * 100}%` }} />
          </div>
        ))}
        <div className="mt-3">
          <div className="muted text-xs mb-1">Speed</div>
          <div className="grid grid-cols-3 gap-2">
            {(['light', 'balanced', 'max'] as const).map((k) => (
              <button
                key={k}
                className={`btn justify-center !px-2 ${settings.analysisSpeed === k ? 'btn-primary' : ''}`}
                onClick={async () => {
                  await saveSettings({ analysisSpeed: k });
                  void analysisQueue.kick();
                }}
              >
                {k[0].toUpperCase() + k.slice(1)}
                <span className="text-[10px] opacity-75">×{workerCount(k)}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <Link to="/settings" onClick={onClose} className="text-xs underline muted">
        More settings
      </Link>
    </div>
  );
}
