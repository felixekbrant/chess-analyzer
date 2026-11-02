import type { Classification } from '../lib/types';
import { ClassificationBadge } from './ClassificationBadge';
import { Icon } from './Icon';

/**
 * Quick moves for the open engine, the same in reviews and puzzles: replay the move from the game,
 * the engine's best move, or go back to the starting position.
 */
export function EngineShortcuts({
  played,
  bestUci,
  atStart,
  onPlay,
}: {
  /** The move made in the game from this position. */
  played?: { uci: string; san: string; classification?: Classification; mine: boolean };
  bestUci?: string;
  atStart: boolean;
  onPlay: (moves: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {played && (
        <button className="btn !py-1.5 !text-sm" onClick={() => onPlay([played.uci])}>
          {played.classification && <ClassificationBadge c={played.classification} size={14} />} {played.mine ? 'Your move' : 'Game move'} {played.san}
        </button>
      )}
      {bestUci && bestUci !== played?.uci && (
        <button className="btn !py-1.5 !text-sm" onClick={() => onPlay([bestUci])}>
          <Icon name="star" size={14} /> Best move
        </button>
      )}
      {!atStart && (
        <button className="btn !py-1.5 !text-sm" onClick={() => onPlay([])}>
          <Icon name="first" size={14} /> Start
        </button>
      )}
    </div>
  );
}
