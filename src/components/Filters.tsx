import type { InsightFilters } from '../hooks/useInsightData';

export function Filters({ value, onChange }: { value: InsightFilters; onChange: (f: InsightFilters) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <select className="input" value={value.timeClass} onChange={(e) => onChange({ ...value, timeClass: e.target.value })}>
        <option value="all">All time controls</option>
        {['bullet', 'blitz', 'rapid', 'daily'].map((t) => (
          <option key={t} value={t}>
            {t[0].toUpperCase() + t.slice(1)}
          </option>
        ))}
      </select>
      <select
        className="input"
        aria-label="Which games"
        value={value.lastGames ? `g${value.lastGames}` : `d${value.days}`}
        onChange={(e) => {
          const v = e.target.value;
          const n = Number(v.slice(1));
          onChange(v[0] === 'g' ? { ...value, days: 0, lastGames: n } : { ...value, days: n, lastGames: 0 });
        }}
      >
        <option value="d0">All games</option>
        <option value="g50">Last 50 games</option>
        <option value="g100">Last 100 games</option>
        <option value="g200">Last 200 games</option>
        <option value="d7">Last 7 days</option>
        <option value="d30">Last 30 days</option>
        <option value="d90">Last 90 days</option>
        <option value="d365">Last year</option>
      </select>
      <select className="input" value={value.color} onChange={(e) => onChange({ ...value, color: e.target.value })}>
        <option value="all">Both colours</option>
        <option value="w">As White</option>
        <option value="b">As Black</option>
      </select>
    </div>
  );
}

/** Remembers the last filters (per browser) so Insights and Openings open the way you left them. */
export function loadFilters(): InsightFilters | undefined {
  try {
    const raw = localStorage.getItem('insight-filters');
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function storeFilters(f: InsightFilters) {
  try {
    localStorage.setItem('insight-filters', JSON.stringify(f));
  } catch {
    // ignore
  }
}
