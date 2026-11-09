import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { MiniBoard } from '../components/MiniBoard';
import { BrandMark } from '../components/BrandMark';
import { useNavigate } from 'react-router-dom';
import { useQueue, useSettings, useSyncStatus } from '../hooks/useStores';
import { DEFAULT_FILTERS, useInsightData } from '../hooks/useInsightData';
import { coachReport } from '../lib/insights/coach';
import { CoachReport } from '../components/CoachReport';
import { FocusCard, TodayCard } from '../components/Coaching';
import { MIN_PROFILE_GAMES, useSkills } from '../hooks/useSkills';
import { WeeklyNoteCard } from '../components/WeeklyNoteCard';
import { LastGameCard } from '../components/LastGameCard';
import { GameCardList } from '../components/GameTable';
import { Icon } from '../components/Icon';
import { Picker } from '../components/Picker';
import { PageHeader, Section } from '../components/ui';
import { connectAccount } from '../lib/account';
import { formatEta } from '../lib/format';
import { Link } from 'react-router-dom';
import { ratingSeries, trend, type AnalyzedGame } from '../lib/insights/compute';
import { useLossVerdict } from '../hooks/useLossVerdict';
import type { StoredGame } from '../lib/types';

const HomeRating = lazy(() => import('../components/HomeRating'));

/** True on large screens (the two-column layouts), following the window as it's resized. */
function useWide() {
  const [wide, setWide] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = matchMedia('(min-width: 1024px)');
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

export default function Dashboard() {
  const wide = useWide();
  const settings = useSettings();
  const navigate = useNavigate();
  const { games, summaries, ag, loading } = useInsightData(DEFAULT_FILTERS);

  const recentAg = useMemo(() => ag.slice(-50), [ag]);
  const skills = useSkills(games, ag);
  const report = useMemo(
    () => coachReport(recentAg, games.filter((g) => g.endTime >= (recentAg[0]?.game.endTime ?? 0)), summaries),
    [recentAg, games, summaries],
  );
  const recentGames = useMemo(() => games.slice(0, 5), [games]);
  // Your newest game that is analysed (one still in the queue doesn't hide the one before it).
  const lastGame = useMemo(() => {
    const byId = new Map(ag.map((a) => [a.game.id, a]));
    return games.slice(0, 3).flatMap((g) => byId.get(g.id) ?? [])[0];
  }, [games, ag]);
  const ratings = useMemo(() => (wide ? ratingSeries(trend(games, summaries)) : { data: [], classes: [] }), [wide, games, summaries]);
  const doneCount = useMemo(() => games.filter((g) => g.analysisStatus === 'done').length, [games]);
  const open = (g: { id: string }) => navigate(`/game/${encodeURIComponent(g.id)}`);

  if (!settings.username && !loading && !games.length) return <Welcome />;
  if (loading) return <HomeSkeleton />;

  return (
    <div className="space-y-4 max-w-[1300px] mx-auto">
      <PageHeader title={settings.username ? `Hi, ${settings.username}` : 'Home'} desktopOnly />
      <ProgressCard analysed={doneCount} latest={games[0]} />


      {/* Phones: one column, Today first. Desktop: what to do on the left, how it's going on the right. */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
        <div className="space-y-3 min-w-0">
          {lastGame && <LastGameCard a={lastGame} />}
          <TodayCard quiet={!!lastGame && !lastGame.game.reviewedAt} games={games} focus={skills.ready ? skills.focus.current?.area : undefined} minutes={settings.sessionMinutes} />
          <WeeklyNoteCard games={games} ag={ag} focus={skills.ready ? skills.focus.current?.area : undefined} />
          {skills.ready && skills.focus.current ? (
            <FocusCard store={skills.focus} ranked={skills.ranked} ag={skills.ag} rating={skills.rating} timeClass={skills.timeClass} />
          ) : (
            <ProfilePending analysed={skills.ag.length} timeClass={skills.timeClass} />
          )}
          {/* Before the skill profile exists, the coach report fills its place. */}
          {!skills.ready && recentAg.length >= 3 && (
            <Section title="Your coach says">
              <CoachReport items={report.items} strengths={report.strengths} analysed={recentAg.length} limit={3} />
            </Section>
          )}
        </div>

        <div className="space-y-3 min-w-0">
          {/* Home is about what to do next; rating and score live in Insights › Results. */}
          <Section title="Recent games" right={<Link to="/games" className="text-sm font-semibold muted hover:text-[var(--text)] py-2.5 px-2 -my-2.5 -mx-2">All games →</Link>}>
            <div className="-mx-4 -mb-4">
              <GameCardList games={recentGames} onOpen={open} grouped={false} flush />
            </div>
          </Section>
          {/* Large screens have room for how it's going; on phones these are a tap away (Insights, Weaknesses). */}
          {wide && (
            <div className="space-y-3">
              <LossesCard ag={ag} games={games} />
              {ratings.data.length > 1 && (
                <Suspense fallback={<div className="skeleton h-56" />}>
                  <HomeRating ratings={ratings} />
                </Suspense>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** What your last losses say to work on, in one sentence, with the way to the full look. */
function LossesCard({ ag, games }: { ag: AnalyzedGame[]; games: StoredGame[] }) {
  const verdict = useLossVerdict(games, ag);
  if (!verdict) return null;
  return (
    <Link to="/losses" className="panel p-4 block hover:brightness-110">
      <div className="muted text-xs font-extrabold uppercase tracking-wider">From your last losses</div>
      <p className="font-bold leading-snug mt-1">{verdict.headline}</p>
      <p className="muted text-sm mt-1">What decided each one →</p>
    </Link>
  );
}


/** Légal's mate (1763), played on a loop: the welcome screen shows a game before any words. */
// Positions precomputed (keeps chess.js out of the start-up bundle): 1.e4 e5 2.Nf3 d6 3.Bc4 Bg4 4.Nc3 g6 5.Nxe5 Bxd1 6.Bxf7+ Ke7 7.Nd5#
const LEGAL_FRAMES: { fen: string; last: string[] }[] = [
  { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1', last: [] },
  { fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w - - 0 1', last: ["e2", "e4"] },
  { fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w - - 0 1', last: ["e7", "e5"] },
  { fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w - - 0 1', last: ["g1", "f3"] },
  { fen: 'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w - - 0 1', last: ["d7", "d6"] },
  { fen: 'rnbqkbnr/ppp2ppp/3p4/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w - - 0 1', last: ["f1", "c4"] },
  { fen: 'rn1qkbnr/ppp2ppp/3p4/4p3/2B1P1b1/5N2/PPPP1PPP/RNBQK2R w - - 0 1', last: ["c8", "g4"] },
  { fen: 'rn1qkbnr/ppp2ppp/3p4/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w - - 0 1', last: ["b1", "c3"] },
  { fen: 'rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w - - 0 1', last: ["g7", "g6"] },
  { fen: 'rn1qkbnr/ppp2p1p/3p2p1/4N3/2B1P1b1/2N5/PPPP1PPP/R1BQK2R w - - 0 1', last: ["f3", "e5"] },
  { fen: 'rn1qkbnr/ppp2p1p/3p2p1/4N3/2B1P3/2N5/PPPP1PPP/R1BbK2R w - - 0 1', last: ["g4", "d1"] },
  { fen: 'rn1qkbnr/ppp2B1p/3p2p1/4N3/4P3/2N5/PPPP1PPP/R1BbK2R w - - 0 1', last: ["c4", "f7"] },
  { fen: 'rn1q1bnr/ppp1kB1p/3p2p1/4N3/4P3/2N5/PPPP1PPP/R1BbK2R w - - 0 1', last: ["e8", "e7"] },
  { fen: 'rn1q1bnr/ppp1kB1p/3p2p1/3NN3/4P3/8/PPPP1PPP/R1BbK2R w - - 0 1', last: ["c3", "d5"] },
];

function LegalsMate() {
  const frames = LEGAL_FRAMES;
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return setI(frames.length - 1);
    // A beat on each move, a longer pause on the mate, then start over.
    const t = setTimeout(() => setI((x) => (x + 1) % frames.length), i === frames.length - 1 ? 3200 : i === 0 ? 1200 : 750);
    return () => clearTimeout(t);
  }, [i, frames.length]);
  return (
    <div className="relative mx-auto w-44">
      <MiniBoard fen={frames[i].fen} highlight={frames[i].last} />
      <span className="absolute -bottom-3 -right-3">
        <BrandMark size={44} />
      </span>
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
    <div className="space-y-3 max-w-[1300px] mx-auto" aria-busy="true">
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
        <LegalsMate />
        <h1 className="text-3xl font-black mt-6 tracking-tight">Your own chess coach</h1>
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
        {error && <p className="text-sm font-semibold text-center" style={{ color: 'var(--attention-ink)' }}>{error}</p>}
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
    <section className="panel p-4 border-l-4" style={{ borderLeftColor: 'var(--felt)' }}>
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-[var(--panel-2)] text-accent flex items-center justify-center shrink-0">
          <Icon name={importing ? 'sync' : 'engine'} size={22} className={importing ? 'spin' : ''} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold">{importing ? 'Importing your games' : 'Analysing your games'}</div>
          <div className="muted text-sm tabular-nums">
            {importing
              ? `Month ${sync.progress!.monthsDone + 1} of ${sync.progress!.monthsTotal}${sync.progress!.newGames ? ` · ${sync.progress!.newGames} games` : ''}`
              : `${analysed} of ${total} done · ${etaSeconds !== undefined ? `${formatEta(etaSeconds)} left` : 'working out the time left'}`}
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
