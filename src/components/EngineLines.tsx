import { formatScore } from '../lib/analysis/winprob';
import { playUci } from '../lib/analysis/board';
import type { PositionEval } from '../lib/types';

export function EngineLines({ result, fen, onPlayLine }: { result: PositionEval | null; fen: string; onPlayLine?: (uci: string) => void }) {
  if (!result) return <div className="muted text-sm py-2">Engine thinking…</div>;
  const moveNo = Number(fen.split(' ')[5]);
  const black = fen.split(' ')[1] === 'b';
  return (
    <div className="text-sm space-y-1">
      <div className="muted text-xs">Stockfish 19 lite · depth {result.depth}</div>
      {result.lines.map((l, i) => {
        const { sans } = playUci(fen, l.pv.slice(0, 12));
        const positive = l.score.kind === 'over' ? l.score.v >= 0 : l.score.v >= 0;
        return (
          <div key={i} className="flex gap-2 items-start">
            <span
              className="font-bold tabular-nums rounded px-1.5 min-w-[3.2rem] text-center text-xs py-0.5"
              style={positive ? { background: '#f4f4f4', color: '#1d1d1b' } : { background: '#403d39', color: '#f4f4f4' }}
            >
              {formatScore(l.score)}
            </span>
            <button className="text-left leading-snug hover:underline" onClick={() => l.pv[0] && onPlayLine?.(l.pv[0])}>
              {sans.map((s, j) => {
                const ply = j + (black ? 1 : 0);
                const num = moveNo + Math.floor(ply / 2);
                const prefix = ply % 2 === 0 ? `${num}. ` : j === 0 ? `${num}... ` : '';
                return (
                  <span key={j} className={j === 0 ? 'font-semibold' : ''}>
                    {prefix}
                    {s}{' '}
                  </span>
                );
              })}
            </button>
          </div>
        );
      })}
    </div>
  );
}
