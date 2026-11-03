import { MiniBoard } from './MiniBoard';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import type { StoredGame } from '../lib/types';

/** Page title row. On phones the top bar shows the title; `desktopOnly` hides the whole row there. */
export function PageHeader({
  title,
  subtitle,
  actions,
  desktopOnly,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  desktopOnly?: boolean;
}) {
  return (
    <div className={`${desktopOnly ? 'hidden md:flex' : 'flex'} flex-wrap items-end justify-between gap-3 mb-3 md:mb-5`}>
      <div>
        <h1 className="hidden md:block text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="muted text-sm md:mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 min-w-0 max-w-full">{actions}</div>}
    </div>
  );
}

export function Section({
  title,
  children,
  right,
  className = '',
  id,
}: {
  title?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`panel p-4 scroll-mt-16 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-2 mb-3">
          {title && <h2 className="font-extrabold text-[17px] tracking-tight">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="muted text-xs font-semibold uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-extrabold mt-1 tabular-nums">{value}</div>
      {sub && <div className="muted text-xs mt-1">{sub}</div>}
    </div>
  );
}

export function ResultPill({ g }: { g: StoredGame }) {
  const r = g.userResult;
  const style =
    r === 'win'
      ? { background: 'var(--win)', color: 'white' }
      : r === 'loss'
        ? { background: 'var(--loss)', color: 'white' }
        : { background: 'var(--draw)', color: 'white' };
  // chess.com style: a small square with +, − or =.
  return (
    <span
      className="inline-flex w-[22px] h-[22px] rounded items-center justify-center text-base leading-none font-black shrink-0"
      style={style}
      title={g.termination}
      aria-label={r === 'win' ? 'Won' : r === 'loss' ? 'Lost' : r === 'draw' ? 'Draw' : 'Unknown result'}
    >
      {r === 'win' ? '+' : r === 'loss' ? '−' : r === 'draw' ? '=' : '?'}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="muted text-sm py-6 text-center">{children}</div>;
}

export function NeedsUsername() {
  return (
    <div className="panel p-6 text-center">
      <p className="mb-3">Set your chess.com username to get started.</p>
      <Link to="/settings" className="btn btn-primary">
        Open settings
      </Link>
    </div>
  );
}

export function formatDate(t: number) {
  return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtPct(v: number | undefined, digits = 0) {
  return v === undefined || Number.isNaN(v) ? '–' : `${v.toFixed(digits)}%`;
}

export function TimeClassIcon({ tc, size = 16 }: { tc: string; size?: number }) {
  const name = tc === 'bullet' || tc === 'blitz' || tc === 'rapid' || tc === 'daily' ? tc : 'rapid';
  return (
    <span title={tc} className="inline-flex muted">
      <Icon name={name} size={size} />
    </span>
  );
}

/** Real positions for empty states: an empty screen still shows a board, never just a sentence. */
export const EMPTY_FENS = {
  start: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  /** Légal's mate, the classic "trap that works". */
  mate: 'rn1q1bnr/ppp1kB1p/3p2p1/3NN3/4P3/8/PPPP1PPP/R1BbK2R b KQ - 2 7',
  /** King and pawn against king: the first endgame everyone learns. */
  endgame: '8/8/8/4k3/8/8/4PK2/8 w - - 0 1',
};

/** An empty screen with intent: a small board, one line, and the one thing to do next. */
export function EmptyState({ fen = EMPTY_FENS.start, title, children }: { fen?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-8 px-4">
      <div className="w-28 opacity-90">
        <MiniBoard fen={fen} />
      </div>
      <div className="font-extrabold text-lg">{title}</div>
      {children && <div className="muted text-sm max-w-xs flex flex-col items-center gap-3">{children}</div>}
    </div>
  );
}

/** Placeholder while a page loads: shaped like what's coming (a board, rows), never the word "Loading". */
export function LoadingShape({ kind = 'rows' }: { kind?: 'rows' | 'board' }) {
  return (
    <div className="space-y-3 max-w-3xl" aria-busy="true" aria-label="Loading">
      {kind === 'board' ? (
        <div className="skeleton aspect-square w-full max-w-[560px] rounded-lg" />
      ) : (
        <>
          <div className="skeleton h-6 w-40" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-14 w-full rounded-xl" />
          ))}
        </>
      )}
    </div>
  );
}

/** The one sentence a tab opens with, in large type: the conclusion before the detail. */
export function Headline({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="px-1 py-1">
      <p className="text-xl md:text-2xl font-black leading-snug tracking-tight text-balance">{children}</p>
      {sub && <p className="muted text-sm font-semibold mt-1">{sub}</p>}
    </div>
  );
}
