import type { Color, Score } from '../types';

/**
 * Slope of the expected-points curve. Fitted so that game accuracy matches chess.com's Game Review
 * on 129 reviewed chess.com games (see scripts/calibration/README.md). chess.com's curve is flatter
 * than lichess' (0.00368): +100 is 56% here, 59% on lichess.
 */
export const EP_SLOPE = 0.00229;

/** chess.com-style expected points: maps centipawns (White POV) to White's winning chances 0-100. */
export function winPercentFromCp(cp: number): number {
  return 100 / (1 + Math.exp(-EP_SLOPE * cp));
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

/** Share of the eval bar per pawn of advantage, and its cap, as on chess.com (measured: linear, full at ±4). */
export const BAR_PER_PAWN = 11.25;
export const BAR_CAP = 95;

/**
 * White's share (0-100) of the eval bar and graph, on chess.com's scale: linear, 11.25% per pawn,
 * capped at 5-95% (reached at ±4); a forced mate fills it. Only for display: accuracy and
 * classification use the win-chance curve (winPercent).
 */
export function evalBarPercent(score: Score | undefined): number {
  if (!score) return 50;
  switch (score.kind) {
    case 'cp':
      return Math.min(BAR_CAP, Math.max(100 - BAR_CAP, 50 + (BAR_PER_PAWN * score.v) / 100));
    case 'mate':
      return score.v > 0 ? 100 : 0;
    case 'over':
      return 50 + 50 * score.v;
  }
}
