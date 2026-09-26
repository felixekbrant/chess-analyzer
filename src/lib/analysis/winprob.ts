import type { Color, Score } from '../types';

/** Lichess' win-percentage model: maps centipawns (White POV) to White's winning chances 0-100. */
export function winPercentFromCp(cp: number): number {
  const c = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

/** White's win % for any score. */
export function winPercent(score: Score): number {
  switch (score.kind) {
    case 'cp':
      return winPercentFromCp(score.v);
    case 'mate':
      return score.v > 0 ? 100 : 0;
    case 'over':
      return 50 + 50 * score.v;
  }
}

export function winPercentFor(score: Score, color: Color): number {
  const w = winPercent(score);
  return color === 'w' ? w : 100 - w;
}

/** Converts a score to a number usable for charts/eval bars (pawns, White POV, clamped ±10). */
export function scoreToPawns(score: Score): number {
  switch (score.kind) {
    case 'cp':
      return Math.max(-10, Math.min(10, score.v / 100));
    case 'mate':
      return score.v > 0 ? 10 : -10;
    case 'over':
      return score.v * 10;
  }
}

export function formatScore(score: Score | undefined): string {
  if (!score) return '';
  switch (score.kind) {
    case 'cp': {
      const p = score.v / 100;
      return (p > 0 ? '+' : '') + p.toFixed(Math.abs(p) >= 10 ? 0 : 1);
    }
    case 'mate':
      return (score.v > 0 ? '' : '-') + 'M' + Math.abs(score.v);
    case 'over':
      return score.v === 1 ? '1-0' : score.v === -1 ? '0-1' : '½-½';
  }
}

/** Mover-POV score in centipawns (mate mapped to ±10000) for comparisons. */
export function cpFor(score: Score, color: Color): number {
  let v: number;
  switch (score.kind) {
    case 'cp':
      v = score.v;
      break;
    case 'mate':
      v = score.v > 0 ? 10000 - score.v : -10000 - score.v;
      break;
    case 'over':
      v = score.v * 10000;
  }
  return color === 'w' ? v : -v;
}
