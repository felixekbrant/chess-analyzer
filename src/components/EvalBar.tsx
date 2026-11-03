import { formatScore, winPercent } from '../lib/analysis/winprob';
import type { Score } from '../lib/types';

/**
 * The evaluation as a white/black split beside the board. The number sits in a small pill on the
 * boundary, so it moves with the advantage. `thinking` dims it while a new position is still being
 * evaluated (the bar holds its last value meanwhile).
 */
export function EvalBar({ score, orientation = 'white', thinking }: { score?: Score; orientation?: 'white' | 'black'; thinking?: boolean }) {
  const white = score ? winPercent(score) : 50;
  const label = formatScore(score).replace('+', '');
  const whiteOnBottom = orientation === 'white';
  // Keep the pill inside the bar near the ends.
  const edge = Math.min(94, Math.max(6, white));
  return (
    <div
      className="relative w-[22px] lg:w-7 rounded-lg shrink-0 bg-[#1f1d1b] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06),0_0_0_3px_var(--board-frame)]"
      style={{ alignSelf: 'stretch' }}
      role="img"
      aria-label={`Evaluation ${formatScore(score)}`}
    >
      <div className="absolute inset-0 rounded-lg overflow-hidden">
        <div
          className="absolute left-0 right-0 bg-gradient-to-b from-white to-[#e9e7e2] transition-[height] duration-500 ease-out"
          style={whiteOnBottom ? { bottom: 0, height: `${white}%` } : { top: 0, height: `${white}%` }}
        />
        <div className="absolute left-0 right-0 top-1/2 h-px bg-[#8b8987]/60" />
      </div>
      <div
        className="absolute left-1/2 z-10 rounded-[5px] px-[3px] py-px text-[9px] leading-none lg:text-[11px] font-black tabular-nums whitespace-nowrap transition-[bottom,top,opacity] duration-500 ease-out shadow"
        title={thinking ? 'Evaluating…' : undefined}
        style={{
          opacity: thinking ? 0.5 : 1,
          ...(whiteOnBottom ? { bottom: `${edge}%`, transform: 'translate(-50%, 50%)' } : { top: `${100 - edge}%`, transform: 'translate(-50%, -50%)' }),
          background: white >= 50 ? '#f4f2ee' : '#1f1d1b',
          color: white >= 50 ? '#1f1d1b' : '#f4f2ee',
        }}
      >
        {label}
      </div>
    </div>
  );
}
