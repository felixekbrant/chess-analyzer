import { memo } from 'react';
import { defaultPieces } from 'react-chessboard';

const FILES = 'abcdefgh';

/**
 * A static, non-interactive board for thumbnails. Much cheaper than a full react-chessboard
 * instance (no drag-and-drop context), so pages can show many of them.
 */
export const MiniBoard = memo(function MiniBoard({
  fen,
  orientation = 'white',
  highlight = [],
  size,
}: {
  fen: string;
  orientation?: 'white' | 'black';
  highlight?: string[];
  size?: number;
}) {
  const rows = fen.split(' ')[0].split('/');
  const cells: { sq: string; piece?: string }[] = [];
  rows.forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let k = 0; k < Number(ch); k++) cells.push({ sq: FILES[f++] + (8 - r) });
      } else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        cells.push({ sq: FILES[f++] + (8 - r), piece: color + ch.toUpperCase() });
      }
    }
  });
  const ordered = orientation === 'white' ? cells : [...cells].reverse();
  return (
    <div
      className="grid grid-cols-8 rounded-md overflow-hidden aspect-square select-none"
      style={size ? { width: size } : undefined}
      role="img"
      aria-label={`Chess position ${fen}`}
    >
      {ordered.map(({ sq, piece }) => {
        const light = (FILES.indexOf(sq[0]) + Number(sq[1])) % 2 === 1;
        const hl = highlight.includes(sq);
        return (
          <div key={sq} className="aspect-square" style={{ background: hl ? (light ? '#f5f682' : '#b9ca43') : light ? '#ebecd0' : '#779556' }}>
            {piece && defaultPieces[piece]?.({ svgStyle: { width: '100%', height: '100%' } })}
          </div>
        );
      })}
    </div>
  );
});
