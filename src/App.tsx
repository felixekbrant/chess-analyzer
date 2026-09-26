import { Suspense, lazy, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useApplyTheme } from './hooks/useTheme';
import { useSettings } from './hooks/useStores';
import { syncManager } from './lib/syncManager';
import { analysisQueue } from './lib/engine/queue';
import Dashboard from './pages/Dashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toasts } from './components/Toasts';
import { Icon, type IconName } from './components/Icon';
import { Sheet } from './components/Sheet';
import { StatusIndicator } from './components/StatusIndicator';

// Pages other than the dashboard are loaded on first visit to keep the initial download small.
const Games = lazy(() => import('./pages/Games'));
const Review = lazy(() => import('./pages/review'));
const Insights = lazy(() => import('./pages/Insights'));
const Openings = lazy(() => import('./pages/Openings'));
const Training = lazy(() => import('./pages/Training'));
const SettingsPage = lazy(() => import('./pages/Settings'));

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Other paths that count as this section (e.g. a game review belongs to Games). */
  match?: RegExp;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/games', label: 'Games', icon: 'games', match: /^\/(games|game\/)/ },
  { to: '/training', label: 'Train', icon: 'puzzle' },
  { to: '/insights', label: 'Insights', icon: 'chart' },
  { to: '/openings', label: 'Openings', icon: 'book' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];
/** The phone tab bar shows the first four; the rest live under "More". */
const TAB_COUNT = 4;

const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Home'],
  [/^\/games/, 'Games'],
  [/^\/game\//, 'Game Review'],
  [/^\/training/, 'Training'],
  [/^\/insights/, 'Insights'],
  [/^\/openings/, 'Openings'],
  [/^\/settings/, 'Settings'],
];

const isActive = (item: NavItem, path: string) => (item.match ? item.match.test(path) : item.to === '/' ? path === '/' : path.startsWith(item.to));

export default function App() {
  const settings = useSettings();
  const location = useLocation();
  useApplyTheme(settings.theme);

  useEffect(() => {
    syncManager.start();
    void analysisQueue.refreshCount();
  }, []);

  // A game review is a full-screen view on phones with its own bottom action bar.
  const fullScreen = location.pathname.startsWith('/game/');

  return (
    <div className="min-h-screen md:flex">
      <Sidebar path={location.pathname} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar path={location.pathname} />
        <main className={`flex-1 px-4 pt-3 md:p-6 ${fullScreen ? 'pb-28 md:pb-6' : 'pb-nav'}`}>
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageSkeleton />}>
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
      </div>
      {!fullScreen && <BottomNav path={location.pathname} />}
      <Toasts />
    </div>
  );
}

function Logo() {
  return (
    <span className="inline-flex w-8 h-8 rounded-lg bg-accent text-white items-center justify-center text-lg" aria-hidden="true">
      ♞
    </span>
  );
}

/** Desktop and tablet navigation. */
function Sidebar({ path }: { path: string }) {
  return (
    <aside className="hidden md:flex md:flex-col md:w-56 md:h-screen md:sticky md:top-0 border-r border-[var(--border)] bg-[var(--panel)]">
      <div className="px-4 py-5 flex items-center gap-2 font-extrabold text-lg">
        <Logo />
        Chess Analyzer
      </div>
      <nav className="flex flex-col px-2 gap-1" aria-label="Main">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold ${
              isActive(n, path) ? 'bg-[var(--panel-2)] text-[var(--text)]' : 'muted hover:bg-[var(--panel-2)]'
            }`}
          >
            <Icon name={n.icon} size={18} />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto p-2 pb-4">
        <StatusIndicator variant="sidebar" />
      </div>
    </aside>
  );
}

/** Phone top bar: back button on a review, page title, and the sync/analysis indicator. */
function TopBar({ path }: { path: string }) {
  const navigate = useNavigate();
  const title = TITLES.find(([re]) => re.test(path))?.[1] ?? 'Chess Analyzer';
  const isReview = path.startsWith('/game/');
  return (
    <header className="md:hidden sticky top-0 z-30 safe-top bg-[var(--bg)]/95 backdrop-blur border-b border-[var(--border)]">
      <div className="h-12 px-2 flex items-center gap-1">
        {isReview ? (
          <button
            className="icon-btn"
            aria-label="Back"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/games'))}
          >
            <Icon name="back" />
          </button>
        ) : (
          <span className="px-2">
            <Logo />
          </span>
        )}
        <h1 className="flex-1 font-bold text-base truncate">{title}</h1>
        <StatusIndicator variant="compact" />
      </div>
    </header>
  );
}

/** Phone tab bar (like the chess.com app): four main sections plus "More". */
function BottomNav({ path }: { path: string }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = NAV.slice(0, TAB_COUNT);
  const more = NAV.slice(TAB_COUNT);
  const moreActive = more.some((n) => isActive(n, path));
  const tabClass = (active: boolean) =>
    `flex-1 flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] font-semibold ${active ? 'text-accent' : 'muted'}`;
  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--panel)]/95 backdrop-blur border-t border-[var(--border)] safe-bottom flex"
        aria-label="Main"
      >
        {tabs.map((n) => (
          <NavLink key={n.to} to={n.to} className={tabClass(isActive(n, path))} aria-current={isActive(n, path) ? 'page' : undefined}>
            <Icon name={n.icon} size={22} />
            {n.label}
          </NavLink>
        ))}
        <button className={tabClass(moreActive)} onClick={() => setMoreOpen(true)} aria-haspopup="dialog">
          <Icon name="more" size={22} />
          More
        </button>
      </nav>
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="grid gap-1">
          {more.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 px-3 py-3 rounded-lg font-semibold hover:bg-[var(--panel-2)]"
            >
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </div>
      </Sheet>
    </>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-3 max-w-3xl" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-8 w-48" />
      <div className="skeleton h-24 w-full" />
      <div className="skeleton h-24 w-full" />
    </div>
  );
}
