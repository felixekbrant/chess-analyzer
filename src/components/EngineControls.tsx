import type { ReactNode } from 'react';
import { saveSettings } from '../db/schema';
import { useSettings } from '../hooks/useStores';
import { Icon } from './Icon';

/**
 * The same engine controls on every review and puzzle: open the engine to play any moves with live
 * analysis. Its display options (eval bar, suggested moves) only appear while it is open, since
 * that's the only time they do anything; the choice is remembered across the app.
 */
export function EngineControls({
  open,
  onToggle,
  leading,
  show = 'all',
  compact,
}: {
  open: boolean;
  onToggle: () => void;
  leading?: ReactNode;
  /** Only the Engine switch, or only its display options (puzzles show them in different places). */
  show?: 'all' | 'toggle' | 'options';
  /** The switch at the small size, where it sits in a column of its own (the review). */
  compact?: boolean;
}) {
  const settings = useSettings();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {leading}
      <div className="contents" role="group" aria-label={show === 'options' ? 'Engine options' : 'Engine'}>
      {show !== 'options' && (
        <button className={show === 'toggle' && !compact ? topPill(open) : pill(open)} onClick={onToggle} aria-pressed={open}>
          <Icon name="engine" size={14} /> Engine
        </button>
      )}
      {open && show !== 'toggle' && (
        <>
          <button className={option(settings.showEvalBar)} onClick={() => void saveSettings({ showEvalBar: !settings.showEvalBar })} aria-pressed={settings.showEvalBar}>
            {settings.showEvalBar && <Icon name="check" size={12} />} Eval bar
          </button>
          <button
            className={option(settings.showSuggestions)}
            onClick={() => void saveSettings({ showSuggestions: !settings.showSuggestions })}
            aria-pressed={settings.showSuggestions}
          >
            {settings.showSuggestions && <Icon name="check" size={12} />} Suggestions
          </button>
        </>
      )}
      </div>
    </div>
  );
}

/** An on/off pill, as in the engine controls. */
/** The Engine switch on its own in a page's top row: the same size as the filter pill beside it. */
const topPill = (on: boolean) =>
  `inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${on ? 'bg-[var(--text)] text-[var(--bg)]' : 'bg-[var(--panel-2)] hover:brightness-110'}`;

/** A display option: quiet when on (a tick), outlined when off, so it doesn't read as a main button. */
const option = (on: boolean) =>
  `inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold border transition ${
    on ? 'bg-[var(--panel-2)] border-transparent' : 'border-[var(--border)] muted'
  }`;

export const pill = (on: boolean) =>
  `inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold border transition ${
    on ? 'bg-[var(--text)] text-[var(--bg)] border-transparent' : 'bg-[var(--panel-2)] border-[var(--border)] muted'
  }`;
