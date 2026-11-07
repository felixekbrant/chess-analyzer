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
import { EmptyState, EMPTY_FENS, PageHeader, Section } from '../components/ui';
import { SKILL_META, type SkillArea, type SkillStat } from '../lib/insights/skills';
import { chooseFocus, type AreaRank, type FocusStore } from '../lib/training/focus';
import { FOCUS_KEY, puzzleArea } from '../lib/training/today';
import { isSmall } from '../lib/training/puzzles';
import { PUZZLE_LOG_KEY, areaTries, type PuzzleTry } from '../lib/training/puzzleLog';
import { countMastery, type MasteryCount } from '../lib/training/mastery';
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

  if (loading) return <div className="skeleton h-64 max-w-3xl" />;

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
      <div className="max-w-3xl space-y-3">
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
    <div className="max-w-3xl space-y-3">
      {header}
      <Link to="/losses" state={backTo('Weaknesses')} className="panel p-3.5 flex items-center gap-3 hover:bg-[var(--panel-2)]">
        <span className="w-9 h-9 rounded-full bg-[var(--panel-2)] grid place-items-center shrink-0">
          <Icon name="target" size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Your last 10 losses</span>
          <span className="block muted text-sm">What decided each one, and what to work on first.</span>
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

/** Mastered, learning and new puzzles as one bar. */
function MasteryBar({ c }: { c: MasteryCount }) {
  const part = (n: number, color: string, label: string) =>
    n > 0 && <span style={{ width: `${(100 * n) / c.total}%`, background: color }} title={`${n} ${label}`} />;
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-[var(--border)] my-1" role="img" aria-label={`${c.mastered} mastered, ${c.learning} learning, ${c.new} new`}>
      {part(c.mastered, 'var(--win)', 'mastered')}
      {part(c.learning, 'var(--attention)', 'learning')}
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
  const due = puzzles.filter((p) => p.due <= Date.now()).length;
  const mastery = countMastery(puzzles);
  const ratio = r.typical ? r.cost / r.typical : undefined;

  return (
    <section className="panel p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-full bg-[var(--panel-2)] grid place-items-center font-extrabold shrink-0">{rank}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-extrabold text-lg leading-tight">{meta.label}</h2>
            {isFocus && <span className="chip">this week's focus</span>}
            <TrendChip trend={s.trend} />
          </div>
          <p className="muted text-sm mt-0.5">{meta.about}</p>
        </div>
        {ratio !== undefined && ratio >= 1.15 && (
          <span className="shrink-0 text-sm font-extrabold tabular-nums" style={{ color: 'var(--attention-ink)' }} title="Compared with what's typical at your rating">
            {ratio.toFixed(1)}×
          </span>
        )}
      </div>

      <div>
        <CostBars cost={r.cost} typical={r.typical} max={max} verdict={r.verdict} />
        <p className="text-sm mt-2">
          <Comparison r={r} rating={rating} timeClass={timeClass} />
        </p>
      </div>

      {s.examples.length > 0 && (
        <div>
          <div className="muted text-xs font-extrabold uppercase tracking-wider mb-1.5">From your games</div>
          <ul className="space-y-1">
            {s.examples.slice(0, 3).map((ex) => (
              <li key={ex.gameId + ex.ply}>
                <Link
                  to={`/game/${encodeURIComponent(ex.gameId)}?ply=${ex.ply + 1}`}
                  state={backTo('Weaknesses')}
                  className="flex gap-2 items-baseline rounded-lg -mx-2 px-2 py-2 hover:bg-[var(--panel-2)]"
                >
                  <span className="font-bold tabular-nums shrink-0">{ex.san}</span>
                  <span className="muted text-sm line-clamp-2">{ex.label || 'Open the moment'}</span>
                  <Icon name="external" size={12} className="muted shrink-0 ml-auto" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg bg-[var(--panel-2)] p-3 text-sm space-y-1">
        <div className="muted text-xs font-extrabold uppercase tracking-wider">Progress</div>
        <p>
          <b>In your games:</b>{' '}
          {s.recent !== undefined && s.earlier !== undefined
            ? `${fmt(s.recent)}% per game in your last 10 games, ${fmt(s.earlier)}% in the 20 before.`
            : 'shows once you have 20 analysed games.'}
        </p>
        <p>
          <b>In training:</b>{' '}
          {r.area === 'time'
            ? "puzzles don't train the clock; the tip below is the exercise, in your next games."
            : mastery.total
              ? `${mastery.mastered} of ${mastery.total} puzzles from your games mastered, ${mastery.learning} learning, ${mastery.new} new${due ? ` (${due} ready now)` : ''}.`
              : 'no puzzles from your games yet.'}
          {r.area !== 'time' && tries.recent.tries >= 3 &&
            ` Solved first time: ${tries.recent.clean} of ${tries.recent.tries} in the last 2 weeks${tries.before.tries >= 3 ? ` (before that: ${tries.before.clean} of ${tries.before.tries})` : ''}.`}
        </p>
        {r.area !== 'time' && mastery.new < mastery.total && <MasteryBar c={mastery} />}
        {r.area === 'converting' && (
          <p>
            <b>Playing it out:</b>{' '}
            {conv.tried ? `${conv.converted} of ${conv.tried} won positions converted against the engine.` : 'play a won position from your games against the engine.'}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {r.area !== 'time' ? (
          <Link className="btn btn-primary !py-2 !text-sm" to={`/training?area=${r.area}`}>
            <Icon name="puzzle" size={16} /> Train it
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
