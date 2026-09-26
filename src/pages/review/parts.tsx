import { memo, useEffect, useRef, type ReactNode } from 'react';
import { CLASS_META, CLASS_ORDER } from '../../lib/classificationMeta';
import { formatClock, formatDuration, type ParsedGame } from '../../lib/pgn/parse';
import type { Color, GameAnalysis, MoveAnalysis, StoredGame } from '../../lib/types';
import { ClassificationBadge } from '../../components/ClassificationBadge';

export const KEY_CLASSES = ['blunder', 'mistake', 'miss', 'brilliant', 'great'];
export const ERROR_CLASSES = ['blunder', 'mistake', 'miss'];

export const moveLabel = (m: { moveNumber: number; color: Color; san: string }) => `${m.moveNumber}${m.color === 'w' ? '.' : '...'} ${m.san}`;

export function article(word: string) {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

export function lastClock(plies: { color: Color; clock?: number }[], ply: number, color: Color) {
  for (let i = ply - 1; i >= 0; i--) if (plies[i].color === color && plies[i].clock !== undefined) return plies[i].clock;
  return undefined;
}

export function PlayerStrip({ name, elo, clock, isUser, active }: { name: string; elo?: number; clock?: number; isUser?: boolean; active?: boolean }) {
  return (
    <div className="flex justify-between items-center text-sm px-1 h-7">
      <span className="font-semibold truncate">
        {name} {elo && <span className="muted font-normal">({elo})</span>}
        {isUser && <span className="chip ml-1 !text-[10px] !py-0">you</span>}
      </span>
      {clock !== undefined && (
        <span
          className={`tabular-nums font-mono text-xs px-2 py-0.5 rounded ${active ? 'bg-[var(--text)] text-[var(--bg)]' : 'bg-[var(--panel-2)]'}`}
        >
          {formatClock(clock)}
        </span>
      )}
    </div>
  );
}

/** The coach's speech bubble (chess.com style): avatar on the left, message on the right. */
export function CoachBubble({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'bad' }) {
  const border = tone === 'good' ? '#81b64c' : tone === 'bad' ? '#e02828' : 'var(--border)';
  return (
    <div className="flex gap-2 items-start">
      <span className="shrink-0 w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center text-xl shadow" aria-hidden="true">
        ♞
      </span>
      <div className="relative flex-1 min-w-0 panel p-3 text-sm" style={{ borderColor: border }}>
        <span
          className="absolute -left-1.5 top-3 w-3 h-3 rotate-45 bg-[var(--panel)] border-l border-b"
          style={{ borderColor: border }}
          aria-hidden="true"
        />
        {children}
      </div>
    </div>
  );
}

/** Horizontal, swipeable move list for phones. Keeps the current move in view. */
export const MoveStrip = memo(function MoveStrip({
  parsed,
  moves,
  ply,
  onSelect,
}: {
  parsed: ParsedGame;
  moves?: MoveAnalysis[];
  ply: number;
  onSelect: (p: number) => void;
}) {
  const current = useRef<HTMLButtonElement>(null);
  const first = useRef(true);
  useEffect(() => {
    // Jump straight there when the page opens; glide when stepping through moves.
    current.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: first.current ? 'auto' : 'smooth' });
    first.current = false;
  }, [ply]);
  return (
    <div className="flex gap-1 overflow-x-auto no-scrollbar py-1 -mx-1 px-1" role="list" aria-label="Moves">
      <button
        ref={ply === 0 ? current : undefined}
        onClick={() => onSelect(0)}
        className={`shrink-0 rounded-md px-2 py-1.5 text-xs ${ply === 0 ? 'bg-[var(--text)] text-[var(--bg)] font-bold' : 'bg-[var(--panel-2)]'}`}
      >
        Start
      </button>
      {parsed.plies.map((p, i) => {
        const m = moves?.[i];
        const active = ply === i + 1;
        return (
          <button
            key={i}
            role="listitem"
            ref={active ? current : undefined}
            onClick={() => onSelect(i + 1)}
            className={`shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${active ? 'bg-[var(--text)] text-[var(--bg)] font-bold' : 'hover:bg-[var(--panel-2)]'}`}
          >
            {p.color === 'w' && <span className={active ? '' : 'muted'}>{p.moveNumber}.</span>}
            {m && KEY_CLASSES.includes(m.classification) && <ClassificationBadge c={m.classification} size={14} />}
            {p.san}
          </button>
        );
      })}
    </div>
  );
});

/** Two-column move list for larger screens. */
export const MoveList = memo(function MoveList({
  parsed,
  moves,
  ply,
  onSelect,
}: {
  parsed: ParsedGame;
  moves?: MoveAnalysis[];
  ply: number;
  onSelect: (p: number) => void;
}) {
  const rows: { num: number; w?: number; b?: number }[] = [];
  parsed.plies.forEach((p, i) => {
    if (p.color === 'w' || !rows.length) rows.push({ num: p.moveNumber });
    rows[rows.length - 1][p.color] = i;
  });
  const cell = (i?: number) => {
    if (i === undefined) return <td />;
    const p = parsed.plies[i];
    const m = moves?.[i];
    return (
      <td>
        <button
          className={`w-full flex items-center gap-1.5 rounded px-1.5 py-1 text-left ${ply === i + 1 ? 'bg-[var(--panel-2)] font-bold' : 'hover:bg-[var(--panel-2)]'}`}
          onClick={() => onSelect(i + 1)}
          ref={(el) => {
            if (el && ply === i + 1) el.scrollIntoView({ block: 'nearest' });
          }}
        >
          {m && <ClassificationBadge c={m.classification} size={14} />}
          <span>{p.san}</span>
          {p.timeSpent !== undefined && <span className="ml-auto muted text-[10px] tabular-nums">{formatDuration(p.timeSpent)}</span>}
        </button>
      </td>
    );
  };
  return (
    <div className="max-h-[420px] overflow-y-auto">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.num}>
              <td className="muted w-8 text-right pr-1 tabular-nums">{r.num}.</td>
              {cell(r.w)}
              {cell(r.b)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

/** Counts of each move classification for both players. */
export function ClassificationTable({ analysis, game }: { analysis: GameAnalysis; game: StoredGame }) {
  const counts = (c: Color) => {
    const m = new Map<string, number>();
    for (const mv of analysis.moves) if (mv.color === c) m.set(mv.classification, (m.get(mv.classification) ?? 0) + 1);
    return m;
  };
  const w = counts('w');
  const b = counts('b');
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="muted text-xs">
          <th className="text-left font-normal pb-1"></th>
          <th className="font-normal pb-1 truncate max-w-20">{game.white}</th>
          <th className="font-normal pb-1 truncate max-w-20">{game.black}</th>
        </tr>
      </thead>
      <tbody>
        {CLASS_ORDER.map((c) => (
          <tr key={c}>
            <td className="py-0.5">
              <span className="inline-flex items-center gap-2">
                <ClassificationBadge c={c} size={16} /> {CLASS_META[c].label}
              </span>
            </td>
            <td className="text-center tabular-nums font-semibold" style={{ color: w.get(c) ? CLASS_META[c].color : undefined }}>
              {w.get(c) ?? 0}
            </td>
            <td className="text-center tabular-nums font-semibold" style={{ color: b.get(c) ? CLASS_META[c].color : undefined }}>
              {b.get(c) ?? 0}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The review's main controls. Fixed to the bottom of the screen on phones (thumb reach, like
 * chess.com); an ordinary row in the side panel on larger screens.
 */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed lg:static bottom-0 inset-x-0 md:left-56 z-40 lg:z-auto bg-[var(--panel)]/95 lg:bg-transparent backdrop-blur lg:backdrop-blur-none border-t lg:border-0 border-[var(--border)] safe-bottom">
      <div className="flex items-stretch gap-1 p-2 lg:p-0 max-w-xl mx-auto lg:max-w-none">{children}</div>
    </div>
  );
}

export function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  primary,
  title,
}: {
  icon: ReactNode;
  label?: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label ?? title}
      className={`flex-1 min-h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition disabled:opacity-35 ${
        primary ? 'bg-accent text-white' : 'bg-[var(--panel-2)] hover:brightness-110'
      }`}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}
