import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

/**
 * A bottom sheet on phones and a centred dialog on larger screens. Closes on backdrop tap,
 * the close button or Escape. Rendered into <body> through a portal: a blurred sticky header
 * would otherwise become the containing block and clip the fixed-position sheet.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/50 animate-[fade_.15s_ease-out]" onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        className="relative w-full md:max-w-md max-h-[85vh] overflow-y-auto panel !rounded-b-none md:!rounded-xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] outline-none animate-[sheet_.2s_ease-out]"
      >
        <div className="md:hidden mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)]" />
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-lg">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
