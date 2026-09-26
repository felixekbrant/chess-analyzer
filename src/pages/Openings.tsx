import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInsightData, DEFAULT_FILTERS, type InsightFilters } from '../hooks/useInsightData';
import { openingStats, type OpeningStat } from '../lib/insights/compute';
import { Filters, loadFilters, storeFilters } from '../components/Filters';
import { Empty, PageHeader, Section, fmtPct } from '../components/ui';

export default function Openings() {
  const [filters, setFiltersState] = useState<InsightFilters>(() => ({ ...(loadFilters() ?? DEFAULT_FILTERS), color: 'all' }));
  const setFilters = (f: InsightFilters) => {
    setFiltersState(f);
    storeFilters(f);
  };
  const [detailed, setDetailed] = useState(false);
  const { games, summaries, loading } = useInsightData(filters);
  const stats = useMemo(() => openingStats(games, summaries, !detailed), [games, summaries, detailed]);

  return (
    <div className="space-y-4 max-w-[1300px]">
      <PageHeader
        title="Openings"
        subtitle="How you do in each opening, where you leave theory, and the moves that keep costing you."
        actions={
          <>
            <Filters value={filters} onChange={setFilters} />
            <button className="btn" onClick={() => setDetailed((d) => !d)}>
              {detailed ? 'Group by family' : 'Show variations'}
            </button>
          </>
        }
      />
      {loading ? (
        <Empty>Loading…</Empty>
      ) : (
        (['w', 'b'] as const)
          .filter((c) => filters.color === 'all' || filters.color === c)
          .map((c) => (
            <Section key={c} title={c === 'w' ? 'As White' : 'As Black'}>
              <div className="hidden md:block">
                <OpeningTable rows={stats.filter((s) => s.color === c)} />
              </div>
              <div className="md:hidden">
                <OpeningCards rows={stats.filter((s) => s.color === c)} />
              </div>
            </Section>
          ))
      )}
    </div>
  );
}

function OpeningTable({ rows }: { rows: OpeningStat[] }) {
  if (!rows.length) return <Empty>No games.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="data">
        <thead>
          <tr>
            <th>Opening</th>
            <th>Games</th>
            <th className="min-w-40">Results</th>
            <th>Score</th>
            <th>Accuracy</th>
            <th>Opening acc.</th>
            <th>Leave book</th>
            <th>Where you go wrong</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="font-semibold max-w-72">{r.name}</td>
              <td className="tabular-nums">{r.games}</td>
              <td>
                <WDL w={r.wins} d={r.draws} l={r.losses} />
              </td>
              <td className="tabular-nums font-semibold" style={{ color: r.games >= 3 ? (r.score >= 55 ? '#6a9e36' : r.score < 40 ? '#e02828' : undefined) : undefined }}>
                {fmtPct(r.score)}
              </td>
              <td className="tabular-nums">{fmtPct(r.accuracy)}</td>
              <td className="tabular-nums">{fmtPct(r.openingAccuracy)}</td>
              <td className="tabular-nums muted">{r.avgBookExit ? `move ${r.avgBookExit.toFixed(0)}` : '–'}</td>
              <td className="text-xs">
                {r.commonErrors.map((e, i) => (
                  <div key={i}>
                    <Link className="hover:underline font-semibold" to={`/game/${encodeURIComponent(e.ref.gameId)}?ply=${e.ref.ply + 1}`}>
                      {e.moveLabel}
                    </Link>
                    {e.bestSan && <span className="muted"> → {e.bestSan}</span>}
                    {e.count > 1 && <span className="muted"> ({e.count}×)</span>}
                  </div>
                ))}
                {r.commonErrors.length > 0 && (
                  <Link className="underline muted" to={`/training?opening=${encodeURIComponent(r.name)}`}>
                    drill
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Phones: one card per opening instead of a wide table. */
function OpeningCards({ rows }: { rows: OpeningStat[] }) {
  if (!rows.length) return <Empty>No games.</Empty>;
  return (
    <ul className="divide-y divide-[var(--border)] -mx-1">
      {rows.map((r) => (
        <li key={r.key} className="px-1 py-3 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold leading-snug">{r.name}</span>
            <span
              className="text-sm font-bold tabular-nums shrink-0"
              style={{ color: r.games >= 3 ? (r.score >= 55 ? '#6a9e36' : r.score < 40 ? '#e02828' : undefined) : undefined }}
            >
              {fmtPct(r.score)}
            </span>
          </div>
          <WDL w={r.wins} d={r.draws} l={r.losses} />
          <div className="muted text-xs">
            {r.games} game{r.games === 1 ? '' : 's'} · {r.wins}W {r.draws}D {r.losses}L
            {r.accuracy !== undefined && ` · accuracy ${fmtPct(r.accuracy)}`}
            {r.avgBookExit ? ` · leave book ~move ${r.avgBookExit.toFixed(0)}` : ''}
          </div>
          {r.commonErrors.length > 0 && (
            <div className="text-xs flex flex-wrap gap-x-3 gap-y-1 items-center">
              <span className="muted">You go wrong with</span>
              {r.commonErrors.map((e, i) => (
                <Link key={i} className="font-semibold underline" to={`/game/${encodeURIComponent(e.ref.gameId)}?ply=${e.ref.ply + 1}`}>
                  {e.moveLabel}
                  {e.count > 1 ? ` (${e.count}×)` : ''}
                </Link>
              ))}
              <Link className="chip" to={`/training?opening=${encodeURIComponent(r.name)}`}>
                Drill
              </Link>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function WDL({ w, d, l }: { w: number; d: number; l: number }) {
  const t = w + d + l || 1;
  return (
    <div className="flex h-3 rounded overflow-hidden gap-px" title={`${w} wins, ${d} draws, ${l} losses`}>
      {w > 0 && <div style={{ width: `${(100 * w) / t}%`, background: '#81b64c' }} />}
      {d > 0 && <div style={{ width: `${(100 * d) / t}%`, background: '#a3a19c' }} />}
      {l > 0 && <div style={{ width: `${(100 * l) / t}%`, background: '#e02828' }} />}
    </div>
  );
}
