import { opponentElo, opponentName, userElo } from '../lib/games/build';
import { analysisQueue } from '../lib/engine/queue';
import { useQueueStatus } from '../hooks/useStores';
import type { StoredGame } from '../lib/types';
import { ResultPill, TIME_CLASS_ICON, formatDate } from './ui';

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
  const queue = useQueueStatus();
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
          const progress = queue.active[g.id];
          return (
            <tr key={g.id} className="clickable" onClick={() => onOpen(g)}>
              <td className="w-8">
                <ResultPill g={g} />
              </td>
              <td>
                <div className="flex items-center gap-2">
                  <span title={g.timeClass}>{TIME_CLASS_ICON[g.timeClass]}</span>
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
                {g.analysisStatus === 'done' && g.userAccuracy !== undefined ? (
                  <>
                    <span className="font-semibold">{g.userAccuracy.toFixed(1)}</span>
                    <span className="muted"> / {g.opponentAccuracy?.toFixed(1)}</span>
                  </>
                ) : progress !== undefined ? (
                  <div className="w-20 h-1.5 rounded bg-[var(--panel-2)]" title={`Analysing… ${Math.round(progress * 100)}%`}>
                    <div className="h-1.5 rounded bg-accent transition-all" style={{ width: `${progress * 100}%` }} />
                  </div>
                ) : g.analysisStatus === 'error' ? (
                  <span className="muted">failed</span>
                ) : (
                  <button
                    className="text-xs underline muted hover:text-[var(--text)]"
                    onClick={(e) => {
                      e.stopPropagation();
                      analysisQueue.prioritize(g.id);
                    }}
                  >
                    Analyse
                  </button>
                )}
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
