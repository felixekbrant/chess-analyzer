import { Suspense, lazy, useEffect } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useApplyTheme } from './hooks/useTheme';
import { useQueue, useSettings, useSyncStatus } from './hooks/useStores';
import { syncManager } from './lib/syncManager';
import { analysisQueue } from './lib/engine/queue';
import Dashboard from './pages/Dashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toasts } from './components/Toasts';
import { formatEta } from './lib/format';

// Pages other than the dashboard are loaded on first visit to keep the initial download small.
const Games = lazy(() => import('./pages/Games'));
const Review = lazy(() => import('./pages/Review'));
const Insights = lazy(() => import('./pages/Insights'));
const Openings = lazy(() => import('./pages/Openings'));
const Training = lazy(() => import('./pages/Training'));
const SettingsPage = lazy(() => import('./pages/Settings'));

const NAV = [
  { to: '/', label: 'Dashboard', icon: '⌂' },
  { to: '/games', label: 'Games', icon: '♟' },
  { to: '/insights', label: 'Insights', icon: '📈' },
  { to: '/openings', label: 'Openings', icon: '📖' },
  { to: '/training', label: 'Training', icon: '🎯' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export default function App() {
  const settings = useSettings();
  const location = useLocation();
  useApplyTheme(settings.theme);

  useEffect(() => {
    syncManager.start();
    void analysisQueue.refreshCount();
  }, []);

  return (
    <div className="min-h-screen md:flex">
      <aside className="md:w-52 md:min-h-screen md:sticky md:top-0 md:self-start border-b md:border-b-0 md:border-r border-[var(--border)] bg-[var(--panel)]">
        <div className="px-4 py-3 md:py-5 flex items-center gap-2 font-extrabold text-lg">
          <span className="inline-flex w-7 h-7 rounded-md bg-accent text-white items-center justify-center">♞</span>
          Chess Analyzer
        </div>
        <nav className="flex md:flex-col overflow-x-auto px-2 pb-2 gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${
                  isActive ? 'bg-[var(--panel-2)] text-[var(--text)]' : 'muted hover:bg-[var(--panel-2)]'
                }`
              }
            >
              <span className="w-5 text-center">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden md:block px-4 py-4">
          <StatusPanel />
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-4 md:p-6">
        <div className="md:hidden mb-3">
          <StatusPanel compact />
        </div>
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<div className="muted text-sm py-6">Loading…</div>}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/games" element={<Games />} />
              <Route path="/game/:id" element={<Review />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/openings" element={<Openings />} />
              <Route path="/training" element={<Training />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <Toasts />
    </div>
  );
}

function StatusPanel({ compact }: { compact?: boolean }) {
  const sync = useSyncStatus();
  const queue = useQueue((s) => s);
  const settings = useSettings();
  if (!settings.username) return null;
  return (
    <div className="text-xs space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="muted">
          {sync.syncing
            ? sync.progress?.phase === 'months'
              ? `Syncing month ${sync.progress.monthsDone + 1}/${sync.progress.monthsTotal}…`
              : 'Syncing…'
            : sync.error
              ? `Sync failed: ${sync.error}`
              : sync.lastSync
                ? `Synced ${timeAgo(sync.lastSync)}${sync.lastNew ? ` · ${sync.lastNew} new` : ''}`
                : 'Not synced yet'}
        </span>
        <button className="underline" onClick={() => void syncManager.syncNow()} disabled={sync.syncing}>
          Sync
        </button>
      </div>
      {(queue.running || queue.pending > 0) && (
        <div>
          <div className="flex justify-between muted">
            <span>{queue.paused ? 'Analysis paused' : queue.running ? `Analysing${queue.workers > 1 ? ` (${queue.workers}×)` : ''}…` : 'Waiting'}</span>
            <span>
              {queue.pending} left{queue.etaSeconds && !queue.paused ? ` · ${formatEta(queue.etaSeconds)}` : ''}
            </span>
          </div>
          {!compact && Object.entries(queue.active).map(([id, p]) => (
            <div key={id} className="h-1.5 mt-1 rounded bg-[var(--panel-2)]">
              <div className="h-1.5 rounded bg-accent transition-all" style={{ width: `${p * 100}%` }} />
            </div>
          ))}
          <button className="underline muted mt-1" onClick={() => (queue.paused ? analysisQueue.resume() : analysisQueue.pause())}>
            {queue.paused ? 'Resume analysis' : 'Pause analysis'}
          </button>
        </div>
      )}
    </div>
  );
}

export function timeAgo(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
