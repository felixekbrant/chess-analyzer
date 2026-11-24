import { useEffect, useState, type ReactNode } from 'react';
import { ActionBar } from '../pages/review/parts';

/**
 * The one board screen: a game review, a puzzle and "Play from here" all use it, so the board has
 * the same size and place, the player bars sit above and below it, the coach speaks under it (beside
 * it on a laptop), and the buttons are always in the same spot: fixed at the bottom on a phone, at
 * the top of the side column on a laptop.
 */
export function BoardScreen({ stage, coach, actions, children }: { stage: ReactNode; coach?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    // One grid: a single column on a phone (board, coach, the rest); on a laptop the board fills the
    // left column and the buttons, the coach and the rest stack on the right.
    // overflow-anchor: none, or the browser keeps a tapped button in place when something opens above
    // it, scrolling the board away.
    <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_auto_1fr] gap-x-5 gap-y-2 lg:gap-y-3 max-w-[1300px] mx-auto items-start [overflow-anchor:none]">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:row-span-3">{stage}</div>
      {coach && <div className="min-w-0 lg:col-start-2 lg:row-start-2">{coach}</div>}
      <div className="min-w-0 space-y-2 lg:space-y-3 lg:col-start-2 lg:row-start-3">{children}</div>
      {/* Fixed to the bottom on a phone (so its place in the page doesn't matter there). */}
      {actions && (
        <div className="lg:col-start-2 lg:row-start-1">
          <ActionBar>{actions}</ActionBar>
        </div>
      )}
    </div>
  );
}

/**
 * The board with its player bars and the eval bar beside it. The size rule is shared: the board runs
 * edge to edge on a phone, gives up some size on a short screen so the coach stays above the buttons,
 * and fills the window's height on a laptop. On a laptop the eval bar's column is kept even when
 * there is no bar, so the board doesn't move when the engine opens.
 */
export function BoardStage({ evalBar, top, bottom, children, id }: { evalBar?: ReactNode; top?: ReactNode; bottom?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <div className="-mx-2.5 lg:mx-0 flex justify-center lg:justify-start" id={id}>
      <div className="flex gap-2 px-1 lg:px-0 w-full max-w-[min(720px,max(270px,calc(100svh-340px)))] lg:max-w-[min(720px,calc(100svh-140px))]">
        {evalBar || <div className="hidden lg:block w-7 shrink-0" aria-hidden="true" />}
        <div className="flex-1 min-w-0">
          {top}
          {children}
          {bottom}
        </div>
      </div>
    </div>
  );
}

/** True while a media query matches (e.g. the tablet and laptop layouts). */
export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const m = matchMedia(query);
    const change = () => setOn(m.matches);
    change();
    m.addEventListener('change', change);
    return () => m.removeEventListener('change', change);
  }, [query]);
  return on;
}

/** Where the phone's top bar ends: from here on the board screens show their own header row. */
export const HEADER_QUERY = '(min-width: 768px)';

/**
 * The board screen's header on a tablet or laptop (phones have the app's top bar): one line with
 * where you are, and the screen's tools (the Engine switch) on the right, so the board starts at the
 * same height on every board screen.
 */
export function BoardHeader({ children, tools }: { children: ReactNode; tools?: ReactNode }) {
  return (
    <div className="hidden md:flex items-center gap-3 mb-4 h-9 text-sm min-w-0 max-w-[1300px] mx-auto">
      {children}
      <div id="board-header-tools" className="ml-auto flex items-center gap-2 shrink-0">
        {tools}
      </div>
    </div>
  );
}
