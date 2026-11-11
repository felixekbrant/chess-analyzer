import { evalBarPercent, formatScore } from '../lib/analysis/winprob';
import type { Score } from '../lib/types';

/**
 * The evaluation as a white/black split beside the board, like chess.com: the number stays still at
 * the end of the side that is ahead (white's end shows it when White is better, black's end when
 * Black is), without a sign. `thinking` dims it while a new position is still being evaluated (the
 * bar holds its last value meanwhile).
 */
export function EvalBar({ score, orientation = 'white', thinking }: { score?: Score; orientation?: 'white' | 'black'; thinking?: boolean }) {
  // chess.com's scale: linear, full at ±4 (a +5 position looks nearly won, as it is).
  const white = evalBarPercent(score);
  const whiteOnBottom = orientation === 'white';
  const whiteAhead = white >= 50;
  // The number's end: White's end of the bar if White is ahead, Black's otherwise.
  const atBottom = whiteAhead === whiteOnBottom;
  const label = formatScore(score).replace(/^[+-]/, '');
  return (
    <div
      className="relative w-[22px] lg:w-7 rounded-lg shrink-0 overflow-hidden bg-[#0a1714] shadow-[0_0_0_3px_var(--board-frame)]"
      style={{ alignSelf: 'stretch' }}
      role="img"
      aria-label={`Evaluation ${formatScore(score)}`}
    >
      <div
        className="absolute left-0 right-0 bg-gradient-to-b from-[#f1f7f3] to-[#dfe8e2] transition-[height] duration-500 ease-out"
        style={whiteOnBottom ? { bottom: 0, height: `${white}%` } : { top: 0, height: `${white}%` }}
      />
      <div className="absolute left-0 right-0 top-1/2 h-px bg-[#6e8f84]/60" />
      <div
        className="absolute left-0 right-0 text-center text-[9px] lg:text-[11px] font-black tabular-nums leading-none tracking-tight transition-opacity"
        title={thinking ? 'Evaluating…' : undefined}
        style={{
          opacity: thinking ? 0.5 : 1,
          ...(atBottom ? { bottom: 5 } : { top: 5 }),
          // Dark text on White's end, light text on Black's end.
          color: whiteAhead ? '#0a1714' : '#f1f7f3',
        }}
      >
        {label}
      </div>
    </div>
  );
}
