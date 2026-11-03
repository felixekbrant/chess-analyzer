import { saveSettings } from '../db/schema';
import { useSettings } from '../hooks/useStores';
import { Icon } from './Icon';

/**
 * The same engine controls on every review and puzzle: open the engine to play any moves with live
 * analysis. Its display options (eval bar, suggested moves) only appear while it is open, since
 * that's the only time they do anything; the choice is remembered across the app.
 */
export function EngineControls({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const settings = useSettings();
  const pill = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition ${
      on ? 'bg-primary text-white border-transparent' : 'bg-[var(--panel-2)] border-[var(--border)] muted'
    }`;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Engine">
      <button className={pill(open)} onClick={onToggle} aria-pressed={open}>
        <Icon name="engine" size={14} /> Engine
      </button>
      {open && (
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
  );
}
