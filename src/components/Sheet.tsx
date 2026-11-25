import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { MOTION, projectFlick, reducedMotion, rubberBand } from '../lib/motion';

/**
 * A bottom sheet on phones and a centred dialog on larger screens. Closes on backdrop tap,
 * the close button or Escape, and on a phone by dragging it down by its top. Rendered into <body>
 * through a portal: a blurred sticky header would otherwise become the containing block and clip the
 * fixed-position sheet.
 *
 * It leaves the way it came (down and out), and while dragged it stays under the finger: it can be
 * caught and pushed back up, it resists being pulled above its place, and a quick flick closes it.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  // Kept on screen for a moment after `open` turns false, so it can slide out.
  const [shown, setShown] = useState(open);
  const [leaving, setLeaving] = useState(false);
  // Closed by a drag: it is already on its way out, so no second animation.
  const draggedOut = useRef(false);

  useEffect(() => {
    if (open) {
      setShown(true);
      setLeaving(false);
      draggedOut.current = false;
      // Opened again while sliding out: back to its place.
      for (const el of [panel.current, backdrop.current]) el?.removeAttribute('style');
      return;
    }
    if (!shown) return;
    setLeaving(true);
    const t = setTimeout(() => {
      setShown(false);
      setLeaving(false);
      draggedOut.current = false;
    }, reducedMotion() ? 0 : MOTION.move);
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    // Going to another page (a link inside, or Back) closes the sheet.
    window.addEventListener('hashchange', onClose);
    panel.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', onClose);
    };
  }, [open, onClose]);

  const drag = useDragToClose(panel, backdrop, () => {
    draggedOut.current = true;
    onClose();
  });

  if (!shown) return null;
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-end md:items-center justify-center ${leaving ? 'pointer-events-none' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-hidden={leaving || undefined}
    >
      <div
        ref={backdrop}
        className={`absolute inset-0 bg-black/50 ${leaving ? 'sheet-fade-out' : 'animate-[fade_var(--t-quick)_var(--ease-out)]'}`}
        onClick={onClose}
      />
      <div
        ref={panel}
        tabIndex={-1}
        className={`relative w-full md:max-w-md max-h-[85vh] overflow-y-auto overscroll-contain bg-[var(--overlay)] shadow-[var(--lift)] rounded-t-[20px] md:rounded-[20px] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] outline-none ${
          leaving ? (draggedOut.current ? '' : 'sheet-out') : 'animate-[sheet_var(--t-move)_var(--ease-out)]'
        }`}
      >
        {/* The grab area: the handle and the title row. */}
        <div {...drag} className="touch-none md:touch-auto -mx-4 -mt-4 px-4 pt-4 md:cursor-auto cursor-grab">
          <div className="md:hidden mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--muted)]/40" />
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg">{title}</h2>
            <button className="icon-btn" onClick={onClose} onPointerDown={(e) => e.stopPropagation()} aria-label="Close">
              <Icon name="close" />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Should a sheet dragged down by `offset` px and let go at `velocity` px/ms close? */
export function closesOnRelease(offset: number, velocity: number, height: number): boolean {
  return offset + projectFlick(velocity) > height / 2 && velocity > -0.1;
}

/** Drag the sheet down by its top on a phone: it follows the finger, and closes or settles back. */
function useDragToClose(panel: React.RefObject<HTMLDivElement | null>, backdrop: React.RefObject<HTMLDivElement | null>, close: () => void) {
  const state = useRef<{ id: number; from: number; samples: { y: number; t: number }[] } | null>(null);

  const offsetNow = () => {
    const el = panel.current;
    if (!el) return 0;
    // From where it is on screen right now, so a sheet still settling can be caught mid-way.
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform);
    return m.m42;
  };
  const place = (y: number, animate: boolean) => {
    const el = panel.current;
    if (!el) return;
    const h = el.offsetHeight || 1;
    const ms = animate && !reducedMotion() ? MOTION.move : 0;
    el.style.animation = 'none';
    el.style.transition = ms ? `transform ${ms}ms var(--ease-out)` : 'none';
    el.style.transform = y ? `translateY(${y}px)` : '';
    if (backdrop.current) {
      backdrop.current.style.transition = ms ? `opacity ${ms}ms var(--ease-out)` : 'none';
      backdrop.current.style.opacity = String(Math.max(0, Math.min(1, 1 - y / h)));
    }
  };

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (matchMedia('(min-width: 768px)').matches || e.button !== 0) return;
      const current = offsetNow();
      state.current = { id: e.pointerId, from: e.clientY - current, samples: [{ y: e.clientY, t: e.timeStamp }] };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      place(current, false);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = state.current;
      if (!s || s.id !== e.pointerId) return;
      const dy = e.clientY - s.from;
      const h = panel.current?.offsetHeight || 1;
      place(dy >= 0 ? dy : rubberBand(dy, h), false);
      s.samples.push({ y: e.clientY, t: e.timeStamp });
      if (s.samples.length > 6) s.samples.shift();
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s = state.current;
      if (!s || s.id !== e.pointerId) return;
      state.current = null;
      const h = panel.current?.offsetHeight || 1;
      const dy = Math.max(0, e.clientY - s.from);
      // The speed over the last few samples (about the last 50 ms).
      const first = s.samples.find((x) => e.timeStamp - x.t < 80) ?? s.samples[0];
      const dt = e.timeStamp - first.t;
      const v = dt > 0 ? (e.clientY - first.y) / dt : 0;
      if (closesOnRelease(dy, v, h)) {
        place(h + 24, true);
        close();
      } else place(0, true);
    },
    onPointerCancel: () => {
      state.current = null;
      place(0, true);
    },
  };
}
