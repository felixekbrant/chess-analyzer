import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PLAYOUTS_KEY, conversionStats, playHref, type Playout } from '../lib/play/playouts';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { DEFAULT_FILTERS, useInsightData } from '../hooks/useInsightData';
import { MIN_PROFILE_GAMES, useSkills } from '../hooks/useSkills';
import { useSettings } from '../hooks/useStores';
import { Comparison, CostBars, TrendChip } from '../components/Coaching';
import { Icon } from '../components/Icon';
import { MiniBoard } from '../components/MiniBoard';
import { EmptyState, EMPTY_FENS, PageHeader, Section } from '../components/ui';
import { SKILL_META, type SkillArea, type SkillStat } from '../lib/insights/skills';
import { chooseFocus, extraCost, type AreaRank, type FocusStore } from '../lib/training/focus';
import { useLossVerdict } from '../hooks/useLossVerdict';
import { FOCUS_KEY, puzzleArea } from '../lib/training/today';
import { isSmall } from '../lib/training/puzzles';
import { PUZZLE_LOG_KEY, areaTries, type PuzzleTry } from '../lib/training/puzzleLog';
import { backTo } from '../lib/backLink';
import type { Puzzle } from '../lib/types';

const fmt = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(1));
const TOP = 3;

/**
 * Weaknesses: what costs you the most compared with players at your rating, moments from your own
 * games that show it, a way to train it, and whether it's getting better, in your games and in
 * training. Built from the skill profile (Insights' Skills tab), focused on the top few.
 */
export default function Weaknesses() {
  const { games, ag, loading } = useInsightData(DEFAULT_FILTERS);
  // All games (no filters), so it may also keep the weekly focus up to date, as Home does.
  const skills = useSkills(games, ag);
  const settings = useSettings();
  const lossVerdict = useLossVerdict(games, ag);
  const puzzles = useLiveQuery(() => db.puzzles.toArray(), []);
  const log = useLiveQuery(async () => ((await db.kv.get(PUZZLE_LOG_KEY))?.value as PuzzleTry[] | undefined) ?? [], []);
  const playouts = useLiveQuery(async () => ((await db.kv.get(PLAYOUTS_KEY))?.value as Playout[] | undefined) ?? [], []);

  // Your puzzles per area (the same set as the Train tab: small positional ones only if turned on).
  const byArea = useMemo(() => {
    const m = new Map<SkillArea, Puzzle[]>();
    for (const p of puzzles ?? []) {
      if (!settings.smallPuzzles && isSmall(p)) continue;
      const a = puzzleArea(p);
      if (a) m.set(a, [...(m.get(a) ?? []), p]);
    }
    return m;
  }, [puzzles, settings.smallPuzzles]);

  if (loading) return <div className="skeleton h-64 max-w-3xl mx-auto" />;

  const header = (
    <PageHeader
      title="Weaknesses"
      desktopOnly
      subtitle={
        skills.ready
          ? `What costs you most compared with players at ~${Math.round((skills.rating ?? 1000) / 100) * 100} (${skills.timeClass}), and whether training helps.`
          : undefined
      }
    />
  );

  if (!skills.ready) {
    return (
      <div className="max-w-3xl mx-auto space-y-3">
        {header}
        <Section>
          <EmptyState fen={EMPTY_FENS.mate} title="Not enough analysed games yet">
            Your weaknesses show once {MIN_PROFILE_GAMES} {skills.timeClass} games are analysed ({skills.ag.length} so far). It gets sharper with every game.
          </EmptyState>
        </Section>
      </div>
    );
  }

  const ranked = skills.ranked.filter((r) => r.area !== 'time' || skills.timeClass !== 'daily');
  // The biggest leaks first: worse than typical (score > 0), then the largest costs.
  const worst = [...ranked.filter((r) => r.score > 0), ...ranked.filter((r) => r.score <= 0).sort((a, b) => b.cost - a.cost)];
  const top = worst.slice(0, TOP);
  const rest = worst.slice(TOP);
  const max = Math.max(...ranked.map((r) => Math.max(r.cost, r.typical ?? 0)), 1);
  const focus = skills.focus.current?.area;

  const makeFocus = async (area: SkillArea) => {
    const latest = ((await db.kv.get(FOCUS_KEY))?.value as FocusStore | undefined) ?? skills.focus;
    await db.kv.put({ key: FOCUS_KEY, value: chooseFocus(latest, area, skills.ag) });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      {header}
      <Link to="/losses" state={backTo('Weaknesses')} className="panel p-3.5 flex items-center gap-3 hover:bg-[var(--panel-2)]">
        <span className="w-9 h-9 rounded-full bg-[var(--panel-2)] grid place-items-center shrink-0">
          <Icon name="target" size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Your last losses</span>
          {/* What they have in common, when there is something; the page has each game. */}
          <span className="block muted text-sm">{lossVerdict?.headline ?? 'What decided each one, and what they have in common.'}</span>
        </span>
        <Icon name="next" size={18} className="muted shrink-0" />
      </Link>
      {top.map((r, i) => (
        <WeaknessCard
          key={r.area}
          rank={i + 1}
          r={r}
          s={skills.profile.stats.find((x) => x.area === r.area)!}
          max={max}
          rating={skills.rating}
          timeClass={skills.timeClass}
          isFocus={focus === r.area}
          puzzles={byArea.get(r.area) ?? []}
          log={log ?? []}
          playouts={playouts ?? []}
          onFocus={() => void makeFocus(r.area)}
        />
      ))}

      <Section title="The other areas">
        <ul className="divide-y divide-[var(--border)] -my-1">
          {rest.map((r) => (
            <li key={r.area} className="py-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-semibold">{SKILL_META[r.area].label}</span>
                {focus === r.area && <span className="chip">focus</span>}
                <TrendChip trend={skills.profile.stats.find((x) => x.area === r.area)?.trend} />
                <span className="ml-auto muted text-xs tabular-nums">{fmt(r.cost)}% / game</span>
              </div>
              <CostBars cost={r.cost} typical={r.typical} max={max} verdict={r.verdict} />
            </li>
          ))}
        </ul>
        <p className="muted text-xs mt-3">
          Win chance lost per game in each area, last {skills.profile.games} {skills.timeClass} games. The tick: typical for players at your rating.{' '}
          <Link to="/insights" className="underline">
            All statistics in Insights
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}

function WeaknessCard({
  rank,
  r,
  s,
  max,
  rating,
  timeClass,
  isFocus,
  puzzles,
  log,
  onFocus,
  playouts,
}: {
  rank: number;
  r: AreaRank;
  s: SkillStat;
  max: number;
  rating?: number;
  timeClass: string;
  isFocus: boolean;
  puzzles: Puzzle[];
  log: PuzzleTry[];
  onFocus: () => void;
  playouts: Playout[];
}) {
  const navigate = useNavigate();
  const conv = conversionStats(playouts);
  // Converting: play one of your won positions out against the engine.
  const playItOut = async () => {
    for (const ex of s.examples) {
      const m = (await db.analyses.get(ex.gameId))?.moves[ex.ply];
      if (m) return navigate(playHref(m.fenBefore, m.color, `game:${ex.gameId}:${ex.ply}`), { state: backTo('Weaknesses') });
    }
  };
  const meta = SKILL_META[r.area];
  const tries = areaTries(log, r.area);
  const left = puzzles.filter((p) => !p.doneAt).length;
  // What the order is built on: how much more than typical you lose, when that's clearly more.
  const extra = extraCost(r);

  return (
    <section className="panel p-4 space-y-3.5 !rounded-[24px]">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-full bg-[var(--panel-2)] grid place-items-center font-extrabold shrink-0">{rank}</span>
        <div className="min-w-0 flex-1">
          {/* The title shares its row with the figure; the chips get a row of their own under it. */}
          <h2 className="font-extrabold text-lg leading-tight">{meta.label}</h2>
          {(isFocus || s.trend === 'improving' || s.trend === 'worsening') && (
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              {isFocus && <span className="chip whitespace-nowrap">this week's focus</span>}
              <TrendChip trend={s.trend} />
            </div>
          )}
          <p className="muted text-sm mt-0.5">{meta.about}</p>
        </div>
        {extra !== undefined ? (
          <span className="shrink-0 text-right leading-tight" title="Win chance you lose per game here, beyond what's typical at your rating">
            <b className="block text-2xl font-extrabold tabular-nums tracking-tight" style={{ color: 'var(--loss)' }}>
              +{fmt(extra)}%
            </b>
            <span className="muted text-[11px] font-semibold">vs typical</span>
          </span>
        ) : r.verdict === 'typical' ? (
          <span className="shrink-0 muted text-[11px] text-right leading-tight">about typical</span>
        ) : null}
      </div>

      <div>
        <CostBars cost={r.cost} typical={r.typical} max={max} verdict={r.verdict} />
        <p className="text-sm mt-2">
          <Comparison r={r} rating={rating} timeClass={timeClass} />
        </p>
      </div>

      {s.examples.length > 0 && (
        <div>
          <div className="muted text-xs font-extrabold uppercase tracking-wider mb-2">From your games</div>
          {/* The moments themselves: the position, with the move you played marked. Tap one to open it. */}
          <ul className="grid grid-cols-3 gap-2.5 max-w-md">
            {s.examples.slice(0, 3).map((ex) => (
              <li key={ex.gameId + ex.ply}>
                <Link to={`/game/${encodeURIComponent(ex.gameId)}?ply=${ex.ply + 1}`} state={backTo('Weaknesses')} className="block group" title={ex.label || undefined} aria-label={`${ex.san}: open the moment`}>
                  {ex.fen ? (
                    <span className="block rounded-xl overflow-hidden group-hover:brightness-110">
                      <MiniBoard fen={ex.fen} orientation={ex.color === 'b' ? 'black' : 'white'} highlight={ex.uci ? [ex.uci.slice(0, 2), ex.uci.slice(2, 4)] : []} />
                    </span>
                  ) : (
                    <span className="block aspect-square rounded-xl bg-[var(--panel-2)]" />
                  )}
                  <span className="block font-bold text-sm tabular-nums mt-1.5 truncate">{ex.san}</span>
                </Link>
              </li>
            ))}
          </ul>
          {/* What went wrong in the first of them, in a sentence. */}
          {s.examples[0].label && <p className="muted text-sm mt-2 line-clamp-2">{s.examples[0].label}</p>}
        </div>
      )}

      {/* Progress as figures: your games, and your training. */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl bg-[var(--panel-2)] p-3">
          <div className="muted text-[11px] font-extrabold uppercase tracking-wider">In your games</div>
          {s.recent !== undefined && s.earlier !== undefined ? (
            <>
              <div className="font-extrabold text-2xl tabular-nums tracking-tight mt-0.5" style={{ color: s.recent > s.earlier * 1.1 ? 'var(--loss)' : s.recent < s.earlier * 0.9 ? 'var(--felt)' : undefined }}>
                {fmt(s.recent)}%
              </div>
              <div className="muted text-xs font-semibold">
                per game in your last 10 · was {fmt(s.earlier)}%
              </div>
            </>
          ) : (
            <div className="muted text-sm mt-1">Shows once you have 20 analysed games.</div>
          )}
        </div>
        <div className="rounded-2xl bg-[var(--panel-2)] p-3">
          <div className="muted text-[11px] font-extrabold uppercase tracking-wider">In training</div>
          {r.area === 'time' ? (
            <div className="muted text-sm mt-1">Puzzles don't train the clock. The tip below is the exercise.</div>
          ) : tries.recent.tries >= 3 ? (
            // Every puzzle is new (none are repeated), so this measures applying the idea, not memory.
            <>
              <div className="font-extrabold text-2xl tabular-nums tracking-tight mt-0.5">
                {tries.recent.clean} of {tries.recent.tries}
              </div>
              <div className="muted text-xs font-semibold">
                new puzzles solved first time in 2 weeks{tries.before.tries >= 3 ? ` · before: ${tries.before.clean} of ${tries.before.tries}` : ''}
                {left > 0 ? ` · ${left} to do` : ''}
              </div>
            </>
          ) : puzzles.length ? (
            <>
              <div className="font-extrabold text-2xl tabular-nums tracking-tight mt-0.5">{left}</div>
              <div className="muted text-xs font-semibold">
                new puzzle{left === 1 ? '' : 's'} from your games to do{puzzles.length > left ? ` · ${puzzles.length - left} done` : ''}
              </div>
            </>
          ) : (
            <div className="muted text-sm mt-1">No puzzles from your games yet.</div>
          )}
        </div>
        {r.area === 'converting' && (
          <div className="rounded-2xl bg-[var(--panel-2)] p-3 col-span-2">
            <div className="muted text-[11px] font-extrabold uppercase tracking-wider">Playing it out</div>
            <div className="text-sm mt-1">{conv.tried ? `${conv.converted} of ${conv.tried} won positions converted against the engine.` : 'Play a won position from your games against the engine.'}</div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {r.area !== 'time' ? (
          <Link className={`btn ${rank === 1 ? 'btn-primary' : ''} !py-2 !text-sm`} to={`/training?area=${r.area}`}>
            <Icon name="puzzle" size={16} /> Train
          </Link>
        ) : (
          <p className="text-sm flex gap-1.5 w-full">
            <Icon name="bulb" size={16} className="text-accent shrink-0 mt-0.5" /> {meta.tip}
          </p>
        )}
        {r.area === 'converting' && s.examples.length > 0 && (
          <button className="btn !py-2 !text-sm" onClick={() => void playItOut()}>
            <Icon name="engine" size={16} /> Play it out
          </button>
        )}
        {!isFocus && (
          <button className="btn !py-2 !text-sm" onClick={onFocus}>
            <Icon name="target" size={16} /> Make it my focus
          </button>
        )}
      </div>
    </section>
  );
}
