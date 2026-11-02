import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInsightData, DEFAULT_FILTERS, type InsightFilters } from '../hooks/useInsightData';
import { openingStats, type OpeningStat } from '../lib/insights/compute';
import { Filters, loadFilters, storeFilters } from '../components/Filters';
import { Picker } from '../components/Picker';
import { Empty, PageHeader, Section, fmtPct } from '../components/ui';

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
    <div className="space-y-4 max-w-[1300px]">
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

/** Phones: one compact row per opening; tap for the details. */
function OpeningCards({ rows }: { rows: OpeningStat[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!rows.length) return <Empty>No games.</Empty>;
  return (
    <ul className="divide-y divide-[var(--border)] -mx-1">
      {rows.map((r) => {
        const few = r.games < 3;
        const isOpen = open === r.key;
        return (
          <li key={r.key} className="px-1">
            <button className="w-full text-left py-2.5 space-y-1.5" onClick={() => setOpen(isOpen ? null : r.key)} aria-expanded={isOpen}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold leading-snug truncate">{r.name}</span>
                <span className="shrink-0 text-sm tabular-nums">
                  <span className="muted text-xs mr-2">{r.games} game{r.games === 1 ? '' : 's'}</span>
                  <b style={{ color: few ? undefined : r.score >= 55 ? '#81b64c' : r.score < 40 ? '#e5713f' : undefined }} className={few ? 'muted' : ''}>
                    {fmtPct(r.score)}
                  </b>
                </span>
              </div>
              {/* Too few games to mean much: shown dimmed. */}
              <div className={few ? 'opacity-30' : ''}>
                <WDL w={r.wins} d={r.draws} l={r.losses} />
              </div>
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
                      <Link key={i} className="chip !py-1 !px-2.5" to={`/game/${encodeURIComponent(e.ref.gameId)}?ply=${e.ref.ply + 1}`}>
                        {e.moveLabel}
                        {e.bestSan && <span className="muted font-normal"> → {e.bestSan}</span>}
                        {e.count > 1 ? ` ×${e.count}` : ''}
                      </Link>
                    ))}
                    <Link className="btn btn-primary !py-1 !px-3 !text-xs" to={`/training?opening=${encodeURIComponent(r.name)}`}>
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
