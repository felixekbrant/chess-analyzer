import type { Color } from '../types';

/** Lichess' per-move accuracy from the mover's win % before and after the move. */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  if (winAfter >= winBefore) return 100;
  const raw = 103.1668 * Math.exp(-0.04354 * (winBefore - winAfter)) - 3.1669 + 1; // +1 uncertainty bonus
  return Math.max(0, Math.min(100, raw));
}

function stdDev(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
}

function harmonicMean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.length / xs.reduce((a, x) => a + 1 / Math.max(x, 1), 0);
}

/**
 * Lichess' game accuracy: the average of a volatility-weighted mean and a harmonic mean of move
 * accuracies. `whiteWin` holds White's win % for every position, starting with the initial one.
 * `firstMover` is the colour to move in the first position.
 */
export function gameAccuracy(whiteWin: number[], firstMover: Color = 'w'): { w: number; b: number } {
  const moves = whiteWin.length - 1;
  if (moves < 1) return { w: 100, b: 100 };
  const windowSize = Math.max(2, Math.min(8, Math.floor(moves / 10)));
  const windows: number[][] = [];
  for (let i = 0; i < Math.max(0, windowSize - 2); i++) windows.push(whiteWin.slice(0, windowSize));
  for (let i = 0; i + windowSize <= whiteWin.length; i++) windows.push(whiteWin.slice(i, i + windowSize));
  const weights = windows.map((w) => Math.max(0.5, Math.min(12, stdDev(w))));

  const acc: Record<Color, { a: number; w: number }[]> = { w: [], b: [] };
  for (let i = 0; i < moves; i++) {
    const color: Color = (i % 2 === 0) === (firstMover === 'w') ? 'w' : 'b';
    const prev = whiteWin[i];
    const next = whiteWin[i + 1];
    const a = color === 'w' ? moveAccuracy(prev, next) : moveAccuracy(100 - prev, 100 - next);
    acc[color].push({ a, w: weights[i] ?? 1 });
  }
  const combine = (xs: { a: number; w: number }[]) => {
    if (!xs.length) return 100;
    const totalW = xs.reduce((s, x) => s + x.w, 0);
    const weighted = xs.reduce((s, x) => s + x.a * x.w, 0) / totalW;
    return (weighted + harmonicMean(xs.map((x) => x.a))) / 2;
  };
  return { w: combine(acc.w), b: combine(acc.b) };
}

/** Simple mean accuracy for a subset of moves (used for per-phase accuracy). */
export function meanAccuracy(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  return (xs.reduce((a, b) => a + b, 0) / xs.length + harmonicMean(xs)) / 2;
}
