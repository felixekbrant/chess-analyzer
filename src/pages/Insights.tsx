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
import { CoachReport } from '../components/CoachReport';
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
  const tab = (TABS.some(([id]) => id === params.get('tab')) ? params.get('tab') : 'overview') as Tab;
  const setTab = (t: Tab) => {
    setParams(t === 'overview' ? {} : { tab: t }, { replace: true });
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

  const dateFmt = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div className="space-y-4 max-w-[1300px]">
      <PageHeader
        title="Insights"
        subtitle={loading ? 'Loading…' : `${games.length} games, ${ag.length} analysed. Everything here is computed from your own games.`}
        actions={<Filters value={filters} onChange={setFilters} />}
      />
      {!loading && !games.length && <Empty>No games for these filters.</Empty>}
      {games.length > 0 && (
        <>
          <TabBar tab={tab} onChange={setTab} />
          {tab === 'overview' && (
          <>
          <div id="overview" className="grid grid-cols-2 lg:grid-cols-5 gap-3 scroll-mt-16">
            <Stat label="Score" value={fmtPct(data.ov.score)} sub={`${data.ov.wins}W ${data.ov.draws}D ${data.ov.losses}L`} />
            <Stat label="Accuracy" value={fmtPct(data.ov.accuracy, 1)} />
            <Stat label="Blunders / game" value={data.ov.blundersPerGame.toFixed(2)} />
            <Stat label="Mistakes / game" value={data.ov.mistakesPerGame.toFixed(2)} />
            <Stat label="Inaccuracies / game" value={data.ov.inaccuraciesPerGame.toFixed(2)} />
          </div>

          <Section title="Your coach report">
            <CoachReport items={data.report.items} strengths={data.report.strengths} analysed={ag.length} />
          </Section>

          <div id="trends" className="grid lg:grid-cols-2 gap-4 scroll-mt-16">
            <Section title="Rating">
              <LineTrend
                data={data.ratings.data}
                x="t"
                lines={data.ratings.classes.map((c) => ({ key: c, name: c[0].toUpperCase() + c.slice(1), color: TIME_CLASS_COLOR[c] }))}
                xFormat={dateFmt}
              />
            </Section>
            <Section title="Accuracy & blunders (10-game rolling average)">
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
              <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Phase</th>
                    <th>Accuracy</th>
                    <th>Errors /100</th>
                    <th>Share of loss</th>
                    <th>Time / move</th>
                  </tr>
                </thead>
                <tbody>
                  {data.phases.map((p) => (
                    <tr key={p.phase}>
                      <td className="capitalize font-semibold">
                        <Link className="hover:underline" to={`/training?phase=${p.phase}`}>
                          {p.phase}
                        </Link>
                      </td>
                      <td className="tabular-nums">{fmtPct(p.accuracy)}</td>
                      <td className="tabular-nums">{p.errorsPer100.toFixed(1)}</td>
                      <td className="tabular-nums">{fmtPct(p.shareOfLoss)}</td>
                      <td className="tabular-nums">{formatDuration(p.avgTime) || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <p className="muted text-xs mt-2">Book moves are excluded. Errors /100 = mistakes and blunders per 100 moves. “Share of loss” = how much of the win chance you lost happened in that phase.</p>
            </Section>

            <Section title="Mistake types" id="mistakes">
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
              <Empty>No position where you made the same mistake twice. 👍</Empty>
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
          <Section title="Time management" id="time">
            {data.mixesDailyAndLive && (
              <p className="muted text-xs mb-3">
                Tip: daily games have no clock, so these numbers only cover your live games. Filter by one time control for a sharper picture.
              </p>
            )}
            {data.time.gamesWithClock === 0 ? (
              <Empty>No clock data (daily games don't have clocks).</Empty>
            ) : (
              <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
                <div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <MiniStat label="Games in time trouble" value={fmtPct(data.time.timeTroubleGamesPct)} hint="clock under 10% of starting time" />
                    <MiniStat
                      label="Errors made in time trouble"
                      value={`${data.time.timeTroubleErrors} / ${data.time.errorsTotal}`}
                      hint={fmtPct((100 * data.time.timeTroubleErrors) / Math.max(1, data.time.errorsTotal))}
                    />
                    <MiniStat
                      label="Lost on time"
                      value={`${data.time.lostOnTime} / ${data.time.lossesTotal} losses`}
                      hint={data.time.lostOnTimeWinning ? `${data.time.lostOnTimeWinning} while better on the board` : ''}
                    />
                    <MiniStat label="Rushed errors" value={String(data.time.rushedErrors)} hint="under 2s with time on the clock" />
                    <MiniStat
                      label="Long thinks"
                      value={String(data.time.longThinks)}
                      hint={`${fmtPct(data.time.longThinkAccuracy)} accuracy vs ${fmtPct(data.time.normalAccuracy)} normally`}
                    />
                    <MiniStat
                      label="Long thinks ending in an error"
                      value={fmtPct(data.time.longThinkErrorRate)}
                      hint="spent a lot of time and still went wrong"
                    />
                  </div>
                  <div className="font-semibold text-sm mb-2">Average time per move</div>
                  <HBarList
                    data={(['opening', 'middlegame', 'endgame'] as const)
                      .filter((p) => data.time.avgTimeByPhase[p] !== undefined)
                      .map((p) => ({ label: p[0].toUpperCase() + p.slice(1), value: data.time.avgTimeByPhase[p]! }))}
                    format={(v) => formatDuration(v)}
                  />
                </div>
                <div>
                  <div className="font-semibold text-sm mb-1">Clock remaining (% of starting time)</div>
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
                  <p className="muted text-xs">If your line drops faster than your opponents', you're spending too long early on.</p>
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
                      {data.conv.thrownGameIds.slice(0, 10).map((id, i) => (
                        <Link key={id} className="chip hover:underline" to={`/game/${encodeURIComponent(id)}`}>
                          #{i + 1}
                        </Link>
                      ))}
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
          </div>
          )}

          {tab === 'sessions' && (
          <Section title="Sessions & tilt" id="sessions">
            <div className="grid md:grid-cols-3 gap-6">
              <div className="space-y-3 text-sm">
                <MiniStat label="Overall score" value={fmtPct(data.sessions.overall)} />
                <MiniStat label="Right after a loss" value={fmtPct(data.sessions.afterLoss)} hint={`${data.sessions.afterLossGames} games`} />
                <MiniStat label="Right after a win" value={fmtPct(data.sessions.afterWin)} hint={`${data.sessions.afterWinGames} games`} />
              </div>
              <div>
                <div className="font-semibold text-sm mb-2">Score by game # in a session</div>
                <HBarList data={data.sessions.byIndex.map((b) => ({ label: b.label, value: b.score, sub: `(${b.games})` }))} format={(v) => `${v.toFixed(0)}%`} max={100} />
              </div>
              <div>
                <div className="font-semibold text-sm mb-2">Score by time of day</div>
                <HBarList data={data.sessions.byHour.map((b) => ({ label: b.label, value: b.score, sub: `(${b.games})` }))} format={(v) => `${v.toFixed(0)}%`} max={100} />
              </div>
            </div>
            <p className="muted text-xs mt-3">A session = games less than 45 minutes apart.</p>
          </Section>
          )}
        </>
      )}
    </div>
  );
}

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
    <ul className="text-xs space-y-1 my-2">
      {refs.map((r, i) => (
        <li key={i}>
          <Link className="font-semibold hover:underline" to={`/game/${encodeURIComponent(r.gameId)}?ply=${r.ply + 1}`}>
            {r.san}
          </Link>{' '}
          <span className="muted">{r.label}</span>
        </li>
      ))}
    </ul>
  );
}

type Tab = 'overview' | 'mistakes' | 'time' | 'results' | 'sessions';

const TABS: [Tab, string][] = [
  ['overview', 'Overview'],
  ['mistakes', 'Mistakes'],
  ['time', 'Time'],
  ['results', 'Results'],
  ['sessions', 'Sessions'],
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
