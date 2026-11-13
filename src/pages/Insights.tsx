import { backTo } from '../lib/backLink';
import type { StoredGame } from '../lib/types';
import type { GameSummary } from '../lib/insights/summary';
import type { AnalyzedGame } from '../lib/insights/compute';
import { Icon } from '../components/Icon';
import { opponentName } from '../lib/games/build';
import { formatPeak, isThrown } from '../lib/games/thrown';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useInsightData, DEFAULT_FILTERS, type InsightFilters } from '../hooks/useInsightData';
import {
  MOTIF_LABEL,
  colorStats,
  conversionStats,
  motifStats,
  overview,
  phaseStats,
  ratingDiffStats,
  repeatedErrors,
  sessionStats,
  terminationStats,
  clockLosses,
  timeStats,
  trend,
  ratingSeries,
  TIME_CLASS_COLOR,
  type MoveRef,
} from '../lib/insights/compute';
import { coachReport } from '../lib/insights/coach';
import { formatDuration } from '../lib/pgn/parse';
import { SkillsTab } from '../components/SkillsTab';
import { CoachViewCard } from '../components/CoachViewCard';
import { AskGamesCard } from '../components/AskGamesCard';
import { useSkills } from '../hooks/useSkills';
import { Filters, loadFilters, storeFilters } from '../components/Filters';
import { HBarList, LineTrend } from '../components/charts';
import { MiniBoard } from '../components/MiniBoard';
import { Empty, EmptyState, Headline, PageHeader, Section, fmtPct } from '../components/ui';

/** Every number on the Insights page, from the (filtered) games. */
function computeInsights(games: StoredGame[], summaries: Map<string, GameSummary>, ag: AnalyzedGame[]) {
  const tr = trend(games, summaries);
  const pre = {
    phases: phaseStats(ag),
    motifs: motifStats(ag),
    time: timeStats(ag),
    repeated: repeatedErrors(ag),
    conv: conversionStats(ag),
    sessions: sessionStats(games),
  };
  return {
    ...pre,
    ov: overview(games, ag),
    tr,
    ratings: ratingSeries(tr),
    rating: ratingDiffStats(games),
    colors: colorStats(games),
    term: terminationStats(games),
    clock: clockLosses(games),
    report: coachReport(ag, games, summaries, pre),
    mixesDailyAndLive: games.some((g) => g.timeClass === 'daily') && games.some((g) => g.timeClass !== 'daily'),
  };
}

/** The last computed numbers, for an instant return to the page (one entry: the current filters). */
let insightsCache: { key: string; data: ReturnType<typeof computeInsights> } | undefined;

export default function Insights() {
  const [filters, setFiltersState] = useState<InsightFilters>(() => loadFilters() ?? DEFAULT_FILTERS);
  const setFilters = (f: InsightFilters) => {
    setFiltersState(f);
    storeFilters(f);
  };
  const { games, summaries, ag, loading } = useInsightData(filters);
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some(([id]) => id === params.get('tab')) ? params.get('tab') : 'skills') as Tab;
  const setTab = (t: Tab) => {
    setParams(t === 'skills' ? {} : { tab: t }, { replace: true });
    window.scrollTo({ top: 0 });
  };

  const [showAllMotifs, setShowAllMotifs] = useState(false);
  // Lost after being +3 or better, newest first.
  const thrown = useMemo(() => games.filter(isThrown), [games]);

  const data = useMemo(() => {
    // Kept between visits while the games are the same, so coming back to Insights is instant.
    const key = `${JSON.stringify(filters)}|${games.length}|${games[0]?.id ?? ''}|${ag.length}|${ag.at(-1)?.game.id ?? ''}`;
    if (insightsCache?.key === key) return insightsCache.data;
    const result = computeInsights(games, summaries, ag);
    insightsCache = { key, data: result };
    return result;
  }, [games, summaries, ag, filters]);

  // Filtered data must not move the weekly focus; Home manages that.
  const skills = useSkills(games, ag, false);

  // "You convert 93%" and a weak "Converting advantages" are both true: you win them, but give a lot
  // away on the way. Say so where they meet.
  const conv = skills.ranked.find((r) => r.area === 'converting');
  const convertingSub =
    `You saved ${data.conv.saved} of ${data.conv.hadLosing} lost positions.` +
    (conv?.verdict === 'worse' && conv.typical !== undefined
      ? ` You do win them, but give away ${conv.cost.toFixed(1)}% win chance per game on the way (typical ${conv.typical.toFixed(1)}%): see Skills.`
      : '');

  const dateFmt = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div className="space-y-4 max-w-[1300px] mx-auto">
      <PageHeader
        title="Insights"
        subtitle={loading ? 'Loading…' : `${ag.length} analysed games`}
        actions={<Filters value={filters} onChange={setFilters} />}
      />
      {!loading && !games.length && (
        <EmptyState title="No games here">Try another time control or a longer period.</EmptyState>
      )}
      {games.length > 0 && (
        <>
          <TabBar tab={tab} onChange={setTab} />
          {tab === 'skills' && (
            <>
              <SkillsTab data={skills} />
              {skills.ready && (
                <CoachViewCard
                  games={games}
                  summaries={summaries}
                  ag={skills.ag}
                  basis={`${JSON.stringify(filters)}|${skills.ag.length}|${skills.ag.at(-1)?.game.id ?? ''}`}
                />
              )}
              <AskGamesCard />
            {data.report.strengths.length > 0 && (
              <Section title="Your strengths">
                <ul className="text-sm space-y-1">
                  {data.report.strengths.map((s) => (
                    <li key={s} className="flex gap-1.5">
                    <Icon name="check" size={16} className="text-accent shrink-0 mt-0.5" /> {s}
                  </li>
                  ))}
                </ul>
              </Section>
            )}
            </>
          )}
          {tab === 'mistakes' && (
          <>
          {data.motifs[0] && (
            // By type of mistake: a statistic. What to work on first is the Weaknesses page's to say.
            <Headline
              sub={
                <>
                  {data.motifs[0].count}× in {ag.length} games, {data.motifs[0].costPerGame.toFixed(0)}% win chance per game.{' '}
                  <Link className="underline" to="/weaknesses">
                    What to work on first
                  </Link>
                </>
              }
            >
              Your costliest type of mistake: <span style={{ color: 'var(--attention-ink)' }}>{MOTIF_LABEL[data.motifs[0].motif].toLowerCase()}</span>.
            </Headline>
          )}
          <div className="grid lg:grid-cols-2 gap-4">
            <Section title="Game phases" id="phases">
              <div className="grid grid-cols-3 gap-2" title="Book moves are excluded. Errors = mistakes and blunders per 100 moves. Share = how much of the win chance you lost happened in that phase.">
                {data.phases.map((p) => (
                  <Link key={p.phase} to={`/training?phase=${p.phase}`} className="rounded-2xl bg-[var(--panel-2)] p-3 hover:brightness-110 min-w-0">
                    <div className="muted text-[11px] font-extrabold uppercase tracking-wider truncate">{p.phase}</div>
                    <div className="font-extrabold text-2xl tabular-nums tracking-tight mt-0.5">{fmtPct(p.accuracy)}</div>
                    <div className="muted text-[11px] font-semibold tabular-nums leading-snug mt-0.5">
                      {p.errorsPer100.toFixed(1)} errors/100
                      <br />
                      {fmtPct(p.shareOfLoss)} of losses
                      {formatDuration(p.avgTime) ? (
                        <>
                          <br />
                          {formatDuration(p.avgTime)} / move
                        </>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            </Section>

            <Section title="Mistake types" id="mistakes" right={<span className="muted text-xs" title="Compared with your earlier games in this selection"><span style={{ color: "var(--felt-ink)" }}>↓</span> less often · <span style={{ color: "var(--loss-ink)" }}>↑</span> more often</span>}>
              {!data.motifs.length ? (
                <Empty>No errors detected yet.</Empty>
              ) : (
                <div className="space-y-2">
                  {/* The five that cost the most; the rest one tap away. */}
                  {(showAllMotifs ? data.motifs : data.motifs.slice(0, 5)).map((m) => {
                    const main = m.byPhase[0];
                    // Where it mostly happens, so a vague type like "positional error" says what to work on.
                    const where = main && main.share >= 50 ? main.phase : undefined;
                    return (
                      <details key={m.motif} className="rounded-lg bg-[var(--panel-2)] px-3 py-2">
                        <summary className="cursor-pointer flex items-center gap-2 text-sm list-none">
                          <span className="flex-1 min-w-0">
                            <span className="font-semibold block">{MOTIF_LABEL[m.motif]}</span>
                            <span className="muted text-xs tabular-nums">
                              {m.count}× · −{m.costPerGame.toFixed(1)}% / game{where ? ` · mostly ${where}` : ''}
                            </span>
                          </span>
                          <TrendArrow earlier={m.earlierRate} recent={m.recentRate} />
                          <Link
                            className="btn !py-1 !px-3 !text-xs shrink-0"
                            to={`/training?motif=${m.motif}${where ? `&phase=${where}` : ''}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            Train
                          </Link>
                        </summary>
                        <ExampleList refs={m.examples} />
                      </details>
                    );
                  })}
                  {data.motifs.length > 5 && (
                    <button className="text-sm underline muted py-2.5 -my-1" onClick={() => setShowAllMotifs((v) => !v)}>
                      {showAllMotifs ? 'Show fewer' : `Show all ${data.motifs.length}`}
                    </button>
                  )}
                </div>
              )}
            </Section>
          </div>

          <Section title="Repeated mistakes" id="repeated" right={data.repeated.length > 0 && <Link className="text-sm underline" to="/training?repeated=1">Drill them →</Link>}>
            {!data.repeated.length ? (
              <Empty>No position where you made the same mistake twice.</Empty>
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {data.repeated.slice(0, 8).map((r) => (
                  <div key={r.key} className="space-y-2">
                    <Link className="block max-w-[240px]" to={`/game/${encodeURIComponent(r.refs[r.refs.length - 1].gameId)}?ply=${r.refs[r.refs.length - 1].ply + 1}`} state={backTo('Insights')}>
                      <MiniBoard fen={r.fen} orientation={r.fen.split(' ')[1] === 'w' ? 'white' : 'black'} />
                    </Link>
                    <div className="text-sm">
                      You played <b>{r.moveLabel}</b> {r.count}× {r.bestSan && <>— better is <b>{r.bestSan}</b></>}
                    </div>
                    {r.opening && <div className="muted text-xs">{r.opening}</div>}
                    <div className="flex flex-wrap gap-1">
                      {r.refs.map((x, i) => (
                        <Link key={i} className="chip hover:underline" to={`/game/${encodeURIComponent(x.gameId)}?ply=${x.ply + 1}`} state={backTo('Insights')}>
                          game {i + 1}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          </>
          )}
          {tab === 'time' && (
          <>
          {data.time.gamesWithClock > 0 && (
            <Headline sub={`${data.clock.onTime} of your ${data.clock.losses} losses (${fmtPct((100 * data.clock.onTime) / Math.max(1, data.clock.losses))}) were on time`}>
              You get into time trouble in {fmtPct(data.time.timeTroubleGamesPct)} of your games.
            </Headline>
          )}
          <Section title={data.mixesDailyAndLive ? 'Time management · live games' : 'Time management'} id="time">
            {data.time.gamesWithClock === 0 ? (
              <Empty>No clock data (daily games don't have clocks).</Empty>
            ) : (
              <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
                <div>
                  {/* The three numbers that matter; the rest one tap away. */}
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <MiniStat label="Time trouble" value={fmtPct(data.time.timeTroubleGamesPct)} hint="of games" />
                    <MiniStat label="Rushed errors" value={String(data.time.rushedErrors)} hint="under 2 s" />
                    <MiniStat
                      label="Lost on time"
                      value={`${data.clock.onTime}`}
                      hint={`of ${data.clock.losses} losses`}
                    />
                  </div>
                  <details className="mb-4 text-sm">
                    <summary className="cursor-pointer muted text-xs font-semibold">More</summary>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <MiniStat label="Errors in time trouble" value={`${data.time.timeTroubleErrors}/${data.time.errorsTotal}`} />
                      <MiniStat label="Long thinks" value={String(data.time.longThinks)} hint={`${fmtPct(data.time.longThinkAccuracy)} accuracy`} />
                      <MiniStat label="Long think → error" value={fmtPct(data.time.longThinkErrorRate)} />
                    </div>
                  </details>
                  <div className="font-semibold text-sm mb-2">Average time per move</div>
                  <HBarList
                    data={(['opening', 'middlegame', 'endgame'] as const)
                      .filter((p) => data.time.avgTimeByPhase[p] !== undefined)
                      .map((p) => ({ label: p[0].toUpperCase() + p.slice(1), value: data.time.avgTimeByPhase[p]! }))}
                    format={(v) => formatDuration(v)}
                  />
                </div>
                <div>
                  <div className="font-semibold text-sm mb-1" title="If your line drops faster than your opponents', you're spending too long early on.">
                    Clock left · you vs opponents
                  </div>
                  <LineTrend
                    data={data.time.clockCurve}
                    x="move"
                    lines={[
                      { key: 'you', name: 'You', color: 'var(--series-1)', dots: true },
                      { key: 'opponent', name: 'Opponents', color: 'var(--series-3)', dots: true },
                    ]}
                    yDomain={[0, 100]}
                    xFormat={(v) => `Move ${v}`}
                    yFormat={(v) => `${v}%`}
                  />
                  {data.time.examples.timeTroubleErrors.length > 0 && (
                    <>
                      <div className="font-semibold text-sm mt-3">Recent time-trouble errors</div>
                      <ExampleList refs={data.time.examples.timeTroubleErrors} />
                    </>
                  )}
                  {data.time.examples.longThinkErrors.length > 0 && (
                    <>
                      <div className="font-semibold text-sm mt-3">Long thinks that went wrong</div>
                      <ExampleList refs={data.time.examples.longThinkErrors} />
                    </>
                  )}
                </div>
              </div>
            )}
          </Section>
          </>
          )}
          {tab === 'results' && (
          <>
          {data.conv.hadWinning > 0 && (
            <Headline sub={convertingSub}>
              You convert {fmtPct(data.conv.conversionRate)} of your winning positions.
            </Headline>
          )}
          <div id="trends" className="grid lg:grid-cols-2 gap-4 scroll-mt-16">
            <Section title="Rating">
              <LineTrend
                data={data.ratings.data}
                x="t"
                lines={data.ratings.classes.map((c) => ({ key: c, name: c[0].toUpperCase() + c.slice(1), color: TIME_CLASS_COLOR[c] }))}
                xFormat={dateFmt}
              />
            </Section>
            <Section title="Accuracy & blunders">
              <p className="muted text-xs font-semibold tabular-nums -mt-1 mb-2" title="The charts are 10-game averages">
                Per game: {data.ov.blundersPerGame.toFixed(2)} blunders · {data.ov.mistakesPerGame.toFixed(2)} mistakes
              </p>
              <LineTrend
                data={data.tr.filter((p) => p.accuracyAvg !== undefined)}
                x="t"
                lines={[{ key: 'accuracyAvg', name: 'Accuracy %', color: 'var(--series-1)' }]}
                xFormat={dateFmt}
                height={140}
              />
              <LineTrend
                data={data.tr.filter((p) => p.blundersAvg !== undefined)}
                x="t"
                lines={[{ key: 'blundersAvg', name: 'Blunders per game', color: 'var(--series-2)' }]}
                xFormat={dateFmt}
                height={110}
              />
            </Section>
          </div>
          <div id="results" className="grid lg:grid-cols-3 gap-4 scroll-mt-16">
            <Section title="Winning & losing positions">
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2.5">
                  <MiniStat label="Winning (≈+3)" value={`${data.conv.converted} of ${data.conv.hadWinning}`} hint={`converted · ${fmtPct(data.conv.conversionRate)}`} />
                  <MiniStat label="Losing (≈−3)" value={`${data.conv.saved} of ${data.conv.hadLosing}`} hint={`saved · ${fmtPct(data.conv.saveRate)}`} />
                </div>
                {thrown.length > 0 && (
                  <div>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="muted text-xs">Thrown games · lost from +3 or better</span>
                      <Link className="text-xs underline muted shrink-0" to="/games?result=thrown">
                        All {thrown.length}
                      </Link>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {thrown.slice(0, 6).map((g) => (
                        <Link key={g.id} className="chip !py-1 !px-2.5 hover:brightness-110" to={`/game/${encodeURIComponent(g.id)}`} state={backTo('Insights')}>
                          {opponentName(g)} <span style={{ color: 'var(--attention-ink)' }}>had {formatPeak(g.peakEval!)}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>
            <Section title="Score vs opponent rating">
              <HBarList
                data={data.rating.filter((r) => r.games).map((r) => ({ label: r.label, value: r.score, sub: `(${r.games})`, n: r.games }))}
                format={(v) => `${v.toFixed(0)}%`}
                max={100}
              />
              <div className="mt-4 font-semibold text-sm mb-2">By colour</div>
              <HBarList
                data={data.colors.filter((c) => c.games).map((c) => ({ label: c.color === 'w' ? 'White' : 'Black', value: c.score, sub: `(${c.games})`, n: c.games }))}
                format={(v) => `${v.toFixed(0)}%`}
                max={100}
              />
            </Section>
            <Section title="How games end">
              <div className="font-semibold text-sm mb-2">Your losses</div>
              <HBarList data={data.term.losses.map((t) => ({ label: t.name, value: t.value }))} color="var(--series-2)" />
              <div className="font-semibold text-sm mt-4 mb-2">Your wins</div>
              <HBarList data={data.term.wins.map((t) => ({ label: t.name, value: t.value }))} />
            </Section>
            {data.sessions.afterLossGames + data.sessions.afterWinGames >= 5 && (
              <div className="lg:col-span-3">
                <Section title="Sessions · live games" id="sessions">
                  <div className="grid md:grid-cols-3 gap-6">
                    <div className="grid grid-cols-3 md:grid-cols-1 gap-2 text-sm">
                      <MiniStat label="Score" value={fmtPct(data.sessions.overall)} />
                      {data.sessions.afterLossGames > 0 && <MiniStat label="After a loss" value={fmtPct(data.sessions.afterLoss)} hint={plural(data.sessions.afterLossGames, 'game')} />}
                      {data.sessions.afterWinGames > 0 && <MiniStat label="After a win" value={fmtPct(data.sessions.afterWin)} hint={plural(data.sessions.afterWinGames, 'game')} />}
                    </div>
                    <div>
                      <div className="font-semibold text-sm mb-2">By game # in a session</div>
                      <HBarList data={data.sessions.byIndex.map((b) => ({ label: b.label, value: b.score, sub: `(${b.games})`, n: b.games }))} format={(v) => `${v.toFixed(0)}%`} max={100} />
                    </div>
                    <div>
                      <div className="font-semibold text-sm mb-2">By time of day</div>
                      <HBarList data={data.sessions.byHour.map((b) => ({ label: b.label, value: b.score, sub: `(${b.games})`, n: b.games }))} format={(v) => `${v.toFixed(0)}%`} max={100} />
                    </div>
                  </div>
                </Section>
              </div>
            )}
          </div>
          </>
          )}
        </>
      )}
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    // The same tile as on Weaknesses: label in small capitals, the figure large.
    // The figures sit at the bottom, so tiles side by side line up when a label wraps.
    <div className="rounded-2xl bg-[var(--panel-2)] p-3 min-w-0 flex flex-col">
      <div className="muted text-[11px] font-extrabold uppercase tracking-wider leading-tight">{label}</div>
      <div className="mt-auto pt-0.5">
        <div className="font-extrabold text-2xl tabular-nums tracking-tight">{value}</div>
        {hint && <div className="muted text-xs font-semibold">{hint}</div>}
      </div>
    </div>
  );
}

function TrendArrow({ earlier, recent }: { earlier: number; recent: number }) {
  if (!earlier && !recent) return null;
  if (recent < earlier * 0.75) return <span title="Happening less often recently" style={{ color: 'var(--felt-ink)' }}>↓</span>;
  if (recent > earlier * 1.25) return <span title="Happening more often recently" style={{ color: 'var(--loss-ink)' }}>↑</span>;
  return <span className="muted" title="Steady">→</span>;
}

function ExampleList({ refs }: { refs: MoveRef[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5 my-2">
      {refs.map((r, i) => (
        <li key={i}>
          {/* Each opens the review at that move. */}
          <Link className="chip !py-1 !px-2.5 hover:brightness-110" to={`/game/${encodeURIComponent(r.gameId)}?ply=${r.ply + 1}`} state={backTo('Insights')}>
            <Icon name="play" size={11} /> {r.san}
            {r.label && <span className="muted font-normal">{r.label}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

type Tab = 'skills' | 'mistakes' | 'time' | 'results';

const TABS: [Tab, string][] = [
  ['skills', 'Skills'],
  ['mistakes', 'Mistakes'],
  ['time', 'Time'],
  ['results', 'Results'],
];

/** Sticky tabs. Only the active tab is rendered, so phones never draw every chart at once. */
function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      className="sticky top-[calc(3rem+var(--status-gap))] md:top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-2 frosted"
    >
      {/* One segmented control: a raised track with the chosen tab in felt green. */}
      <div className="grid grid-cols-4 rounded-full bg-[var(--panel-2)] p-1 max-w-md" role="tablist" aria-label="Insight sections">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`rounded-full px-2 py-1.5 text-sm font-bold transition-colors duration-200 ${tab === id ? 'bg-[var(--text)] text-[var(--bg)] shadow' : 'muted hover:text-[var(--text)]'}`}
            onClick={() => onChange(id)}
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
