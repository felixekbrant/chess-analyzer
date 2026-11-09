import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { opponentName } from '../lib/games/build';
import { SKILL_META, type SkillArea, type SkillStat } from '../lib/insights/skills';
import { chooseFocus, focusDay, FOCUS_DAYS, type AreaRank, type FocusStore } from '../lib/training/focus';
import {
  FOCUS_KEY,
  PROGRESS_KEY,
  STREAK_KEY,
  buildToday,
  currentStreak,
  drillCount,
  ownDrillCount,
  nextStreak,
  progressFor,
  type SessionMinutes,
  type Streak,
  type TodayItem,
  type TodayProgress,
} from '../lib/training/today';
import type { AnalyzedGame } from '../lib/insights/compute';
import type { StoredGame } from '../lib/types';
import { Icon } from './Icon';
import { levelLabel } from '../lib/insights/baselines';
import { Sheet } from './Sheet';
import { useDrillStock } from '../hooks/useDrillStock';
import { useQueue, useSettings } from '../hooks/useStores';
import { isSmall } from '../lib/training/puzzles';

const fmt = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(1));
const tcName = (tc: string) => (tc === 'daily' || tc === 'classical' ? 'rapid' : tc);

/** Where an item of the plan takes you. */
function itemLink(i: TodayItem): string {
  // A daily review goes straight to the key moments.
  if (i.kind === 'review' && i.game) return `/game/${encodeURIComponent(i.game.id)}?key=1`;
  return '/training?session=today';
}

/** The daily plan: a checklist that runs as one session. */
export function TodayCard({ games, focus, minutes, quiet }: { games: StoredGame[]; focus?: SkillArea; minutes: SessionMinutes; /** Something above already leads the page (your last game): Start isn't the main button. */ quiet?: boolean }) {
  const navigate = useNavigate();
  const settings = useSettings();
  // The same set as the Train tab: small positional puzzles only when turned on.
  const allPuzzles = useLiveQuery(() => db.puzzles.toArray(), []);
  const puzzles = useMemo(() => (settings.smallPuzzles ? allPuzzles : allPuzzles?.filter((p) => !isSmall(p))), [allPuzzles, settings.smallPuzzles]);
  const stored = useLiveQuery(async () => (await db.kv.get(PROGRESS_KEY))?.value as TodayProgress | undefined, []);
  // null = no streak yet; undefined = still loading.
  const streak = useLiveQuery(async () => ((await db.kv.get(STREAK_KEY))?.value as Streak | undefined) ?? null, []);
  const ext = useDrillStock(focus, puzzles, games, minutes);
  const pending = useQueue((s) => s.pending);

  const plan = useMemo(() => {
    const now = Date.now();
    return buildToday({
      minutes,
      games,
      progress: progressFor(stored, now),
      due: puzzles?.filter((p) => p.due <= now).length ?? 0,
      focus,
      drillAvailable: focus && puzzles ? drillCount(puzzles, focus, ext ?? [], now) : 0,
      drillOwn: focus && puzzles ? ownDrillCount(puzzles, focus) : 0,
      opponent: opponentName,
    });
  }, [minutes, games, stored, puzzles, focus, ext]);

  // Finishing the plan extends the streak (once per day).
  useEffect(() => {
    if (!plan.done || streak === undefined) return;
    const next = nextStreak(streak ?? undefined);
    if (next !== streak) void db.kv.put({ key: STREAK_KEY, value: next });
  }, [plan.done, streak]);

  if (!puzzles) return <div className="skeleton h-40" />;
  const days = currentStreak(streak ?? undefined);
  const next = plan.items.find((i) => !i.done);

  return (
    // The hero of Home: the brightest surface on the page, with a ring for how much of today is done.
    <section className="rounded-2xl p-4 md:p-5" style={{ background: 'color-mix(in srgb, var(--felt) 9%, var(--panel))', boxShadow: 'var(--shadow)' }}>
      <div className="flex items-center gap-3 mb-3">
        <ProgressRing done={plan.items.filter((i) => i.done).length} total={plan.items.length} />
        <div className="flex-1 min-w-0">
          <h2 className="font-black text-2xl leading-none">Today</h2>
          <div className="muted text-sm font-semibold tabular-nums mt-1">
            {plan.done ? 'All done' : plan.items.length ? `~${Math.max(1, plan.minutesLeft)} min left` : 'Nothing yet'}
          </div>
        </div>
        {days > 0 && (
          <span
            title="Days in a row with the plan done"
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-black tabular-nums"
            style={{ color: 'var(--brass-ink)', background: 'color-mix(in srgb, var(--brass) 16%, transparent)' }}
          >
            <Icon name="flame" size={15} /> {days}
          </span>
        )}
      </div>

      {!plan.items.length ? (
        <p className="muted text-sm">
          {pending > 0 ? 'Your games are being analysed. Reviews and puzzles appear here as they finish.' : 'All done. Play a game and it turns into tomorrow’s plan.'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {plan.items.map((i) => (
            <li key={i.id}>
              <Link to={itemLink(i)} className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 hover:bg-[var(--panel-2)]">
                <span
                  className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center border-2 ${
                    i.done ? 'bg-primary border-transparent text-white' : 'border-[var(--muted)]/40'
                  }`}
                  aria-label={i.done ? 'Done' : 'To do'}
                >
                  {i.done && <Icon name="check" size={16} strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-semibold text-sm truncate ${i.done ? 'muted line-through' : ''}`}>{i.title}</span>
                  <span className="block muted text-xs truncate">
                    {i.progress ? `${i.progress[0]}/${i.progress[1]} · ` : ''}
                    {i.detail}
                  </span>
                </span>
                <Icon name="next" size={16} className="muted shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {plan.done ? (
        <p className="text-sm mt-3 font-bold inline-flex items-center gap-1.5">
          <Icon name="check" size={16} className="text-accent" /> Done for today.
        </p>
      ) : (
        next && (
          <button className={`btn ${quiet ? '' : 'btn-primary'} w-full justify-center mt-3 !py-3 !text-base`} onClick={() => navigate(itemLink(next))}>
            <Icon name="play" size={16} /> {plan.items.some((i) => i.done) ? 'Continue' : 'Start'}
          </button>
        )
      )}
    </section>
  );
}

/** A ring that fills as today's items get done. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const f = total ? done / total : 0;
  return (
    <svg width="46" height="46" viewBox="0 0 46 46" className="shrink-0" role="img" aria-label={`${done} of ${total} done`}>
      <circle cx="23" cy="23" r={r} fill="none" stroke="var(--panel-2)" strokeWidth="5" />
      <circle
        cx="23"
        cy="23"
        r={r}
        fill="none"
        stroke="var(--felt)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${c * f} ${c}`}
        transform="rotate(-90 23 23)"
        style={{ transition: 'stroke-dasharray .5s ease-out' }}
      />
      <text x="23" y="27" textAnchor="middle" fontSize="12" fontWeight="900" fill="var(--text)">
        {done}/{total}
      </text>
    </svg>
  );
}

/** "You lose 9.1% win chance per game here; typical 1200 blitz players lose 5.4%: clearly more." */
export function Comparison({ r, rating, timeClass }: { r: AreaRank; rating?: number; timeClass: string }) {
  return (
    <>
      You lose <b>{fmt(r.cost)}%</b> win chance per game here
      {r.typical !== undefined && rating ? (
        <>
          ; typical {Math.round(rating / 100) * 100} {tcName(timeClass)} players lose {fmt(r.typical)}%
          {r.verdict === 'worse' ? ', so this clearly costs you more than most' : r.verdict === 'better' ? ', so you clearly do better than most' : ', about the same'}
        </>
      ) : null}
      .
    </>
  );
}

/** This week's focus, with why it was picked and a way to change it. */
export function FocusCard({
  store,
  ranked,
  ag,
  rating,
  timeClass,
}: {
  store: FocusStore;
  ranked: AreaRank[];
  ag: AnalyzedGame[];
  rating?: number;
  timeClass: string;
}) {
  const [picking, setPicking] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const f = store.current;
  const last = store.last && Date.now() - store.last.endedAt < 3 * 86400000 ? store.last : undefined;
  if (!f) return null;
  const meta = SKILL_META[f.area];
  const r = ranked.find((x) => x.area === f.area);
  // Insights leads with the area that costs the most; when that isn't the focus, say why.
  const biggest = ranked.filter((x) => x.verdict === 'worse').sort((a, b) => b.excess - a.excess)[0];
  const why =
    biggest && biggest.area !== f.area
      ? SKILL_META[biggest.area].trainable < meta.trainable
        ? `${SKILL_META[biggest.area].label} costs you more, but puzzles train it less well, so this week is about ${meta.label.toLowerCase()}. Its tip still applies in every game.`
        : `${SKILL_META[biggest.area].label} costs you more right now. A focus runs for a week, so it may well be the next one.`
      : undefined;

  return (
    <section className="panel p-4">
      {last && (
        <div
          className="rounded-lg p-2.5 text-sm mb-3"
          style={{ background: last.improved ? 'color-mix(in srgb, var(--brass) 16%, var(--panel))' : 'var(--panel-2)' }}
        >
          {last.improved ? (
            <>
              Nice! {SKILL_META[last.area].label}: down {Math.round((1 - last.after / Math.max(0.01, last.before)) * 100)}% ({fmt(last.before)} →{' '}
              {fmt(last.after)} per game). On to the next one.
            </>
          ) : (
            <>
              {SKILL_META[last.area].label} hasn't improved much yet ({fmt(last.before)} → {fmt(last.after)} per game). Let's work on something else for a
              while and come back to it.
            </>
          )}
        </div>
      )}
      {/* A slim strip under Today: the area, you vs typical as one small bar, and Train. */}
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-[var(--panel-2)] text-[var(--felt)] flex items-center justify-center shrink-0">
          <Icon name="target" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="muted text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5">
            Focus · day {focusDay(f)}/{FOCUS_DAYS}
            <button className="underline normal-case tracking-normal font-semibold py-2 -my-2 px-1" onClick={() => setPicking(true)}>
              Change
            </button>
          </div>
          {/* The focus is your top weakness this week: its page has the examples and progress. */}
          <Link className="block font-extrabold text-lg leading-tight truncate max-w-full hover:underline py-2 -my-2" to="/weaknesses" title="See your weaknesses">
            {meta.label} <span className="muted text-sm font-semibold">›</span>
          </Link>
          {r && (
            <div className="flex items-center gap-2 mt-1 text-xs font-semibold tabular-nums">
              <span style={{ color: r.typical !== undefined && r.cost > r.typical * 1.15 ? 'var(--attention-ink)' : 'var(--text)' }}>{fmt(r.cost)}%</span>
              {r.typical !== undefined && rating ? (
                <>
                  <span className="relative flex-1 max-w-28 h-1.5 rounded-full bg-[var(--panel-2)]" title={`Typical for ${Math.round(rating / 100) * 100} ${tcName(timeClass)} players: ${fmt(r.typical)}%`}>
                    <span
                      className="absolute left-0 top-0 bottom-0 rounded-full"
                      style={{ width: `${Math.min(100, (100 * r.cost) / Math.max(r.cost, r.typical) )}%`, background: r.cost > r.typical * 1.15 ? 'var(--attention)' : 'var(--felt)' }}
                    />
                    <span className="absolute -top-1 -bottom-1 w-0.5 rounded bg-[var(--text)]" style={{ left: `${(100 * r.typical) / Math.max(r.cost, r.typical)}%` }} />
                  </span>
                  <span className="muted">typical {fmt(r.typical)}%</span>
                </>
              ) : (
                <span className="muted">lost / game</span>
              )}
            </div>
          )}
          {r && r.typical !== undefined && rating ? <div className="muted text-[11px] mt-0.5">Win chance you lose per game in this area</div> : null}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          {f.area !== 'time' && (
            <Link className="btn btn-primary !py-1.5 !px-3 !text-sm justify-center" to={`/training?area=${f.area}`}>
              Train
            </Link>
          )}
          <button className="btn !py-2 !px-3 !text-xs justify-center" onClick={() => setShowTip((v) => !v)} aria-expanded={showTip}>
            <Icon name="bulb" size={12} /> Tip
          </button>
        </div>
      </div>
      {why && <p className="muted text-xs mt-2.5">{why}</p>}
      {showTip && <p className="text-sm mt-3">{meta.tip}</p>}
      <Sheet open={picking} onClose={() => setPicking(false)} title="Choose your focus">
        <div className="grid gap-1">
          {ranked.map((x) => (
            <button
              key={x.area}
              className={`text-left rounded-lg px-3 py-2.5 hover:bg-[var(--panel-2)] ${x.area === f.area ? 'bg-[var(--panel-2)]' : ''}`}
              onClick={async () => {
                const latest = ((await db.kv.get(FOCUS_KEY))?.value as FocusStore | undefined) ?? store;
                await db.kv.put({ key: FOCUS_KEY, value: chooseFocus(latest, x.area, ag) });
                setPicking(false);
              }}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold">{SKILL_META[x.area].label}</span>
                {x.area === f.area && <span className="chip">current</span>}
                <span className="ml-auto muted text-sm tabular-nums">{fmt(x.cost)}% / game</span>
              </div>
              <div className="muted text-xs">{SKILL_META[x.area].about}</div>
            </button>
          ))}
        </div>
      </Sheet>
    </section>
  );
}

/** Two bars: your cost and the typical cost at your rating, on a shared scale. */
export function CostBars({ cost, typical, max, verdict }: { cost: number; typical?: number; max: number; verdict?: AreaRank['verdict'] }) {
  const w = (v: number) => Math.max(2, Math.min(100, (100 * v) / Math.max(max, 0.01)));
  // One rule for the colour, so it matches what the numbers say: clearly more than typical is orange,
  // clearly less is green (15% either way; the statistical verdict still decides the coach's wording).
  void verdict;
  const worse = typical !== undefined && cost > typical * 1.15;
  const better = typical !== undefined && cost < typical * 0.85;
  // One track: your bar, and a tick where players at your rating typically are.
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold tabular-nums">
      <span className="relative flex-1 h-2.5 rounded-full bg-[var(--panel-2)]">
        <span
          className="absolute left-0 top-0 bottom-0 rounded-full transition-[width] duration-500"
          style={{ width: `${w(cost)}%`, background: worse ? 'var(--attention)' : better ? 'var(--win)' : 'var(--draw)' }}
        />
        {typical !== undefined && (
          <span
            className="absolute -top-1 -bottom-1 w-[3px] -ml-px rounded-full bg-[var(--text)]"
            style={{ left: `${w(typical)}%` }}
            title={`Typical: ${fmt(typical)}%`}
          />
        )}
      </span>
      <span className="w-20 text-right">
        <b className="text-[var(--text)] text-xs">{fmt(cost)}%</b>
        {typical !== undefined && <span className="muted"> / {fmt(typical)}</span>}
      </span>
    </div>
  );
}

export function TrendChip({ trend }: { trend?: SkillStat['trend'] }) {
  if (trend === 'improving') return <span className="chip whitespace-nowrap" style={{ color: 'var(--felt-ink)' }}>↓ improving</span>;
  // "Slipping", not "worse": the bar colour already says how you compare with others; this is about you lately.
  if (trend === 'worsening') return <span className="chip whitespace-nowrap" style={{ color: 'var(--attention-ink)' }}>↑ slipping</span>;
  return null;
}

/** Home: the areas that cost you the most, compared with players at your rating. */
export function PointsCard({ ranked, stats, rating, timeClass, games }: { ranked: AreaRank[]; stats: SkillStat[]; rating?: number; timeClass: string; games: number }) {
  const top = ranked.filter((r) => r.score > 0).slice(0, 3);
  const max = Math.max(...top.map((r) => Math.max(r.cost, r.typical ?? 0)), 1);
  return (
    <section className="panel p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="font-bold">Where your points go</h2>
        <span className="muted text-xs">last {games} games</span>
      </div>
      <p className="muted text-xs mb-3">
        Win chance lost per game{top.some((r) => r.typical !== undefined) && rating ? `, compared with ${Math.round(rating / 100) * 100}-rated ${tcName(timeClass)} players` : ''}.
      </p>
      {!top.length ? (
        <p className="text-sm">No area stands out. Nice! Keep playing and check back.</p>
      ) : (
        <div className="space-y-3">
          {top.map((r) => (
            <div key={r.area}>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-sm">{SKILL_META[r.area].label}</span>
                <TrendChip trend={stats.find((s) => s.area === r.area)?.trend} />
                {r.level !== undefined && <span className="ml-auto muted text-xs">plays like {levelLabel(r.level.level)}</span>}
              </div>
              <CostBars cost={r.cost} typical={r.typical} max={max} verdict={r.verdict} />
            </div>
          ))}
        </div>
      )}
      <Link to="/insights?tab=skills" className="block text-center text-sm underline muted mt-3">
        Your full skill profile
      </Link>
    </section>
  );
}
