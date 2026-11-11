import { useState } from 'react';
import { type PickerOption } from './Picker';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
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

/** All three filters behind one pill that says what is shown; one sheet to change them. */
export function Filters({ value, onChange }: { value: InsightFilters; onChange: (f: InsightFilters) => void }) {
  const [open, setOpen] = useState(false);
  const which = value.lastGames ? `g${value.lastGames}` : `d${value.days}`;
  const label = (opts: PickerOption<string>[], v: string) => opts.find((o) => o.value === v)?.label ?? v;
  const summary = [label(TIME, value.timeClass), label(WHICH, which), label(COLOUR, value.color)].join(' · ');
  const group = (title: string, opts: PickerOption<string>[], current: string, set: (v: string) => void) => (
    <div>
      <div className="muted text-xs font-extrabold uppercase tracking-wider mb-1.5 px-1">{title}</div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={title}>
        {opts.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={o.value === current}
            className={`rounded-full px-3 py-1.5 text-sm font-bold transition-colors ${o.value === current ? 'bg-[var(--text)] text-[var(--bg)]' : 'bg-[var(--panel-2)] hover:brightness-110'}`}
            onClick={() => set(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-bold bg-[var(--panel-2)] hover:brightness-110 max-w-full"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Filters: ${summary}`}
      >
        <Icon name="filter" size={14} className="shrink-0" />
        <span className="truncate">{summary}</span>
        <Icon name="chevronDown" size={14} className="muted shrink-0" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Filters">
        <div className="space-y-4">
          {group('Time control', TIME, value.timeClass, (timeClass) => onChange({ ...value, timeClass }))}
          {group('Which games', WHICH, which, (v) => {
            const n = Number(v.slice(1));
            onChange(v[0] === 'g' ? { ...value, days: 0, lastGames: n } : { ...value, days: n, lastGames: 0 });
          })}
          {group('Colour', COLOUR, value.color, (color) => onChange({ ...value, color }))}
          <button className="btn btn-primary w-full justify-center" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      </Sheet>
    </>
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
