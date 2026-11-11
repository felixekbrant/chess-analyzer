import { Suspense, lazy, useEffect, useState } from 'react';
import { backfillPeakEval, upgradeStoredAnalyses } from './lib/analysis/upgrade';
import { backfillPuzzleStakes } from './lib/training/puzzles';
import { useBackLabel } from './lib/backLink';
import { db, getSettings, saveSettings } from './db/schema';
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
import { BrandMark } from './components/BrandMark';
import { StatusIndicator } from './components/StatusIndicator';

// Pages other than the dashboard are loaded on first visit to keep the initial download small.
const Games = lazy(() => import('./pages/Games'));
const Review = lazy(() => import('./pages/review'));
const Insights = lazy(() => import('./pages/Insights'));
const Weaknesses = lazy(() => import('./pages/Weaknesses'));
const Losses = lazy(() => import('./pages/Losses'));
const Play = lazy(() => import('./pages/Play'));
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
  // The app is about reviewing your games, your weaknesses and training them; the full statistics
  // and the openings report are a tap further away, under More.
  { to: '/weaknesses', label: 'Weaknesses', icon: 'dumbbell', match: /^\/(weaknesses|losses)/ },
  { to: '/insights', label: 'Insights', icon: 'chart' },
  { to: '/openings', label: 'Openings', icon: 'book' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];
/** The phone tab bar shows the first four; the rest live under "More". */
const TAB_COUNT = 4;

const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Home'],
  [/^\/games/, 'Games'],
  [/^\/game\//, 'Game review'],
  [/^\/training/, 'Training'],
  [/^\/weaknesses/, 'Weaknesses'],
  [/^\/losses/, 'Your last losses'],
  [/^\/play/, 'Play from here'],
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
    // After any rebuild, fill in what older analyses lack (biggest advantage, for thrown games).
    void upgradeStoredAnalyses()
    .then(() => backfillPeakEval())
    .then(() => backfillPuzzleStakes());
    void adoptDarkLook();
  }, []);

  // A game review is a full-screen view on phones with its own bottom action bar.
  const fullScreen = location.pathname.startsWith('/game/') || location.pathname.startsWith('/play');

  return (
    <div className="min-h-screen md:flex">
      <Sidebar path={location.pathname} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar path={location.pathname} />
        <main className={`flex-1 px-4 pt-3 md:p-6 ${fullScreen ? 'pb-28 md:pb-6' : 'pb-nav'}`}>
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageSkeleton />}>
              {/* Each page eases in when you move between sections (not between screens of one page). */}
              <div key={location.pathname.split('/')[1] ?? ''} className="page-in">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/games" element={<Games />} />
                <Route path="/game/:id" element={<Review />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/weaknesses" element={<Weaknesses />} />
                <Route path="/losses" element={<Losses />} />
                <Route path="/play" element={<Play />} />
                <Route path="/openings" element={<Openings />} />
                <Route path="/training" element={<Training />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
              </div>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      {!fullScreen && <BottomNav path={location.pathname} />}
      <Toasts />
    </div>
  );
}

/** The app's look became dark by default; switch existing installs over once (Settings can change it back). */
async function adoptDarkLook() {
  if (!(await db.kv.get('look-v2'))) {
    const s = await getSettings();
    if (s.theme === 'system') await saveSettings({ theme: 'dark' });
    await db.kv.put({ key: 'look-v2', value: true });
  }
  // Solved puzzles now stay on screen until you press Next (it can be switched back on in Settings).
  if (!(await db.kv.get('auto-next-off'))) {
    await saveSettings({ autoNextPuzzle: false });
    await db.kv.put({ key: 'auto-next-off', value: true });
  }
}

function Logo() {
  return (
    <BrandMark size={32} />
  );
}

/** Desktop and tablet navigation. */
function Sidebar({ path }: { path: string }) {
  return (
    <aside className="hidden md:flex md:flex-col md:w-56 md:h-screen md:sticky md:top-0 bg-[var(--rail)]">
      <div className="px-4 py-5 flex items-center gap-2 font-extrabold text-lg">
        <Logo />
        Chess Analyzer
      </div>
      <nav className="flex flex-col px-2 gap-1" aria-label="Main">
        {NAV.map((n, i) => [
          // The secondary pages, under a small "More" heading (as in the phone's More sheet).
          i === TAB_COUNT && (
            <div key="more" className="muted text-[11px] font-extrabold uppercase tracking-wider px-3 pt-4 pb-1">
              More
            </div>
          ),
          <NavLink
            key={n.to}
            to={n.to}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-[14px] text-sm ${
              isActive(n, path) ? 'bg-[var(--panel)] text-[var(--primary)] font-extrabold' : 'muted font-bold hover:bg-[var(--panel)]'
            }`}
          >
            <Icon name={n.icon} size={18} />
            {n.label}
          </NavLink>,
        ])}
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
  // Reviews and "Play from here" are places you came to from somewhere: they get a back button.
  const isReview = path.startsWith('/game/') || path.startsWith('/play');
  // Pages reached from another page (not from the tab bar) also get a back button.
  const hasBack = isReview || path.startsWith('/losses');
  const back = useBackLabel();
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/games'));
  return (
    <header className="md:hidden sticky top-0 z-30 safe-top frosted border-b border-[var(--border)]">
      {/* Slimmer on a game review, where the board should start as high as possible. */}
      <div className={`${isReview ? 'h-10' : 'h-12'} px-2 flex items-center gap-1`}>
        {hasBack && back ? (
          // Opened from a puzzle (or Insights…): say where back goes, so it's easy to carry on there.
          <button className="inline-flex items-center gap-1 rounded-full bg-[var(--panel-2)] pl-2 pr-3.5 py-1.5 text-sm font-bold shrink-0" onClick={goBack}>
            <Icon name="back" size={18} /> Back to {back}
          </button>
        ) : hasBack ? (
          <button className="icon-btn" aria-label="Back" onClick={goBack}>
            <Icon name="back" />
          </button>
        ) : (
          <span className="px-2">
            <Logo />
          </span>
        )}
        <h1 className={`flex-1 font-bold text-base truncate ${hasBack && back ? 'text-right muted !font-semibold !text-sm pr-2' : ''}`}>{title}</h1>
        {/* A review puts its Engine switch here, so it doesn't cost a row under the board. */}
        {isReview && <div id="topbar-tools" className="shrink-0 pr-1" />}
        {!isReview && <StatusIndicator variant="compact" />}
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
    `flex-1 flex flex-col items-center justify-center gap-0.5 h-[60px] text-[11px] font-bold ${active ? 'text-[var(--primary)]' : 'muted'}`;
  return (
    <>
      {/* A pill floating over the page; the strip behind it keeps scrolling text from showing around it. */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+10px)] bg-gradient-to-t from-[var(--bg)] from-60% to-transparent pointer-events-none">
      <nav className="pointer-events-auto bg-[var(--panel)] rounded-[22px] flex shadow-[0_6px_20px_rgba(0,0,0,0.35)]" aria-label="Main">
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
      </div>
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
