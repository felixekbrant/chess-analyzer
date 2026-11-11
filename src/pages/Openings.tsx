import { backTo } from '../lib/backLink';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { parsePgn } from '../lib/pgn/parse';
import { MiniBoard } from '../components/MiniBoard';
import { Link } from 'react-router-dom';
import { useInsightData, DEFAULT_FILTERS, type InsightFilters } from '../hooks/useInsightData';
import { openingStats, type OpeningStat } from '../lib/insights/compute';
import { Filters, loadFilters, storeFilters } from '../components/Filters';
import { Picker } from '../components/Picker';
import { Empty, LoadingShape, PageHeader, fmtPct } from '../components/ui';

export default function Openings() {
  const [filters, setFiltersState] = useState<InsightFilters>(() => ({ ...(loadFilters() ?? DEFAULT_FILTERS), color: 'all' }));
  const setFilters = (f: InsightFilters) => {
    setFiltersState(f);
    storeFilters(f);
  };
  const [detailed, setDetailed] = useState(false);
  const { games, summaries, loading } = useInsightData(filters);
  // Most-played first: those are the openings worth working on.
  const stats = useMemo(() => [...openingStats(games, summaries, !detailed)].sort((a, b) => b.games - a.games), [games, summaries, detailed]);

  return (
    <div className="space-y-4 max-w-[1300px] mx-auto">
      <PageHeader
        title="Openings"
        actions={
          <>
            <Filters value={filters} onChange={setFilters} />
            <Picker
              label="Group"
              value={detailed ? 'v' : 'f'}
              onChange={(v) => setDetailed(v === 'v')}
              options={[
                { value: 'f', label: 'Openings' },
                { value: 'v', label: 'Variations' },
              ]}
            />
          </>
        }
      />
      {loading ? (
        <LoadingShape />
      ) : (
        (['w', 'b'] as const)
          .filter((c) => filters.color === 'all' || filters.color === c)
          .map((c) => (
            <section key={c} className="space-y-3">
              <div className="px-1">
                <h2 className="font-extrabold text-[17px] tracking-tight">{c === 'w' ? 'As White' : 'As Black'}</h2>
                {/* Opening names don't say whose they are: a "Defense" or the Englund Gambit is Black's, met here as White. */}
                <p className="muted text-xs">Your games with {c === 'w' ? 'White' : 'Black'}, by opening: yours or the one you met.</p>
              </div>
              {/* Your three main openings as cards, with the position where you usually leave book. */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {stats
                  .filter((s) => s.color === c)
                  .slice(0, 3)
                  .map((r) => (
                    <MainOpening key={r.key} r={r} />
                  ))}
              </div>
              {stats.filter((s) => s.color === c).length > 3 && (
                <div className="panel px-4">
                  <OpeningCards rows={stats.filter((s) => s.color === c).slice(3)} />
                </div>
              )}
            </section>
          ))
      )}
    </div>
  );
}

/** The rest of your openings: one compact row each; tap for the details. */
function OpeningCards({ rows }: { rows: OpeningStat[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  if (!rows.length) return <Empty>No games.</Empty>;
  // Openings with one or two games say little: they wait behind "Show more".
  const main = rows.filter((r) => r.games >= 3);
  const rest = rows.length - main.length;
  const shown = showAll || !main.length ? rows : main;
  return (
    <>
    <ul className="divide-y divide-[var(--border)] -mx-1">
      {shown.map((r) => {
        const few = r.games < 3;
        const isOpen = open === r.key;
        return (
          <li key={r.key} className="px-1">
            <button className="w-full text-left py-2.5 flex items-center gap-3" onClick={() => setOpen(isOpen ? null : r.key)} aria-expanded={isOpen}>
              <span className="font-bold leading-snug truncate flex-1 min-w-0">{r.name}</span>
              <span className="muted text-xs tabular-nums shrink-0">
                {r.games} game{r.games === 1 ? '' : 's'}
              </span>
              {few ? (
                // One or two games aren't a score: say how they went, without a bar or a percentage.
                <span className="muted text-xs tabular-nums shrink-0 text-right">{fewResults(r)}</span>
              ) : (
                <>
                  <span className="w-16 sm:w-28 shrink-0">
                    <WDL w={r.wins} d={r.draws} l={r.losses} />
                  </span>
                  <b className="w-10 text-right text-sm tabular-nums shrink-0" style={{ color: r.score >= 55 ? 'var(--felt-ink)' : r.score < 40 ? 'var(--loss-ink)' : undefined }}>
                    {fmtPct(r.score)}
                  </b>
                </>
              )}
            </button>
            {isOpen && (
              <div className="pb-3 space-y-2 text-sm">
                <div className="muted text-xs">
                  {r.wins}W {r.draws}D {r.losses}L
                  {r.accuracy !== undefined && ` · accuracy ${fmtPct(r.accuracy)}`}
                  {r.avgBookExit ? ` · out of book ~move ${r.avgBookExit.toFixed(0)}` : ''}
                </div>
                {r.commonErrors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {r.commonErrors.map((e, i) => (
                      <Link key={i} className="chip !py-1 !px-2.5" to={`/game/${encodeURIComponent(e.ref.gameId)}?ply=${e.ref.ply + 1}`} state={backTo('Openings')}>
                        {e.moveLabel}
                        {e.bestSan && <span className="muted font-normal"> → {e.bestSan}</span>}
                        {e.count > 1 ? ` ×${e.count}` : ''}
                      </Link>
                    ))}
                    <Link className="btn !py-1 !px-3 !text-xs" to={`/training?opening=${encodeURIComponent(r.name)}`}>
                      Drill
                    </Link>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
    {rest > 0 && main.length > 0 && (
      <button className="w-full text-sm muted underline py-3 border-t border-[var(--border)]" onClick={() => setShowAll((v) => !v)}>
        {showAll ? 'Show fewer' : `Show ${rest} more with fewer than 3 games`}
      </button>
    )}
    </>
  );
}

/** How one or two games went, in words: "won", "lost", "1 won, 1 lost". */
function fewResults(r: OpeningStat): string {
  const parts = [
    [r.wins, 'won'],
    [r.draws, 'drawn'],
    [r.losses, 'lost'],
  ].filter(([n]) => n) as [number, string][];
  return r.games === 1 ? (parts[0]?.[1] ?? '') : parts.map(([n, w]) => `${n} ${w}`).join(', ');
}

function WDL({ w, d, l }: { w: number; d: number; l: number }) {
  const t = w + d + l || 1;
  return (
    <div className="flex h-2 rounded-full overflow-hidden gap-px" title={`${w} wins, ${d} draws, ${l} losses`}>
      {w > 0 && <div style={{ width: `${(100 * w) / t}%`, background: 'var(--win)' }} />}
      {d > 0 && <div style={{ width: `${(100 * d) / t}%`, background: '#a3a19c' }} />}
      {l > 0 && <div style={{ width: `${(100 * l) / t}%`, background: 'var(--loss)' }} />}
    </div>
  );
}

/** A main opening: the position where you usually leave book, your score as a ring, and what to fix. */
function MainOpening({ r }: { r: OpeningStat }) {
  const pgn = useLiveQuery(async () => (await db.pgns.get(r.gameIds[r.gameIds.length - 1]))?.pgn, [r.key]);
  const fen = useMemo(() => {
    if (!pgn) return undefined;
    try {
      const parsed = parsePgn(pgn);
      const ply = Math.min(parsed.plies.length, Math.max(1, Math.round((r.avgBookExit ?? 4) * 2) - (r.color === 'w' ? 2 : 1)));
      return parsed.plies[ply - 1]?.fenAfter ?? parsed.startFen;
    } catch {
      return undefined;
    }
  }, [pgn, r.avgBookExit, r.color]);
  const few = r.games < 3;
  return (
    <article className="panel p-3 flex gap-3 min-w-0">
      <div className="w-24 shrink-0">{fen ? <MiniBoard fen={fen} orientation={r.color === 'b' ? 'black' : 'white'} /> : <div className="skeleton aspect-square rounded-lg" />}</div>
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-extrabold leading-tight">{r.name}</div>
            <div className="muted text-xs font-semibold tabular-nums mt-0.5">
              {r.games} game{r.games === 1 ? '' : 's'} · {r.wins}W {r.draws}D {r.losses}L
            </div>
          </div>
          <ScoreRing score={r.score} dim={few} />
        </div>
        <div className="muted text-xs">
          {r.accuracy !== undefined && `accuracy ${fmtPct(r.accuracy)}`}
          {r.avgBookExit ? ` · out of book ~move ${r.avgBookExit.toFixed(0)}` : ''}
        </div>
        {r.commonErrors.length > 0 && (
          // Drill stays bottom right on every card; the move chips wrap in the space beside it.
          <div className="flex items-end gap-1.5 mt-auto">
            <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
              {r.commonErrors.slice(0, 2).map((e, i) => (
                <Link key={i} className="chip !py-0.5 !px-2" to={`/game/${encodeURIComponent(e.ref.gameId)}?ply=${e.ref.ply + 1}`} state={backTo('Openings')}>
                  {e.moveLabel}
                  {e.bestSan && <span className="muted font-normal"> → {e.bestSan}</span>}
                </Link>
              ))}
            </div>
            <Link className="btn !py-0.5 !px-2.5 !text-xs shrink-0" to={`/training?opening=${encodeURIComponent(r.name)}`}>
              Drill
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}

/** Score as a ring: green when it's going well, red when it isn't, dimmed with too few games to tell. */
function ScoreRing({ score, dim }: { score: number; dim: boolean }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const color = dim ? 'var(--draw)' : score >= 55 ? 'var(--win)' : score < 40 ? 'var(--loss)' : 'var(--brass)';
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" className={`shrink-0 ${dim ? 'opacity-60' : ''}`} role="img" aria-label={`Score ${Math.round(score)}%`}>
      <circle cx="21" cy="21" r={r} fill="none" stroke="var(--panel-2)" strokeWidth="4.5" />
      <circle cx="21" cy="21" r={r} fill="none" stroke={color} strokeWidth="4.5" strokeLinecap="round" strokeDasharray={`${(c * score) / 100} ${c}`} transform="rotate(-90 21 21)" />
      <text x="21" y="25" textAnchor="middle" fontSize="11" fontWeight="900" fill="var(--text)">
        {Math.round(score)}
      </text>
    </svg>
  );
}
