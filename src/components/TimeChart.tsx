import { memo, useMemo } from 'react';
import { formatDuration } from '../lib/pgn/parse';
import type { Color, MoveAnalysis } from '../lib/types';

/**
 * Seconds spent per move: White's bars above the line, Black's below. You are blue, the opponent orange.
 * Plain SVG so it costs almost nothing to re-render; tap a bar to jump to that move.
 */
export const TimeChart = memo(function TimeChart({
  moves,
  current,
  onSelect,
  userColor,
}: {
  moves: MoveAnalysis[];
  current: number;
  onSelect: (ply: number) => void;
  userColor: Color | null;
}) {
  const timed = useMemo(() => moves.filter((m) => m.timeSpent !== undefined), [moves]);
  if (!timed.length) return <p className="muted text-sm">No clock data for this game (daily games have no clock).</p>;

  const maxMove = Math.max(...moves.map((m) => m.moveNumber));
  const max = Math.max(1, ...timed.map((m) => m.timeSpent!));
  const colorOf = (c: Color) => (c === (userColor ?? 'w') ? 'var(--series-1)' : 'var(--series-2)');
  const w = 100 / maxMove;
  const currentMove = moves[current - 1];

  return (
    <div>
      <div className="relative h-28 w-full">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          <line x1={0} x2={100} y1={50} y2={50} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {currentMove && (
            <rect x={(currentMove.moveNumber - 1) * w} width={w} y={0} height={100} fill="var(--panel-2)" />
          )}
          {timed.map((m) => {
            const h = (48 * m.timeSpent!) / max;
            return (
              <rect
                key={m.ply}
                x={(m.moveNumber - 1) * w + w * 0.12}
                width={w * 0.76}
                y={m.color === 'w' ? 50 - h : 50}
                height={Math.max(0.6, h)}
                fill={colorOf(m.color)}
                className="cursor-pointer"
                onClick={() => onSelect(m.ply + 1)}
              >
                <title>{`${m.moveNumber}${m.color === 'w' ? '.' : '...'} ${m.san}: ${formatDuration(m.timeSpent)}`}</title>
              </rect>
            );
          })}
        </svg>
      </div>
      <div className="flex justify-between text-xs muted mt-1">
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--series-1)' }} /> You
          <span className="w-2.5 h-2.5 rounded-sm ml-2" style={{ background: 'var(--series-2)' }} /> Opponent
        </span>
        <span>longest: {formatDuration(max)}</span>
      </div>
    </div>
  );
});
