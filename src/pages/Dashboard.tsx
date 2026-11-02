import { Suspense, lazy, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueue, useSettings, useSyncStatus } from '../hooks/useStores';
import { DEFAULT_FILTERS, useInsightData } from '../hooks/useInsightData';
import { overview, trend } from '../lib/insights/compute';
import { coachReport } from '../lib/insights/coach';
import { CoachReport } from '../components/CoachReport';
import { FocusCard, TodayCard } from '../components/Coaching';
import { MIN_PROFILE_GAMES, useSkills } from '../hooks/useSkills';
// Charts (recharts) are loaded after the rest of the dashboard so first paint isn't blocked by them.
const LineTrend = lazy(() => import('../components/charts').then((m) => ({ default: m.LineTrend })));
import { GameCardList } from '../components/GameTable';
import { Icon } from '../components/Icon';
import { Picker } from '../components/Picker';
import { PageHeader, Section, fmtPct } from '../components/ui';
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
  // The same time control as the skill profile: your most-played timed one.
  const mainClass = skills.timeClass;
  const ratingData = useMemo(() => tr.filter((p) => p.rating && p.timeClass === mainClass).slice(-100), [tr, mainClass]);
  const recentGames = useMemo(() => games.slice(0, 6), [games]);
  const doneCount = useMemo(() => games.filter((g) => g.analysisStatus === 'done').length, [games]);
  const open = (g: { id: string }) => navigate(`/game/${encodeURIComponent(g.id)}`);

  if (!settings.username && !loading && !games.length) return <Welcome />;
  if (loading) return <HomeSkeleton />;

  return (
    <div className="space-y-4 max-w-[1300px]">
      <PageHeader title={settings.username ? `Hi, ${settings.username}` : 'Home'} desktopOnly />
      <ProgressCard analysed={doneCount} latest={games[0]} />


      <div className="grid lg:grid-cols-2 gap-3 items-start">
        <TodayCard games={games} focus={skills.ready ? skills.focus.current?.area : undefined} minutes={settings.sessionMinutes} />
        {skills.ready && skills.focus.current ? (
          <FocusCard store={skills.focus} ranked={skills.ranked} ag={skills.ag} rating={skills.rating} timeClass={skills.timeClass} />
        ) : (
          <ProfilePending analysed={skills.ag.length} timeClass={skills.timeClass} />
        )}
      </div>

      {/* One compact strip (like chess.com's stats row) instead of four big tiles. */}
      <div className="panel grid grid-cols-3 divide-x divide-[var(--border)] py-3 text-center">
        <MiniFigure label={`${mainClass ?? ''} rating`} value={ratingData[ratingData.length - 1]?.rating ?? '–'} sub={ratingDelta(ratingData)} />
        <MiniFigure label="Accuracy" value={ov.analyzed ? fmtPct(ov.accuracy, 1) : '–'} sub={ov.analyzed ? `${ov.analyzed} analysed` : 'analysing…'} />
        <MiniFigure label="Score" value={fmtPct(ov.score)} sub={`${ov.wins}W ${ov.draws}D ${ov.losses}L`} />
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
        {/* Before the skill profile exists, the coach report fills its place; after, the focus card and Insights cover it. */}
        {!skills.ready && recentAg.length >= 3 && (
          <Section title="Your coach says">
            <CoachReport items={report.items} strengths={report.strengths} analysed={recentAg.length} limit={3} />
          </Section>
        )}
        <div className="space-y-4">
          <Section title="Recent games" right={<Link to="/games" className="text-sm underline muted">All games</Link>}>
            <GameCardList games={recentGames} onOpen={open} grouped={false} />
          </Section>
          <Section
            title={`Rating · ${mainClass ?? '–'}`}
            right={
              ratingData.length > 1 ? (
                <span className="text-sm font-bold tabular-nums">
                  {ratingData[ratingData.length - 1].rating} <span className="muted font-semibold">{ratingDelta(ratingData).replace(' over 30 days', '')}</span>
                </span>
              ) : undefined
            }
          >
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

function MiniFigure({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="min-w-0 px-2">
      <div className="muted text-[11px] font-bold uppercase tracking-wide truncate">{label}</div>
      <div className="text-2xl font-black tabular-nums leading-tight mt-0.5">{value}</div>
      {sub && <div className="muted text-[11px] font-semibold truncate">{sub}</div>}
    </div>
  );
}

/** Before there are enough analysed games for a skill profile. */
function ProfilePending({ analysed, timeClass }: { analysed: number; timeClass: string }) {
  return (
    <section className="panel p-4">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-[var(--panel-2)] text-accent flex items-center justify-center shrink-0">
          <Icon name="target" size={22} />
        </span>
        <div className="min-w-0">
          <div className="font-bold">Skill profile</div>
          <p className="muted text-sm mt-0.5 tabular-nums" title="Where you lose the most points compared with players at your rating, and a weekly focus to train.">
            {Math.min(analysed, MIN_PROFILE_GAMES)}/{MIN_PROFILE_GAMES} {timeClass} games analysed
          </p>
          <div className="h-1.5 rounded-full bg-[var(--panel-2)] mt-3 overflow-hidden">
            <div className="h-full bg-accent rounded-full" style={{ width: `${(100 * Math.min(analysed, MIN_PROFILE_GAMES)) / MIN_PROFILE_GAMES}%` }} />
          </div>
        </div>
      </div>
    </section>
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
    <div className="max-w-md mx-auto pt-6 md:pt-12">
      <div className="text-center">
        <span className="pop inline-flex w-20 h-20 rounded-2xl bg-accent text-white items-center justify-center text-5xl shadow-[0_5px_0_#45753c]" aria-hidden="true">
          ♞
        </span>
        <h1 className="text-3xl font-black mt-5 tracking-tight">Your own chess coach</h1>
        <p className="muted mt-1.5 font-semibold">Free and private. Runs in your browser.</p>
      </div>

      <ul className="mt-7 space-y-3">
        {(
          [
            ['sync', 'Imports your chess.com games'],
            ['engine', 'Stockfish reviews every move'],
            ['target', 'Trains the mistakes you repeat'],
          ] as const
        ).map(([icon, text]) => (
          <li key={icon} className="flex items-center gap-3 font-bold">
            <span className="w-10 h-10 rounded-xl bg-[var(--panel)] text-accent flex items-center justify-center shrink-0">
              <Icon name={icon} size={20} />
            </span>
            {text}
          </li>
        ))}
      </ul>

      <form
        className="mt-8 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (username.trim()) void connect();
        }}
      >
        <input
          className="input w-full !text-lg !py-3 !px-4 !rounded-xl"
          placeholder="chess.com username"
          aria-label="chess.com username"
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="muted text-sm font-semibold">Import</span>
          <Picker
            label="History to import"
            value={months}
            onChange={setMonths}
            options={[...[1, 3, 6, 12].map((m) => ({ value: m, label: `Last ${m} month${m > 1 ? 's' : ''}` })), { value: 0, label: 'All games' }]}
          />
        </div>
        <button className="btn btn-primary w-full justify-center !py-3.5 !text-lg" type="submit" disabled={busy || !username.trim()}>
          {busy ? 'Connecting…' : 'Start'}
        </button>
        {error && <p className="text-sm font-semibold text-center" style={{ color: '#e5713f' }}>{error}</p>}
      </form>
    </div>
  );
}

/** While games are imported or analysed: one clear progress card, with the newest game one tap away. */
function ProgressCard({ analysed, latest }: { analysed: number; latest?: { id: string } }) {
  const sync = useSyncStatus();
  const navigate = useNavigate();
  // Narrow subscriptions: this card changes when a game finishes, not on every engine tick.
  const pending = useQueue((s) => s.pending);
  const paused = useQueue((s) => s.paused);
  const etaSeconds = useQueue((s) => s.etaSeconds);
  const importing = sync.syncing && sync.progress?.phase === 'months';
  if (!importing && !(pending > 0 && !paused)) return null;
  const total = analysed + pending;
  return (
    <section className="panel p-4 border-l-4" style={{ borderLeftColor: '#81b64c' }}>
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-[var(--panel-2)] text-accent flex items-center justify-center shrink-0">
          <Icon name={importing ? 'sync' : 'engine'} size={22} className={importing ? 'spin' : ''} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold">{importing ? 'Importing your games' : 'Analysing your games'}</div>
          <div className="muted text-sm tabular-nums">
            {importing
              ? `Month ${sync.progress!.monthsDone + 1} of ${sync.progress!.monthsTotal}${sync.progress!.newGames ? ` · ${sync.progress!.newGames} games` : ''}`
              : `${analysed} of ${total} done${etaSeconds !== undefined ? ` · ${formatEta(etaSeconds)} left` : ''}`}
          </div>
        </div>
      </div>
      {!importing && total > 0 && (
        <div className="h-2 mt-3 rounded-full bg-[var(--panel-2)] overflow-hidden">
          <div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${(100 * analysed) / total}%` }} />
        </div>
      )}
      {!importing && analysed === 0 && latest && (
        <button className="btn btn-primary w-full justify-center mt-3" onClick={() => navigate(`/game/${encodeURIComponent(latest.id)}`)}>
          Review your latest game
        </button>
      )}
    </section>
  );
}
