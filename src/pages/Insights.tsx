import { Icon } from '../components/Icon';
import { opponentName } from '../lib/games/build';
import { relativeDay } from '../lib/format';
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
  timeStats,
  trend,
  ratingSeries,
  TIME_CLASS_COLOR,
  type MoveRef,
} from '../lib/insights/compute';
import { coachReport } from '../lib/insights/coach';
import { formatDuration } from '../lib/pgn/parse';
import { SkillsTab } from '../components/SkillsTab';
import { useSkills } from '../hooks/useSkills';
import { Filters, loadFilters, storeFilters } from '../components/Filters';
import { HBarList, LineTrend } from '../components/charts';
import { MiniBoard } from '../components/MiniBoard';
import { Empty, PageHeader, Section, Stat, fmtPct } from '../components/ui';

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

  const data = useMemo(() => {
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
      report: coachReport(ag, games, summaries, pre),
      mixesDailyAndLive: games.some((g) => g.timeClass === 'daily') && games.some((g) => g.timeClass !== 'daily'),
    };
  }, [games, summaries, ag]);

  // Filtered data must not move the weekly focus; Home manages that.
  const skills = useSkills(games, ag, false);

  const dateFmt = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div className="space-y-4 max-w-[1300px]">
      <PageHeader
        title="Insights"
        subtitle={loading ? 'Loading…' : `${ag.length} analysed games`}
        actions={<Filters value={filters} onChange={setFilters} />}
      />
      {!loading && !games.length && <Empty>No games for these filters.</Empty>}
      {games.length > 0 && (
        <>
          <TabBar tab={tab} onChange={setTab} />
          {tab === 'skills' && <SkillsTab data={skills} />}
          {tab === 'overview' && (
          <>
          <div id="overview" className="grid grid-cols-2 lg:grid-cols-5 gap-3 scroll-mt-16">
            <Stat label="Score" value={fmtPct(data.ov.score)} sub={`${data.ov.wins}W ${data.ov.draws}D ${data.ov.losses}L`} />
            <Stat label="Accuracy" value={fmtPct(data.ov.accuracy, 1)} />
            <Stat label="Blunders / game" value={data.ov.blundersPerGame.toFixed(2)} />
            <Stat label="Mistakes / game" value={data.ov.mistakesPerGame.toFixed(2)} />
            <Stat label="Inaccuracies / game" value={data.ov.inaccuraciesPerGame.toFixed(2)} />
          </div>

          {data.report.strengths.length > 0 && (
            <Section title="Your strengths">
              <ul className="text-sm space-y-1">
                {data.report.strengths.map((s) => (
                  <li key={s} className="flex gap-1.5">
                  <Icon name="check" size={16} className="text-accent shrink-0 mt-0.5" /> {s}
                </li>
                ))}
              </ul>
              <button className="text-sm underline muted mt-3" onClick={() => setTab('skills')}>
                Where you lose the most points: see Skills
              </button>
            </Section>
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
            <Section title="Accuracy & blunders" right={<span className="muted text-xs">10-game average</span>}>
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

          </>
          )}

          {tab === 'mistakes' && (
          <>
          <div className="grid lg:grid-cols-2 gap-4">
            <Section title="Game phases" id="phases">
              <div className="grid grid-cols-3 gap-2" title="Book moves are excluded. Errors = mistakes and blunders per 100 moves. Share = how much of the win chance you lost happened in that phase.">
                {data.phases.map((p) => (
                  <Link key={p.phase} to={`/training?phase=${p.phase}`} className="rounded-lg bg-[var(--panel-2)] p-2.5 text-center hover:brightness-110">
                    <div className="muted text-xs font-bold capitalize">{p.phase}</div>
                    <div className="text-xl font-black tabular-nums">{fmtPct(p.accuracy)}</div>
                    <div className="muted text-[11px] tabular-nums leading-snug">
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

            <Section title="Mistake types" id="mistakes" right={<span className="muted text-xs" title="Compared with your earlier games in this selection"><span style={{ color: "#6a9e36" }}>↓</span> less often · <span style={{ color: "#e02828" }}>↑</span> more often</span>}>
              {!data.motifs.length ? (
                <Empty>No errors detected yet.</Empty>
              ) : (
                <div className="space-y-2">
                  {data.motifs.map((m) => (
                    <details key={m.motif} className="rounded-lg border border-[var(--border)] px-3 py-2">
                      <summary className="cursor-pointer flex items-center gap-2 text-sm">
                        <span className="font-semibold flex-1">{MOTIF_LABEL[m.motif]}</span>
                        <span className="muted tabular-nums">{m.count}×</span>
                        <span className="tabular-nums w-28 text-right">−{m.costPerGame.toFixed(1)}% / game</span>
                        <TrendArrow earlier={m.earlierRate} recent={m.recentRate} />
                      </summary>
                      <ExampleList refs={m.examples} />
                      <Link className="text-xs underline" to={`/training?motif=${m.motif}`}>
                        Train these →
                      </Link>
                    </details>
                  ))}
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
                    <Link className="block max-w-[240px]" to={`/game/${encodeURIComponent(r.refs[r.refs.length - 1].gameId)}?ply=${r.refs[r.refs.length - 1].ply + 1}`}>
                      <MiniBoard fen={r.fen} orientation={r.fen.split(' ')[1] === 'w' ? 'white' : 'black'} />
                    </Link>
                    <div className="text-sm">
                      You played <b>{r.moveLabel}</b> {r.count}× {r.bestSan && <>— better is <b>{r.bestSan}</b></>}
                    </div>
                    {r.opening && <div className="muted text-xs">{r.opening}</div>}
                    <div className="flex flex-wrap gap-1">
                      {r.refs.map((x, i) => (
                        <Link key={i} className="chip hover:underline" to={`/game/${encodeURIComponent(x.gameId)}?ply=${x.ply + 1}`}>
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
                      value={`${data.time.lostOnTime}`}
                      hint={data.time.lostOnTimeWinning ? `${data.time.lostOnTimeWinning} while better` : `of ${data.time.lossesTotal} losses`}
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
                      { key: 'opponent', name: 'Opponents', color: 'var(--series-2)', dots: true },
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

          )}
          {tab === 'results' && (
          <div id="results" className="grid lg:grid-cols-3 gap-4 scroll-mt-16">
            <Section title="Winning & losing positions">
              <div className="space-y-3 text-sm">
                <div>
                  <div className="muted text-xs">Converted winning positions (≈+3)</div>
                  <div className="text-xl font-bold">
                    {data.conv.converted} / {data.conv.hadWinning} <span className="text-sm muted">({fmtPct(data.conv.conversionRate)})</span>
                  </div>
                </div>
                <div>
                  <div className="muted text-xs">Saved lost positions (≈−3)</div>
                  <div className="text-xl font-bold">
                    {data.conv.saved} / {data.conv.hadLosing} <span className="text-sm muted">({fmtPct(data.conv.saveRate)})</span>
                  </div>
                </div>
                {data.conv.thrownGameIds.length > 0 && (
                  <div>
                    <div className="muted text-xs mb-1">Winning games you didn't win</div>
                    <div className="flex flex-wrap gap-1">
                      {data.conv.thrownGameIds.slice(0, 10).map((id) => {
                        const g = games.find((x) => x.id === id);
                        return (
                          <Link key={id} className="chip hover:underline" to={`/game/${encodeURIComponent(id)}`}>
                            {g ? `${opponentName(g)} · ${relativeDay(g.endTime)}` : 'Game'}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </Section>
            <Section title="Score vs opponent rating">
              <HBarList
                data={data.rating.filter((r) => r.games).map((r) => ({ label: r.label, value: r.score, sub: `(${r.games})` }))}
                format={(v) => `${v.toFixed(0)}%`}
                max={100}
              />
              <div className="mt-4 font-semibold text-sm mb-2">By colour</div>
              <HBarList
                data={data.colors.filter((c) => c.games).map((c) => ({ label: c.color === 'w' ? 'White' : 'Black', value: c.score, sub: `(${c.games})` }))}
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
                      <HBarList data={data.sessions.byIndex.map((b) => ({ label: b.label, value: b.score, sub: `(${b.games})` }))} format={(v) => `${v.toFixed(0)}%`} max={100} />
                    </div>
                    <div>
                      <div className="font-semibold text-sm mb-2">By time of day</div>
                      <HBarList data={data.sessions.byHour.map((b) => ({ label: b.label, value: b.score, sub: `(${b.games})` }))} format={(v) => `${v.toFixed(0)}%`} max={100} />
                    </div>
                  </div>
                </Section>
              </div>
            )}
          </div>
          )}

        </>
      )}
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-[var(--panel-2)] p-3">
      <div className="muted text-xs">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      {hint && <div className="muted text-xs">{hint}</div>}
    </div>
  );
}

function TrendArrow({ earlier, recent }: { earlier: number; recent: number }) {
  if (!earlier && !recent) return null;
  if (recent < earlier * 0.75) return <span title="Happening less often recently" style={{ color: '#6a9e36' }}>↓</span>;
  if (recent > earlier * 1.25) return <span title="Happening more often recently" style={{ color: '#e02828' }}>↑</span>;
  return <span className="muted" title="Steady">→</span>;
}

function ExampleList({ refs }: { refs: MoveRef[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5 my-2">
      {refs.map((r, i) => (
        <li key={i}>
          {/* Each opens the review at that move. */}
          <Link className="chip !py-1 !px-2.5 hover:brightness-110" to={`/game/${encodeURIComponent(r.gameId)}?ply=${r.ply + 1}`}>
            <Icon name="play" size={11} /> {r.san}
            {r.label && <span className="muted font-normal">{r.label}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

type Tab = 'skills' | 'overview' | 'mistakes' | 'time' | 'results';

const TABS: [Tab, string][] = [
  ['skills', 'Skills'],
  ['overview', 'Overview'],
  ['mistakes', 'Mistakes'],
  ['time', 'Time'],
  ['results', 'Results'],
];

/** Sticky tabs. Only the active tab is rendered, so phones never draw every chart at once. */
function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      className="sticky top-12 md:top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-2 bg-[var(--bg)]/95 backdrop-blur border-b border-[var(--border)] flex gap-1 overflow-x-auto no-scrollbar"
      role="tablist"
      aria-label="Insight sections"
    >
      {TABS.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={tab === id}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ${tab === id ? 'bg-[var(--text)] text-[var(--bg)]' : 'bg-[var(--panel-2)] muted'}`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
