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
  drillPuzzles,
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

const fmt = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(1));
const tcName = (tc: string) => (tc === 'daily' || tc === 'classical' ? 'rapid' : tc);

/** Where an item of the plan takes you. */
function itemLink(i: TodayItem): string {
  if (i.kind === 'review' && i.game) return `/game/${encodeURIComponent(i.game.id)}`;
  return '/training?session=today';
}

/** The daily plan: a checklist that runs as one session. */
export function TodayCard({ games, focus, minutes }: { games: StoredGame[]; focus?: SkillArea; minutes: SessionMinutes }) {
  const navigate = useNavigate();
  const puzzles = useLiveQuery(() => db.puzzles.toArray(), []);
  const stored = useLiveQuery(async () => (await db.kv.get(PROGRESS_KEY))?.value as TodayProgress | undefined, []);
  // null = no streak yet; undefined = still loading.
  const streak = useLiveQuery(async () => ((await db.kv.get(STREAK_KEY))?.value as Streak | undefined) ?? null, []);

  const plan = useMemo(() => {
    const now = Date.now();
    return buildToday({
      minutes,
      games,
      progress: progressFor(stored, now),
      due: puzzles?.filter((p) => p.due <= now).length ?? 0,
      focus,
      drillAvailable: focus && puzzles ? drillPuzzles(puzzles, focus).length : 0,
      opponent: opponentName,
    });
  }, [minutes, games, stored, puzzles, focus]);

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
    <section className="panel p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="font-bold text-lg">Today</h2>
        <span className="muted text-sm tabular-nums">
          {days > 0 && <span title="Days in a row with the plan done">🔥 {days} · </span>}
          {plan.done ? 'Done' : plan.items.length ? `~${Math.max(1, plan.minutesLeft)} min left` : ''}
        </span>
      </div>

      {!plan.items.length ? (
        <p className="muted text-sm">Nothing to do right now. Play a game: it is analysed automatically and turns into today's plan.</p>
      ) : (
        <ul className="space-y-1.5">
          {plan.items.map((i) => (
            <li key={i.id}>
              <Link to={itemLink(i)} className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 hover:bg-[var(--panel-2)]">
                <span
                  className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center border-2 ${
                    i.done ? 'bg-accent border-transparent text-white' : 'border-[var(--border)]'
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
        <p className="text-sm mt-3 font-semibold">🎉 Done for today. Short daily sessions are what make it stick.</p>
      ) : (
        next && (
          <button className="btn btn-primary w-full justify-center mt-3 !py-3 !text-base" onClick={() => navigate(itemLink(next))}>
            <Icon name="play" size={16} /> {plan.items.some((i) => i.done) ? 'Continue' : 'Start'}
          </button>
        )
      )}
    </section>
  );
}

/** "You lose 9.1 per game here; typical 1200s lose 5.4." */
export function Comparison({ r, rating, timeClass }: { r: AreaRank; rating?: number; timeClass: string }) {
  return (
    <>
      You lose <b>{fmt(r.cost)}%</b> win chance per game here
      {r.typical !== undefined && rating ? (
        <>
          ; typical {Math.round(rating / 100) * 100} {tcName(timeClass)} players lose {fmt(r.typical)}%
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

  return (
    <section className="panel p-4">
      {last && (
        <div className="rounded-lg bg-[var(--panel-2)] p-2.5 text-sm mb-3">
          {last.improved ? (
            <>
              🎉 Nice! {SKILL_META[last.area].label}: down {Math.round((1 - last.after / Math.max(0.01, last.before)) * 100)}% ({fmt(last.before)} →{' '}
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
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-[var(--panel-2)] text-accent flex items-center justify-center shrink-0">
          <Icon name="target" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="muted text-xs font-semibold uppercase tracking-wide">
            This week's focus · day {focusDay(f)} of {FOCUS_DAYS}
          </div>
          <div className="font-bold text-lg leading-tight">{meta.label}</div>
          <p className="text-sm muted mt-1">
            {r ? <Comparison r={r} rating={rating} timeClass={timeClass} /> : meta.about}
            {f.manual ? ' You picked this one.' : ''}
          </p>
        </div>
      </div>
      {showTip && <p className="text-sm mt-3">💡 {meta.tip}</p>}
      <div className="flex flex-wrap gap-2 mt-3">
        {f.area !== 'time' && (
          <Link className="btn btn-primary !py-1.5 !text-sm" to={`/training?area=${f.area}`}>
            Train it
          </Link>
        )}
        <button className="btn !py-1.5 !text-sm" onClick={() => setShowTip((v) => !v)}>
          <Icon name="bulb" size={14} /> {showTip ? 'Hide tip' : 'Tips'}
        </button>
        <button className="btn !py-1.5 !text-sm ml-auto" onClick={() => setPicking(true)}>
          Change
        </button>
      </div>
      <Sheet open={picking} onClose={() => setPicking(false)} title="Choose your focus">
        <p className="muted text-sm mb-2">Ordered by how much each area holds you back compared with players at your rating.</p>
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
export function CostBars({ cost, typical, max }: { cost: number; typical?: number; max: number }) {
  const w = (v: number) => `${Math.max(2, Math.min(100, (100 * v) / Math.max(max, 0.01)))}%`;
  const worse = typical !== undefined && cost > typical * 1.15;
  const better = typical !== undefined && cost < typical * 0.85;
  return (
    <div className="space-y-1 text-[11px] muted tabular-nums">
      <div className="flex items-center gap-2">
        <span className="w-12 shrink-0">You</span>
        <span className="flex-1 h-2 rounded-full bg-[var(--panel-2)] overflow-hidden">
          <span className="block h-full rounded-full" style={{ width: w(cost), background: worse ? '#e5793a' : better ? '#81b64c' : 'var(--series-1)' }} />
        </span>
        <span className="w-9 text-right">{fmt(cost)}</span>
      </div>
      {typical !== undefined && (
        <div className="flex items-center gap-2">
          <span className="w-12 shrink-0">Typical</span>
          <span className="flex-1 h-2 rounded-full bg-[var(--panel-2)] overflow-hidden">
            <span className="block h-full rounded-full bg-[var(--border)]" style={{ width: w(typical) }} />
          </span>
          <span className="w-9 text-right">{fmt(typical)}</span>
        </div>
      )}
    </div>
  );
}

export function TrendChip({ trend }: { trend?: SkillStat['trend'] }) {
  if (trend === 'improving') return <span className="chip" style={{ color: '#6a9e36' }}>↓ improving</span>;
  if (trend === 'worsening') return <span className="chip" style={{ color: '#e02828' }}>↑ getting worse</span>;
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
                {r.level !== undefined && <span className="ml-auto muted text-xs">plays like {levelLabel(r.level)}</span>}
              </div>
              <CostBars cost={r.cost} typical={r.typical} max={max} />
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
