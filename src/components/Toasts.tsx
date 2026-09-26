import { useEffect, useState } from 'react';
import { dismissToast, subscribeToasts, type Toast } from '../lib/toast';

const ICON = { info: 'ℹ', success: '✔', error: '⚠' };
const COLOR = { info: 'var(--series-1)', success: '#81b64c', error: '#e02828' };

export function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(setList), []);
  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-50 flex flex-col gap-2 items-end pointer-events-none" aria-live="polite">
      {list.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className="panel pointer-events-auto shadow-lg px-4 py-3 text-sm flex items-center gap-3 max-w-sm w-full sm:w-auto"
          style={{ borderLeft: `4px solid ${COLOR[t.kind]}` }}
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
          <button className="muted" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
