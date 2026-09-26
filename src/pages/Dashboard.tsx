import { Suspense, lazy, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { useQueue, useSettings, useSyncStatus } from '../hooks/useStores';
import { DEFAULT_FILTERS, useInsightData } from '../hooks/useInsightData';
import { overview, trend } from '../lib/insights/compute';
import { coachReport } from '../lib/insights/coach';
import { CoachReport } from '../components/CoachReport';
// Charts (recharts) are loaded after the rest of the dashboard so first paint isn't blocked by them.
const LineTrend = lazy(() => import('../components/charts').then((m) => ({ default: m.LineTrend })));
import { GameTable } from '../components/GameTable';
import { PageHeader, Section, Stat, fmtPct } from '../components/ui';
import { connectAccount } from '../lib/account';
import { formatEta } from '../lib/format';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const settings = useSettings();
  const navigate = useNavigate();
  const { games, summaries, ag, loading } = useInsightData(DEFAULT_FILTERS);
  const due = useLiveQuery(() => db.puzzles.where('due').belowOrEqual(Date.now()).count(), []);

  const recentAg = useMemo(() => ag.slice(-50), [ag]);
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
  const recentGames = useMemo(() => games.slice(0, 10), [games]);
  const doneCount = useMemo(() => games.filter((g) => g.analysisStatus === 'done').length, [games]);

  if (!settings.username && !loading && !games.length) return <Welcome />;

  return (
    <div className="space-y-4 max-w-[1300px]">
      <PageHeader title={settings.username ? `Hi, ${settings.username}` : 'Dashboard'} subtitle={`${ov.games} games · ${ov.analyzed} analysed`} />
      <ProgressCard analysed={doneCount} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Score" value={fmtPct(ov.score)} sub={`${ov.wins}W ${ov.draws}D ${ov.losses}L`} />
        <Stat label="Avg accuracy" value={fmtPct(ov.accuracy, 1)} sub="analysed games" />
        <Stat label="Blunders / game" value={ov.blundersPerGame.toFixed(2)} sub={`${ov.mistakesPerGame.toFixed(2)} mistakes / game`} />
        <Stat label={`${mainClass ?? ''} rating`} value={ratingData[ratingData.length - 1]?.rating ?? '–'} sub={ratingDelta(ratingData)} />
        <Link to="/training" className="block">
          <Stat label="Training due" value={due ?? 0} sub="puzzles from your games →" />
        </Link>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
        <Section title="Coach report" right={<span className="muted text-xs">based on your last {recentAg.length} analysed games</span>}>
          <CoachReport items={report.items} strengths={report.strengths} analysed={recentAg.length} />
        </Section>
        <div className="space-y-4">
          <Section title={`Rating (${mainClass ?? '–'})`}>
            {ratingData.length > 1 ? (
              <Suspense fallback={<div className="h-40" />}>
                <LineTrend
                  data={ratingData}
                  x="t"
                  lines={[{ key: 'rating', name: 'Rating', color: 'var(--series-1)' }]}
                  xFormat={(t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  height={180}
                />
              </Suspense>
            ) : (
              <p className="muted text-sm">Not enough games yet.</p>
            )}
          </Section>
          <Section title="Accuracy (10-game average)">
            {tr.filter((p) => p.accuracyAvg).length > 1 ? (
              <Suspense fallback={<div className="h-40" />}>
                <LineTrend
                  data={tr.filter((p) => p.accuracyAvg !== undefined)}
                  x="t"
                  lines={[{ key: 'accuracyAvg', name: 'Accuracy', color: 'var(--series-1)' }]}
                  xFormat={(t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  yFormat={(v) => `${v}%`}
                  height={160}
                />
              </Suspense>
            ) : (
              <p className="muted text-sm">Appears after a couple of analysed games.</p>
            )}
          </Section>
        </div>
      </div>

      <Section title="Recent games" right={<Link to="/games" className="text-sm underline muted">All games →</Link>}>
        <div className="overflow-x-auto">
          <GameTable games={recentGames} onOpen={(g) => navigate(`/game/${encodeURIComponent(g.id)}`)} compact />
        </div>
      </Section>
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
  const queue = useQueue((s) => s);
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
