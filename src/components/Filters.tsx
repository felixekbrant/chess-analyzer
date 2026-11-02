import { Picker, type PickerOption } from './Picker';
import type { InsightFilters } from '../hooks/useInsightData';

const TIME: PickerOption<string>[] = [
  { value: 'all', label: 'All time controls' },
  ...['bullet', 'blitz', 'rapid', 'daily'].map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) })),
];
const WHICH: PickerOption<string>[] = [
  { value: 'd0', label: 'All games' },
  { value: 'g50', label: 'Last 50 games' },
  { value: 'g100', label: 'Last 100 games' },
  { value: 'g200', label: 'Last 200 games' },
  { value: 'd7', label: 'Last 7 days' },
  { value: 'd30', label: 'Last 30 days' },
  { value: 'd90', label: 'Last 90 days' },
  { value: 'd365', label: 'Last year' },
];
const COLOUR: PickerOption<string>[] = [
  { value: 'all', label: 'Both colours' },
  { value: 'w', label: 'As White' },
  { value: 'b', label: 'As Black' },
];

export function Filters({ value, onChange }: { value: InsightFilters; onChange: (f: InsightFilters) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
      <Picker label="Time control" value={value.timeClass} options={TIME} onChange={(timeClass) => onChange({ ...value, timeClass })} className="shrink-0" />
      <Picker
        label="Which games"
        value={value.lastGames ? `g${value.lastGames}` : `d${value.days}`}
        options={WHICH}
        onChange={(v) => {
          const n = Number(v.slice(1));
          onChange(v[0] === 'g' ? { ...value, days: 0, lastGames: n } : { ...value, days: n, lastGames: 0 });
        }}
        className="shrink-0"
      />
      <Picker label="Colour" value={value.color} options={COLOUR} onChange={(color) => onChange({ ...value, color })} className="shrink-0" />
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
