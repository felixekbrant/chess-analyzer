import { useEffect, useState } from 'react';
import { dismissToast, subscribeToasts, type Toast } from '../lib/toast';

const ICON = { info: 'ℹ', success: '✔', error: '⚠' };
const COLOR = { info: 'var(--info-ink)', success: 'var(--felt-ink)', error: 'var(--loss-ink)' };

export function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(setList), []);
  return (
    // Phones: over the top bar, so it covers only the page title for a moment, not the page (titles,
    // search, the Today card) or the buttons at the bottom. Desktop: bottom right.
    <div className="fixed top-[calc(0.375rem+env(safe-area-inset-top))] md:top-auto md:bottom-4 right-3 left-3 md:left-auto z-50 flex flex-col gap-2 items-center md:items-end pointer-events-none" aria-live="polite">
      {list.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className="rise pointer-events-auto rounded-full shadow-[var(--lift)] px-4 py-2 text-sm font-semibold flex items-center gap-2.5 max-w-sm bg-[var(--overlay)] text-[var(--text)]"
        >
          <span style={{ color: COLOR[t.kind] }}>{ICON[t.kind]}</span>
          <span className="flex-1">{t.message}</span>
          {t.action && (
            <button
              className="font-semibold underline"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="muted -my-1.5 -mr-2 w-8 h-8 grid place-items-center rounded-full hover:bg-[var(--panel-2)]" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
