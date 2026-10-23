import { Suspense, lazy, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueue, useSettings, useSyncStatus } from '../hooks/useStores';
import { DEFAULT_FILTERS, useInsightData } from '../hooks/useInsightData';
import { overview, trend } from '../lib/insights/compute';
import { coachReport } from '../lib/insights/coach';
import { CoachReport } from '../components/CoachReport';
import { FocusCard, PointsCard, TodayCard } from '../components/Coaching';
import { MIN_PROFILE_GAMES, useSkills } from '../hooks/useSkills';
// Charts (recharts) are loaded after the rest of the dashboard so first paint isn't blocked by them.
const LineTrend = lazy(() => import('../components/charts').then((m) => ({ default: m.LineTrend })));
import { GameCardList } from '../components/GameTable';
import { Icon } from '../components/Icon';
import { isIos, isStandalone, useInstallPrompt } from '../pwa/install';
import { isMobile } from '../lib/device';
import { PageHeader, Section, Stat, fmtPct } from '../components/ui';
import { connectAccount } from '../lib/account';
import { formatEta } from '../lib/format';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const settings = useSettings();
  const navigate = useNavigate();
  const { games, summaries, ag, loading } = useInsightData(DEFAULT_FILTERS);

  const recentAg = useMemo(() => ag.slice(-50), [ag]);
  const skills = useSkills(games, ag);
  const ov = useMemo(() => overview(games, ag), [games, ag]);
  const tr = useMemo(() => trend(games, summaries), [games, summaries]);
  const report = useMemo(
    () => coachReport(recentAg, games.filter((g) => g.endTime >= (recentAg[0]?.game.endTime ?? 0)), summaries),
    [recentAg, games, summaries],
  );
  const mainClass = useMemo(() => {
    const c = new Map<string, number>();
    for (const g of games) c.set(g.timeClass, (c.get(g.timeClass) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }, [games]);
  const ratingData = useMemo(() => tr.filter((p) => p.rating && p.timeClass === mainClass).slice(-100), [tr, mainClass]);
  const recentGames = useMemo(() => games.slice(0, 6), [games]);
  const doneCount = useMemo(() => games.filter((g) => g.analysisStatus === 'done').length, [games]);
  const open = (g: { id: string }) => navigate(`/game/${encodeURIComponent(g.id)}`);

  if (!settings.username && !loading && !games.length) return <Welcome />;
  if (loading) return <HomeSkeleton />;

  return (
    <div className="space-y-4 max-w-[1300px]">
      <PageHeader title={settings.username ? `Hi, ${settings.username}` : 'Home'} subtitle={`${ov.games} games · ${ov.analyzed} analysed`} />
      <ProgressCard analysed={doneCount} />

      <InstallHint />

      <div className="grid lg:grid-cols-2 gap-3 items-start">
        <TodayCard games={games} focus={skills.ready ? skills.focus.current?.area : undefined} minutes={settings.sessionMinutes} />
        {skills.ready && skills.focus.current ? (
          <FocusCard store={skills.focus} ranked={skills.ranked} ag={skills.ag} rating={skills.rating} timeClass={skills.timeClass} />
        ) : (
          <ProfilePending analysed={skills.ag.length} />
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Score" value={fmtPct(ov.score)} sub={`${ov.wins}W ${ov.draws}D ${ov.losses}L`} />
        <Stat label="Avg accuracy" value={fmtPct(ov.accuracy, 1)} sub="analysed games" />
        <Stat label="Blunders / game" value={ov.blundersPerGame.toFixed(2)} sub={`${ov.mistakesPerGame.toFixed(2)} mistakes / game`} />
        <Stat label={`${mainClass ?? ''} rating`} value={ratingData[ratingData.length - 1]?.rating ?? '–'} sub={ratingDelta(ratingData)} />
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
        {skills.ready ? (
          <PointsCard ranked={skills.ranked} stats={skills.profile.stats} rating={skills.rating} timeClass={skills.timeClass} games={skills.profile.games} />
        ) : (
          <Section title="Your coach says" right={<span className="muted text-xs">last {recentAg.length} analysed games</span>}>
            <CoachReport items={report.items} strengths={report.strengths} analysed={recentAg.length} limit={3} />
          </Section>
        )}
        <div className="space-y-4">
          <Section title="Recent games" right={<Link to="/games" className="text-sm underline muted">All games</Link>}>
            <GameCardList games={recentGames} onOpen={open} grouped={false} />
          </Section>
          <Section title={`Rating (${mainClass ?? '–'})`}>
            {ratingData.length > 1 ? (
              <Suspense fallback={<div className="h-40" />}>
                <LineTrend
                  data={ratingData}
                  x="t"
                  lines={[{ key: 'rating', name: 'Rating', color: 'var(--series-1)' }]}
                  xFormat={(t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  height={170}
                />
              </Suspense>
            ) : (
              <p className="muted text-sm">Not enough games yet.</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

/** Before there are enough analysed games for a skill profile. */
function ProfilePending({ analysed }: { analysed: number }) {
  return (
    <section className="panel p-4">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-[var(--panel-2)] text-accent flex items-center justify-center shrink-0">
          <Icon name="target" size={22} />
        </span>
        <div className="min-w-0">
          <div className="font-bold">Your skill profile is on its way</div>
          <p className="muted text-sm mt-1">
            Once {MIN_PROFILE_GAMES} games are analysed ({Math.min(analysed, MIN_PROFILE_GAMES)}/{MIN_PROFILE_GAMES} so far), you'll see where you lose the most
            points compared with players at your rating, and get a weekly focus to train.
          </p>
          <div className="h-1.5 rounded-full bg-[var(--panel-2)] mt-3 overflow-hidden">
            <div className="h-full bg-accent rounded-full" style={{ width: `${(100 * Math.min(analysed, MIN_PROFILE_GAMES)) / MIN_PROFILE_GAMES}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}

/** On phones in a browser tab: suggest installing (once; dismissible). */
function InstallHint() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('install-hint-dismissed') === '1';
    } catch {
      return false;
    }
  });
  const { canPrompt, prompt } = useInstallPrompt();
  if (hidden || isStandalone() || !isMobile()) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem('install-hint-dismissed', '1');
    } catch {
      // Private mode: just hide it for now.
    }
  };
  return (
    <div className="panel p-3 flex items-center gap-3 text-sm">
      <Icon name="install" size={22} className="text-accent" />
      <div className="flex-1 min-w-0">
        <b>Install the app</b>
        <div className="muted text-xs">
          {canPrompt ? 'Full screen, instant start, works offline.' : isIos() ? 'Tap Share, then "Add to Home Screen".' : 'Use your browser menu: "Add to Home screen".'}
        </div>
      </div>
      {canPrompt && (
        <button className="btn btn-primary !px-3" onClick={() => void prompt()}>
          Install
        </button>
      )}
      <button className="icon-btn !min-w-9 !min-h-9" onClick={dismiss} aria-label="Dismiss">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-3 max-w-[1300px]" aria-busy="true">
      <div className="skeleton h-36" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-20" />
        ))}
      </div>
      <div className="skeleton h-48" />
    </div>
  );
}

function ratingDelta(data: { rating?: number; t: number }[]) {
  if (data.length < 2) return '';
  const last = data[data.length - 1];
  const monthAgo = data.find((d) => d.t >= last.t - 30 * 86400000) ?? data[0];
  const diff = (last.rating ?? 0) - (monthAgo.rating ?? 0);
  return `${diff >= 0 ? '+' : ''}${diff} over 30 days`;
}

/** First-run screen: connect a chess.com account without leaving the page. */
function Welcome() {
  const [username, setUsername] = useState('');
  const [months, setMonths] = useState(6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function connect() {
    setBusy(true);
    setError('');
    try {
      await connectAccount(username, months);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Welcome 👋" subtitle="Your free, private chess coach. Everything runs in your browser." />
      <Section>
        <ol className="list-decimal pl-5 space-y-2 text-sm mb-5">
          <li>Enter your chess.com username. Your games are imported automatically, no login needed.</li>
          <li>Stockfish analyses every game in the background, right here in your browser.</li>
          <li>The coach finds your recurring mistakes, time-management issues and opening leaks, and turns them into training puzzles.</li>
        </ol>
        <form
          className="flex flex-wrap gap-2 items-center"
          onSubmit={(e) => {
            e.preventDefault();
            if (username.trim()) void connect();
          }}
        >
          <input
            className="input flex-1 min-w-48 !text-base"
            placeholder="Your chess.com username"
            aria-label="chess.com username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <select className="input" value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label="History to import">
            {[1, 3, 6, 12].map((m) => (
              <option key={m} value={m}>
                last {m} month{m > 1 ? 's' : ''}
              </option>
            ))}
            <option value={0}>all games</option>
          </select>
          <button className="btn btn-primary" type="submit" disabled={busy || !username.trim()}>
            {busy ? 'Connecting…' : 'Start'}
          </button>
        </form>
        {error && (
          <p className="text-sm mt-3" style={{ color: '#e02828' }}>
            {error}
          </p>
        )}
        <p className="muted text-xs mt-3">You can also paste single games (PGN or link) on the Games page.</p>
      </Section>
    </div>
  );
}

/** Shown while games are being imported or analysed, so the first minutes don't feel empty. */
function ProgressCard({ analysed }: { analysed: number }) {
  const sync = useSyncStatus();
  // Narrow subscriptions: this card changes when a game finishes, not on every engine tick.
  const pending = useQueue((s) => s.pending);
  const paused = useQueue((s) => s.paused);
  const etaSeconds = useQueue((s) => s.etaSeconds);
  const queue = { pending, paused, etaSeconds };
  const importing = sync.syncing && sync.progress?.phase === 'months';
  if (!importing && !(queue.pending > 0 && !queue.paused)) return null;
  const total = analysed + queue.pending;
  return (
    <div className="panel p-4 border-l-4" style={{ borderLeftColor: '#81b64c' }}>
      {importing ? (
        <div className="text-sm">
          <b>Importing your games…</b> month {sync.progress!.monthsDone + 1} of {sync.progress!.monthsTotal}
          {sync.progress!.newGames ? ` · ${sync.progress!.newGames} games so far` : ''}
        </div>
      ) : (
        <div className="text-sm">
          <b>
            Analysing your games: {analysed} of {total} done
          </b>
          {queue.etaSeconds !== undefined && <span className="muted"> · {formatEta(queue.etaSeconds)} left</span>}
          {analysed < 3 && <span className="muted"> · your coach report unlocks after 3 games</span>}
        </div>
      )}
      {!importing && total > 0 && (
        <div className="h-2 mt-2 rounded bg-[var(--panel-2)]">
          <div className="h-2 rounded bg-accent transition-all" style={{ width: `${(100 * analysed) / total}%` }} />
        </div>
      )}
    </div>
  );
}
