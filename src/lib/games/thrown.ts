import type { GameAnalysis, Score, StoredGame } from '../types';

/** "Thrown": a game you lost after being at least this far ahead (centipawns, your point of view). */
export const THROWN_CP = 300;
/** A forced mate counts as this many centipawns. */
const MATE_CP = 10000;

const cpOf = (s: Score | undefined): number | undefined =>
  !s ? undefined : s.kind === 'cp' ? s.v : s.kind === 'mate' ? (s.v > 0 ? MATE_CP : -MATE_CP) : s.v * MATE_CP;

/**
 * Your biggest advantage in the game (centipawns, your point of view): the best position you had,
 * whether you made it with your own move or your opponent handed it to you with theirs (the position
 * you then had to move in). Bump PEAK_VERSION whenever this changes, so stored values are redone.
 */
export function peakAdvantage(analysis: Pick<GameAnalysis, 'moves' | 'evals'>, userColor: 'w' | 'b'): number | undefined {
  const sign = userColor === 'w' ? 1 : -1;
  let peak: number | undefined;
  analysis.moves.forEach((_, i) => {
    const cp = cpOf(analysis.evals[i + 1]);
    if (cp !== undefined && (peak === undefined || sign * cp > peak)) peak = sign * cp;
  });
  return peak;
}

/** The rule peakAdvantage follows; stored peakEval values made under another one are recomputed. */
export const PEAK_VERSION = 2;

/** Lost after having been +3 or better. */
export const isThrown = (g: Pick<StoredGame, 'userResult' | 'peakEval'>) => g.userResult === 'loss' && (g.peakEval ?? -Infinity) >= THROWN_CP;

/** "+4.2", or "mate" for a forced mate. */
export const formatPeak = (cp: number) => (cp >= MATE_CP ? 'mate' : `+${(cp / 100).toFixed(1)}`);
