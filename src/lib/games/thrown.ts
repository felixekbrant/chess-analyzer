import type { GameAnalysis, Score, StoredGame } from '../types';

/** "Thrown": a game you lost after being at least this far ahead (centipawns, your point of view). */
export const THROWN_CP = 300;
/** A forced mate counts as this many centipawns. */
const MATE_CP = 10000;

const cpOf = (s: Score | undefined): number | undefined =>
  !s ? undefined : s.kind === 'cp' ? s.v : s.kind === 'mate' ? (s.v > 0 ? MATE_CP : -MATE_CP) : s.v * MATE_CP;

/**
 * Your biggest advantage in the game (centipawns, your point of view), measured in the positions
 * right after your own moves: the positions you created, not ones in the middle of an exchange.
 */
export function peakAdvantage(analysis: Pick<GameAnalysis, 'moves' | 'evals'>, userColor: 'w' | 'b'): number | undefined {
  const sign = userColor === 'w' ? 1 : -1;
  let peak: number | undefined;
  analysis.moves.forEach((m, i) => {
    if (m.color !== userColor) return;
    const cp = cpOf(analysis.evals[i + 1]);
    if (cp !== undefined && (peak === undefined || sign * cp > peak)) peak = sign * cp;
  });
  return peak;
}

/** Lost after having been +3 or better. */
export const isThrown = (g: Pick<StoredGame, 'userResult' | 'peakEval'>) => g.userResult === 'loss' && (g.peakEval ?? -Infinity) >= THROWN_CP;

/** "+4.2", or "mate" for a forced mate. */
export const formatPeak = (cp: number) => (cp >= MATE_CP ? 'mate' : `+${(cp / 100).toFixed(1)}`);
