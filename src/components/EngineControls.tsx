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
}: {
  open: boolean;
  onToggle: () => void;
  leading?: ReactNode;
  /** Only the Engine switch, or only its display options (puzzles show them in different places). */
  show?: 'all' | 'toggle' | 'options';
}) {
  const settings = useSettings();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {leading}
      <div className="contents" role="group" aria-label={show === 'options' ? 'Engine options' : 'Engine'}>
      {show !== 'options' && (
        <button className={show === 'toggle' ? topPill(open) : pill(open)} onClick={onToggle} aria-pressed={open}>
          <Icon name="engine" size={14} /> Engine
        </button>
      )}
      {open && show !== 'toggle' && (
        <>
          <button className={pill(settings.showEvalBar)} onClick={() => void saveSettings({ showEvalBar: !settings.showEvalBar })} aria-pressed={settings.showEvalBar}>
            Eval bar
          </button>
          <button
            className={pill(settings.showSuggestions)}
            onClick={() => void saveSettings({ showSuggestions: !settings.showSuggestions })}
            aria-pressed={settings.showSuggestions}
          >
            Suggestions
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
  `inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${on ? 'bg-primary text-white' : 'bg-[var(--panel-2)] hover:brightness-110'}`;

export const pill = (on: boolean) =>
  `inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold border transition ${
    on ? 'bg-primary text-white border-transparent' : 'bg-[var(--panel-2)] border-[var(--border)] muted'
  }`;
