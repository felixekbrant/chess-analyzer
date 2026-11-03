import { memo } from 'react';
import { defaultPieces } from 'react-chessboard';
import { pieceUrl } from '../lib/boardThemes';
import { materialOf } from '../lib/analysis/material';
import { useSettings } from '../hooks/useStores';
import type { Color } from '../lib/types';

const NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' };

/**
 * The opponent's pieces `side` has captured, small and overlapping by kind, then "+N" when `side`
 * is ahead in material: like chess.com shows beside each player.
 */
export const CapturedPieces = memo(function CapturedPieces({ fen, side, size = 18 }: { fen: string; side: Color; size?: number }) {
  const set = useSettings().pieceSet ?? 'classic';
  const { captured, advantage } = materialOf(fen)[side];
  if (!captured.length && !advantage) return null;
  const color = side === 'w' ? 'b' : 'w';
  const label = `${captured.length ? `Captured: ${captured.map((t) => NAME[t]).join(', ')}` : ''}${advantage ? `${captured.length ? '. ' : ''}Up ${advantage}` : ''}`;
  return (
    <span className="inline-flex items-center shrink-0" aria-label={label} title={label} data-testid={`captured-${side}`}>
      {/* A hairline halo where the pieces match the background (black on dark, white on light). */}
      <span className="inline-flex items-center" style={{ filter: `var(--captured-${color}-halo)` }}>
      {captured.map((t, i) => {
        const code = `${color}${t.toUpperCase()}`;
        // Pieces of the same kind overlap; a new kind starts with a small gap.
        const sameAsPrev = i > 0 && captured[i - 1] === t;
        return (
          <span key={i} className="inline-block" style={{ width: size, height: size, marginLeft: i === 0 ? 0 : sameAsPrev ? -size * 0.55 : -size * 0.1 }} aria-hidden="true">
            {set === 'classic' ? defaultPieces[code]?.({ svgStyle: { width: '100%', height: '100%' } }) : <img src={pieceUrl(set, code)} alt="" className="w-full h-full" draggable={false} />}
          </span>
        );
      })}
      </span>
      {advantage > 0 && <span className="muted text-xs font-bold tabular-nums ml-1">+{advantage}</span>}
    </span>
  );
});
