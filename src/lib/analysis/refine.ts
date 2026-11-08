import { db } from '../../db/schema';
import { parsePgn } from '../pgn/parse';
import { ensureOpenings } from '../openings/eco';
import { buildSummary } from '../insights/summary';
import { upsertPuzzlesFromAnalysis } from '../training/puzzles';
import { rebuildAnalysis } from './analyzeGame';
import { winPercentFor } from './winprob';
import type { Color, MoveAnalysis, PositionEval } from '../types';

/**
 * Deeper looks improve the stored analysis. Games are analysed at a modest depth (14) so phones keep
 * up; now and then a better move only shows deeper (in a test of 60 positions before mistakes, 1 was
 * off by half a pawn or more). The review's live engine searches much deeper whenever it's open, so
 * when it clearly finds a better move than the stored one, that move becomes the recommendation:
 * the explanation, the "Best move" and the puzzle follow, and it's saved for next time.
 */

/** How much deeper than the stored analysis the live search must be to overrule it. */
const DEEPER_BY = 6;
/** How much better (win chance, percentage points) its move must be than the stored best. */
const CLEARLY_BETTER = 2;

/**
 * The better line from a deeper live search of the position before `m`, or undefined when the
 * stored best move stands: the search isn't deeper enough, agrees, or the difference is small.
 * When the stored move isn't among the live lines, it's at most as good as the last of them.
 */
export function betterLine(m: Pick<MoveAnalysis, 'fenBefore' | 'bestUci' | 'color'>, storedDepth: number, live: PositionEval | null): string[] | undefined {
  if (!live || live.fen !== m.fenBefore || live.depth < storedDepth + DEEPER_BY) return undefined;
  const top = live.lines[0];
  if (!top?.pv.length || top.pv[0] === m.bestUci) return undefined;
  const win = (l: (typeof live.lines)[number]) => winPercentFor(l.score, m.color as Color);
  const stored = live.lines.find((l) => l.pv[0] === m.bestUci) ?? live.lines[live.lines.length - 1];
  if (stored === top) return undefined;
  return win(top) - win(stored) >= CLEARLY_BETTER ? top.pv.slice(0, 10) : undefined;
}

/**
 * Saves a better line for the move at `ply` and rebuilds the game's analysis from it, offline:
 * the best move, its explanation, the opponent's reply line and the puzzle all follow. Scores
 * stay as they were (accuracy is calibrated at the analysis depth), only the recommended line changes.
 */
export async function saveBetterLine(gameId: string, ply: number, pv: string[]): Promise<boolean> {
  const [old, pgn, game] = await Promise.all([db.analyses.get(gameId), db.pgns.get(gameId), db.games.get(gameId)]);
  if (!old || !pgn || !game || !old.moves[ply]) return false;
  if (old.moves[ply].bestLineUci[0] === pv[0]) return false;
  // Book moves are recognised from the opening table, which must be loaded before rebuilding.
  await ensureOpenings();
  const patched = { ...old, moves: old.moves.map((m, i) => (i === ply ? { ...m, bestUci: pv[0], bestLineUci: pv } : m)) };
  const next = rebuildAnalysis(patched, parsePgn(pgn.pgn));
  await db.transaction('rw', [db.analyses, db.summaries, db.puzzles], async () => {
    await db.analyses.put(next);
    if (game.userColor) {
      await db.summaries.put(buildSummary(next, game.userColor));
      await upsertPuzzlesFromAnalysis(game, next);
    }
  });
  return true;
}
