import { opponentElo, opponentName, userElo } from '../lib/games/build';
import { analysisQueue } from '../lib/engine/queue';
import { useQueueProgress } from '../hooks/useStores';
import type { StoredGame } from '../lib/types';
import { ResultPill, TimeClassIcon, formatDate } from './ui';
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
          <th>{header('accuracy', 'Accuracy')}</th>
          {!compact && <th>Moves</th>}
          <th>{header('date', 'Date')}</th>
        </tr>
      </thead>
      <tbody>
        {games.map((g) => {
          return (
            <tr key={g.id} className="clickable" onClick={() => onOpen(g)}>
              <td className="w-8">
                <ResultPill g={g} />
              </td>
              <td>
                <div className="flex items-center gap-2">
                  <TimeClassIcon tc={g.timeClass} />
                  <span
                    className="inline-block w-3 h-3 rounded-sm border border-[var(--border)]"
                    style={{ background: g.userColor === 'b' ? '#f4f4f4' : '#403d39' }}
                    title={g.userColor === 'b' ? 'Opponent had White' : 'Opponent had Black'}
                  />
                  <span className="font-semibold">{g.userColor ? opponentName(g) : `${g.white} – ${g.black}`}</span>
                  {opponentElo(g) && <span className="muted">({opponentElo(g)})</span>}
                </div>
                {compact && g.openingName && <div className="muted text-xs truncate max-w-64">{g.openingName}</div>}
              </td>
              {!compact && <td className="muted max-w-64 truncate">{g.openingName ?? g.eco ?? ''}</td>}
              <td className="tabular-nums whitespace-nowrap">
                <AccuracyCell g={g} />
              </td>
              {!compact && <td className="muted tabular-nums">{Math.ceil(g.plyCount / 2)}</td>}
              <td className="muted whitespace-nowrap">
                {formatDate(g.endTime)}
                {!compact && userElo(g) && <span className="ml-2 text-xs">({userElo(g)})</span>}
              </td>
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
        <span className="font-semibold">{g.userAccuracy.toFixed(1)}</span>
        <span className="muted"> / {g.opponentAccuracy?.toFixed(1)}</span>
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

/** Accuracy as a coloured pill (green = accurate, orange = rough game). */
export function AccuracyPill({ value }: { value: number }) {
  const color = value >= 90 ? '#81b64c' : value >= 80 ? '#96bc4b' : value >= 70 ? '#f7c631' : '#ffa459';
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums text-[#1d1d1b]" style={{ background: color }}>
      {value.toFixed(1)}
    </span>
  );
}

/**
 * Games as tappable cards grouped by day ("Today", "Yesterday", …). Used on phones and for short
 * lists; each card subscribes only to its own analysis progress.
 */
export function GameCardList({ games, onOpen, grouped = true }: { games: StoredGame[]; onOpen: (g: StoredGame) => void; grouped?: boolean }) {
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
          {grouped && <div className="muted text-xs font-bold uppercase tracking-wide px-1 mb-1.5">{grp.day}</div>}
          <ul className="panel divide-y divide-[var(--border)] overflow-hidden">
            {grp.games.map((g) => (
              <li key={g.id}>
                <button className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--panel-2)]" onClick={() => onOpen(g)} data-game-id={g.id}>
                  <ResultPill g={g} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold truncate">{g.userColor ? opponentName(g) : `${g.white} – ${g.black}`}</span>
                      {opponentElo(g) && <span className="muted text-xs shrink-0 tabular-nums">({opponentElo(g)})</span>}
                    </div>
                    <div className="muted text-xs truncate flex items-center gap-1 mt-0.5">
                      <TimeClassIcon tc={g.timeClass} size={12} />
                      <span className="truncate">{g.openingName ?? g.eco ?? `${Math.ceil(g.plyCount / 2)} moves`}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <CardStatus g={g} />
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
