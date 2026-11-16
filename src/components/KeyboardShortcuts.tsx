import { useEffect } from 'react';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

/** One row of the list: the keys (any of them works) and what they do. */
export type Shortcut = [keys: string[], what: string];
export interface ShortcutGroup {
  title: string;
  rows: Shortcut[];
}

/** Hidden where there is no keyboard to speak of: phones and tablets used by touch alone. */
const KEYBOARD_ONLY = '[@media(hover:none)]:hidden';

/**
 * The list of a page's keyboard shortcuts, in a sheet. While it is open the page's own keys rest
 * (so "n" doesn't move on behind it); Esc or "?" closes it.
 */
export function KeyboardShortcuts({ open, onClose, groups }: { open: boolean; onClose: () => void; groups: ShortcutGroup[] }) {
  useEffect(() => {
    if (!open) return;
    // Before the page's own key handlers, which listen on the window too.
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Tab') return;
      e.stopPropagation();
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [open, onClose]);
  return (
    <Sheet open={open} onClose={onClose} title="Keyboard shortcuts">
      <div className="space-y-4">
        {[...groups, { title: '', rows: [[['?'], 'Show or hide this list']] as Shortcut[] }].map((g, i) => (
          <section key={i}>
            {g.title && <h3 className="muted text-xs font-semibold uppercase tracking-wide mb-1.5">{g.title}</h3>}
            <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3.5 gap-y-2 items-center text-sm">
              {g.rows.map(([keys, what]) => (
                <div key={what} className="contents">
                  <dt className="flex items-center gap-1 justify-end">
                    {keys.map((k) => (
                      <kbd key={k} className="inline-grid place-items-center min-w-7 h-7 px-1.5 rounded-lg bg-[var(--panel-2)] shadow-[0_2px_0_var(--bg)] font-sans font-bold text-xs">
                        {k}
                      </kbd>
                    ))}
                  </dt>
                  <dd className="font-semibold">{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Sheet>
  );
}

/** "?" opens the list (not while typing, or while another sheet is open). */
export function useShortcutsKey(open: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      open();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open]);
}

/** A small round button with a keyboard, beside the page's other tools (not on touch-only screens). */
export function ShortcutsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className={`inline-grid place-items-center w-9 h-9 rounded-full bg-[var(--panel-2)] hover:brightness-110 ${KEYBOARD_ONLY}`}
      onClick={onClick}
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts (?)"
      aria-haspopup="dialog"
    >
      <Icon name="keyboard" size={18} />
    </button>
  );
}

/** For a menu item that only makes sense with a keyboard. */
export const keyboardOnly = KEYBOARD_ONLY;

/** The puzzle's keys (Training.tsx: onKey; the line viewer and the engine board step with the arrows). */
export const PUZZLE_SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Solving',
    rows: [
      [['H'], 'Hint. Press again to show the piece'],
      [['S'], 'Show the solution'],
      [['K'], 'Skip this puzzle'],
      [['Enter', 'N'], 'Next puzzle, once this one is done'],
    ],
  },
  {
    title: 'Lines and the engine',
    rows: [
      [['→'], 'Step through the full line, once the puzzle is done'],
      [['←', '→'], 'Back and forward'],
      [['↑', '↓'], 'To the start and the end'],
      [['Esc'], 'Close the line, or leave the engine'],
    ],
  },
];

/** The review's keys (review/Walkthrough.tsx: onKey). */
export const REVIEW_SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Moving through the game',
    rows: [
      [['←', '→'], 'Back and forward one move'],
      [['↑', '↓'], 'To the start and the end'],
      [['N', 'P'], 'Next and previous key moment'],
      [['F'], 'Flip the board'],
    ],
  },
  {
    title: 'At a mistake',
    rows: [
      [['B'], 'Show the best move. Press again to play its line on'],
      [['Shift+B'], 'Back one move in the best line'],
      [['R'], 'Retry: find a better move yourself'],
      [['Esc'], 'Back to the game'],
    ],
  },
];
