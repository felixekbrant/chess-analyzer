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
      <select className="input" value={value.days} onChange={(e) => onChange({ ...value, days: Number(e.target.value) })}>
        <option value={0}>All time</option>
        <option value={7}>Last 7 days</option>
        <option value={30}>Last 30 days</option>
        <option value={90}>Last 90 days</option>
        <option value={365}>Last year</option>
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
