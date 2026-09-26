import { Link } from 'react-router-dom';
import type { CoachItem } from '../lib/insights/coach';

export function CoachReport({ items, strengths, analysed }: { items: CoachItem[]; strengths: string[]; analysed: number }) {
  if (analysed < 3)
    return <p className="muted text-sm">Your personal coach report appears once at least 3 games are analysed ({analysed} so far). It gets sharper with more games.</p>;
  if (!items.length) return <p className="text-sm">No major recurring weaknesses found in these games. Nice! Keep playing and check back.</p>;
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={it.id} className="rounded-lg border border-[var(--border)] p-3">
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-7 h-7 rounded-full bg-accent text-white font-bold flex items-center justify-center text-sm">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{it.title}</span>
                {it.trend === 'improving' && <span className="chip" style={{ color: '#6a9e36' }}>↓ improving</span>}
                {it.trend === 'worsening' && <span className="chip" style={{ color: '#e02828' }}>↑ getting worse</span>}
              </div>
              <p className="text-sm muted mt-1">{it.evidence}</p>
              <p className="text-sm mt-2">💡 {it.tip}</p>
              <div className="flex flex-wrap gap-2 mt-2 items-center">
                {it.drill && (
                  <Link className="btn btn-primary !py-1 !text-xs" to={it.drill.to}>
                    {it.drill.label} →
                  </Link>
                )}
                {it.examples.map((ex, j) => (
                  <Link
                    key={j}
                    className="chip hover:underline"
                    to={`/game/${encodeURIComponent(ex.gameId)}${ex.ply || ex.san ? `?ply=${ex.ply + 1}` : ''}`}
                    title={ex.label}
                  >
                    {ex.san || 'Game'} ↗
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
      {strengths.length > 0 && (
        <div className="rounded-lg p-3 bg-[var(--panel-2)]">
          <div className="font-semibold text-sm mb-1">Strengths</div>
          <ul className="text-sm space-y-1">
            {strengths.map((s) => (
              <li key={s}>✅ {s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
