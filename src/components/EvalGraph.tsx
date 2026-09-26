import { memo, useMemo, useRef } from 'react';
import { CLASS_META } from '../lib/classificationMeta';
import { winPercent } from '../lib/analysis/winprob';
import type { MoveAnalysis, Score } from '../lib/types';

const DOT_CLASSES = new Set(['blunder', 'mistake', 'miss', 'brilliant', 'great']);

/**
 * White's winning chances over the game (white area = White better), drawn as plain SVG.
 * Tap or drag anywhere to jump to that move. Much cheaper than a charting library on phones.
 */
export const EvalGraph = memo(function EvalGraph({
  evals,
  moves,
  current,
  onSelect,
  height = 88,
}: {
  evals: Score[];
  moves: MoveAnalysis[];
  current: number;
  onSelect: (ply: number) => void;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const n = Math.max(1, evals.length - 1);
  const { area, line } = useMemo(() => {
    const pts = evals.map((s, i) => `${(i / n) * 100},${100 - winPercent(s)}`);
    return { line: pts.join(' '), area: `0,100 ${pts.join(' ')} 100,100` };
  }, [evals, n]);
  const dots = useMemo(
    () => moves.map((m, i) => ({ m, x: ((i + 1) / n) * 100, y: 100 - winPercent(evals[i + 1]) })).filter((d) => DOT_CLASSES.has(d.m.classification)),
    [moves, evals, n],
  );

  const seek = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSelect(Math.round(f * n));
  };

  return (
    <div
      ref={ref}
      className="relative w-full rounded-md overflow-hidden bg-[#403d39] cursor-pointer touch-none select-none"
      style={{ height }}
      role="slider"
      aria-label="Evaluation graph, move"
      aria-valuemin={0}
      aria-valuemax={n}
      aria-valuenow={current}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        seek(e.clientX);
      }}
      onPointerMove={(e) => e.buttons && seek(e.clientX)}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        <polygon points={area} fill="#f4f4f4" />
        <polyline points={line} fill="none" stroke="#c8c6c3" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        <line x1={0} x2={100} y1={50} y2={50} stroke="#8b8987" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="absolute top-0 bottom-0 w-0.5 bg-accent pointer-events-none" style={{ left: `${(current / n) * 100}%` }} />
      {dots.map(({ m, x, y }) => (
        <span
          key={m.ply}
          title={`${m.moveNumber}${m.color === 'w' ? '.' : '...'} ${m.san} (${CLASS_META[m.classification].label})`}
          className="absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `${x}%`, top: `${y}%`, background: CLASS_META[m.classification].color, boxShadow: '0 0 0 2px #403d39' }}
        />
      ))}
    </div>
  );
});
