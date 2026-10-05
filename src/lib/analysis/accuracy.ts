import type { Color } from '../types';

/**
 * Per-move accuracy from the mover's win % before and after the move. The curve's shape follows
 * lichess, but its constants are fitted to chess.com's accuracy (see EP_SLOPE in winprob.ts).
 */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  if (winAfter >= winBefore) return 100;
  const raw = 108.72 * Math.exp(-20.02 * ((winBefore - winAfter) / 100)) + 14.88;
  return Math.max(0, Math.min(100, raw));
}

function harmonicMean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.length / xs.reduce((a, x) => a + 1 / Math.max(x, 1), 0);
}

/** Average of the arithmetic and harmonic mean, so a single blunder weighs more than a plain average. */
function combine(xs: number[]): number {
  if (!xs.length) return 100;
  return (xs.reduce((a, b) => a + b, 0) / xs.length + harmonicMean(xs)) / 2;
}

/**
 * Game accuracy for both sides. `whiteWin` holds White's win % for every position, starting with
 * the initial one. `firstMover` is the colour to move in the first position.
 */
export function gameAccuracy(whiteWin: number[], firstMover: Color = 'w'): { w: number; b: number } {
  const acc: Record<Color, number[]> = { w: [], b: [] };
  for (let i = 0; i + 1 < whiteWin.length; i++) {
    const color: Color = (i % 2 === 0) === (firstMover === 'w') ? 'w' : 'b';
    const prev = whiteWin[i];
    const next = whiteWin[i + 1];
    acc[color].push(color === 'w' ? moveAccuracy(prev, next) : moveAccuracy(100 - prev, 100 - next));
  }
  return { w: combine(acc.w), b: combine(acc.b) };
}

/** Accuracy for a subset of moves (used for per-phase accuracy). */
export function meanAccuracy(xs: number[]): number | undefined {
  return xs.length ? combine(xs) : undefined;
}
