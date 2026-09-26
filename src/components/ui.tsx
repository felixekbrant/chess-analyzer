import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import type { StoredGame } from '../lib/types';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        {/* On phones the top bar already shows the page title. */}
        <h1 className="hidden md:block text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="muted text-sm mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
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
          {title && <h2 className="font-bold">{title}</h2>}
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
      ? { background: '#81b64c', color: 'white' }
      : r === 'loss'
        ? { background: '#e02828', color: 'white' }
        : { background: 'var(--panel-2)', color: 'var(--text)' };
  return (
    <span className="inline-flex w-6 h-6 rounded-md items-center justify-center text-xs font-bold" style={style} title={g.termination}>
      {r === 'win' ? 'W' : r === 'loss' ? 'L' : r === 'draw' ? '½' : '?'}
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
