import { formatPeak, isThrown } from '../lib/games/thrown';
import { opponentElo, opponentName, userElo } from '../lib/games/build';
import { analysisQueue } from '../lib/engine/queue';
import { useQueueProgress } from '../hooks/useStores';
import type { StoredGame } from '../lib/types';
import { TimeClassIcon, formatDate } from './ui';
import { relativeDay } from '../lib/format';

export type SortKey = 'date' | 'accuracy';

export function GameTable({
  games,
  onOpen,
  compact,
  sort,
  onSort,
}: {
  games: StoredGame[];
  onOpen: (g: StoredGame) => void;
  compact?: boolean;
  sort?: SortKey;
  onSort?: (k: SortKey) => void;
}) {
  const header = (k: SortKey, label: string) =>
    onSort ? (
      <button className={`font-semibold ${sort === k ? 'text-[var(--text)]' : ''}`} onClick={() => onSort(k)} aria-pressed={sort === k}>
        {label} {sort === k ? '↓' : ''}
      </button>
    ) : (
      label
    );
  return (
    <table className="data">
      <thead>
        <tr>
          <th></th>
          <th>Opponent</th>
          {!compact && <th>Opening</th>}
          <th title="Your accuracy, and your opponent's">{header('accuracy', 'Accuracy')}</th>
          {!compact && <th>Moves</th>}
          {!compact && <th>You</th>}
          <th>{header('date', 'Date')}</th>
        </tr>
      </thead>
      <tbody>
        {games.map((g) => {
          return (
            <tr key={g.id} className="clickable" onClick={() => onOpen(g)}>
              <td className="w-16">
                <span className="inline-flex items-center gap-2 text-xs font-extrabold" style={{ color: resultInk(g) }}>
                  <span className="w-[3px] h-5 rounded" style={{ background: resultColor(g) }} aria-hidden="true" />
                  {resultWord(g)}
                </span>
              </td>
              <td>
                <div className="flex items-center gap-2">
                  <TimeClassIcon tc={g.timeClass} />
                  <span className="font-semibold">{g.userColor ? opponentName(g) : `${g.white} – ${g.black}`}</span>
                  {opponentElo(g) && <span className="muted">({opponentElo(g)})</span>}
                  <ThrownMark g={g} />
                </div>
                {compact && g.openingName && <div className="muted text-xs truncate max-w-64">{g.openingName}</div>}
              </td>
              {!compact && <td className="muted max-w-64 truncate">{g.openingName ?? g.eco ?? ''}</td>}
              <td className="tabular-nums whitespace-nowrap">
                <AccuracyCell g={g} />
              </td>
              {!compact && <td className="muted tabular-nums">{Math.ceil(g.plyCount / 2)}</td>}
              {!compact && (
                <td className="muted tabular-nums whitespace-nowrap" title="Your rating in this game">
                  {userElo(g) ?? ''}
                </td>
              )}
              <td className="muted whitespace-nowrap">{formatDate(g.endTime)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Accuracy, or live analysis progress. Subscribes only to this game's progress. */
function AccuracyCell({ g }: { g: StoredGame }) {
  const progress = useQueueProgress(g.id);
  if (g.analysisStatus === 'done' && g.userAccuracy !== undefined)
    return (
      <>
        <AccuracyPill value={g.userAccuracy} />
        <span className="muted text-xs ml-1.5" title="Opponent's accuracy">
          vs {g.opponentAccuracy?.toFixed(1)}
        </span>
      </>
    );
  if (progress !== undefined)
    return (
      <div className="w-20 h-1.5 rounded bg-[var(--panel-2)]" title={`Analysing… ${Math.round(progress * 100)}%`}>
        <div className="h-1.5 rounded bg-accent transition-all" style={{ width: `${progress * 100}%` }} />
      </div>
    );
  if (g.analysisStatus === 'error') return <span className="muted">failed</span>;
  return (
    <button
      className="text-xs underline muted hover:text-[var(--text)]"
      onClick={(e) => {
        e.stopPropagation();
        analysisQueue.prioritize(g.id);
      }}
    >
      Analyse
    </button>
  );
}

/** On games lost after being +3 or better: how far ahead you were. */
export function ThrownMark({ g }: { g: StoredGame }) {
  if (!isThrown(g)) return null;
  return (
    <span className="chip !text-[10px] !py-0 shrink-0 whitespace-nowrap" style={{ color: 'var(--attention-ink)' }} title="Lost after being clearly winning">
      was {formatPeak(g.peakEval!)}
    </span>
  );
}

/** Accuracy as a coloured pill (green = accurate, orange = rough game). */
export function AccuracyPill({ value }: { value: number }) {
  const color = value >= 90 ? '#81b64c' : value >= 80 ? '#96bc4b' : value >= 70 ? '#f7c631' : '#ffa459';
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums text-[#1d1d1b]" style={{ background: color }}>
      {value.toFixed(1)}
    </span>
  );
}

const resultWord = (g: StoredGame) => (g.userResult === 'win' ? 'Won' : g.userResult === 'loss' ? 'Lost' : g.userResult === 'draw' ? 'Draw' : '–');
const resultColor = (g: StoredGame) => (g.userResult === 'win' ? 'var(--win)' : g.userResult === 'loss' ? 'var(--loss)' : 'var(--draw)');
const resultInk = (g: StoredGame) => (g.userResult === 'win' ? 'var(--felt-ink)' : g.userResult === 'loss' ? 'var(--loss-ink)' : 'var(--muted)');

/** "October 2026 · 15W 0D 14L · 74% accuracy" above each month of games. */
function MonthHeader({ label, games }: { label: string; games: StoredGame[] }) {
  const w = games.filter((g) => g.userResult === 'win').length;
  const d = games.filter((g) => g.userResult === 'draw').length;
  const l = games.filter((g) => g.userResult === 'loss').length;
  const acc = games.filter((g) => g.userAccuracy !== undefined);
  const avg = acc.length ? acc.reduce((s, g) => s + g.userAccuracy!, 0) / acc.length : undefined;
  return (
    <div className="flex items-baseline justify-between gap-2 px-1 mb-1.5">
      <span className="text-xs font-extrabold uppercase tracking-wider">{label}</span>
      <span className="muted text-xs font-semibold tabular-nums">
        {w}W {d}D {l}L{avg !== undefined ? ` · ${avg.toFixed(0)}% accuracy` : ''}
      </span>
    </div>
  );
}

/**
 * Games as tappable cards grouped by day ("Today", "Yesterday", …). Used on phones and for short
 * lists; each card subscribes only to its own analysis progress.
 */
export function GameCardList({
  games,
  onOpen,
  grouped = true,
  flush = false,
}: {
  games: StoredGame[];
  onOpen: (g: StoredGame) => void;
  grouped?: boolean;
  /** Inside another card: no card of its own. */
  flush?: boolean;
}) {
  const groups: { day: string; games: StoredGame[] }[] = [];
  for (const g of games) {
    // One continuous list per month (like chess.com's archive); each row carries its own date.
    const day = grouped ? new Date(g.endTime).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '';
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.games.push(g);
    else groups.push({ day, games: [g] });
  }
  return (
    <div className="space-y-3">
      {groups.map((grp) => (
        <div key={grp.day + grp.games[0].id}>
          {grouped && <MonthHeader label={grp.day} games={grp.games} />}
          <ul className={`${flush ? '' : 'panel'} divide-y divide-[var(--border)] overflow-hidden`}>
            {grp.games.map((g) => (
              <li key={g.id}>
                <button
                  className="relative w-full flex items-center gap-3 pl-4 pr-3 py-2.5 text-left hover:bg-[var(--panel-2)]"
                  onClick={() => onOpen(g)}
                  data-game-id={g.id}
                >
                  {/* The result as a thin stripe and a word; your accuracy leads the row. */}
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r" style={{ background: resultColor(g) }} aria-hidden="true" />
                  <span className="w-12 shrink-0 flex justify-center">
                    <CardStatus g={g} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold truncate">{g.userColor ? opponentName(g) : `${g.white} – ${g.black}`}</span>
                      {opponentElo(g) && <span className="muted text-xs shrink-0 tabular-nums">({opponentElo(g)})</span>}
                      <ThrownMark g={g} />
                    </div>
                    <div className="muted text-xs truncate flex items-center gap-1 mt-0.5">
                      <TimeClassIcon tc={g.timeClass} size={12} />
                      <span className="truncate">{g.openingName ?? g.eco ?? `${Math.ceil(g.plyCount / 2)} moves`}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0 text-right">
                    <span className="text-xs font-extrabold" style={{ color: resultInk(g) }}>
                      {resultWord(g)}
                    </span>
                    <span className="muted text-[11px] font-semibold">{relativeDay(g.endTime)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function CardStatus({ g }: { g: StoredGame }) {
  const progress = useQueueProgress(g.id);
  if (g.analysisStatus === 'done' && g.userAccuracy !== undefined) return <AccuracyPill value={g.userAccuracy} />;
  if (progress !== undefined)
    return (
      <div className="w-12 h-1.5 rounded bg-[var(--panel-2)]" title={`Analysing… ${Math.round(progress * 100)}%`}>
        <div className="h-1.5 rounded bg-accent transition-all" style={{ width: `${progress * 100}%` }} />
      </div>
    );
  if (g.analysisStatus === 'error') return <span className="muted text-xs">failed</span>;
  return <span className="muted text-xs">queued</span>;
}
