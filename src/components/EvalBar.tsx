import { formatScore, winPercent } from '../lib/analysis/winprob';
import type { Score } from '../lib/types';

/** `thinking` dims the number while a new position is still being evaluated (the bar holds its last value). */
export function EvalBar({ score, orientation = 'white', thinking }: { score?: Score; orientation?: 'white' | 'black'; thinking?: boolean }) {
  const white = score ? winPercent(score) : 50;
  const label = formatScore(score);
  const whiteOnBottom = orientation === 'white';
  const whiteAhead = white >= 50;
  return (
    <div className="relative w-4 lg:w-6 rounded-md overflow-hidden shrink-0 bg-[#403d39]" style={{ alignSelf: 'stretch' }}>
      <div
        className="absolute left-0 right-0 bg-[#f4f4f4] transition-all duration-500 ease-out"
        style={whiteOnBottom ? { bottom: 0, height: `${white}%` } : { top: 0, height: `${white}%` }}
      />
      <div
        className="absolute left-0 right-0 text-center text-[8px] lg:text-[10px] font-bold transition-opacity"
        title={thinking ? 'Evaluating…' : undefined}
        style={{
          opacity: thinking ? 0.45 : 1,
          ...(whiteAhead === whiteOnBottom ? { bottom: 4 } : { top: 4 }),
          color: whiteAhead ? '#403d39' : '#f4f4f4',
        }}
      >
        {label.replace('+', '')}
      </div>
    </div>
  );
}
