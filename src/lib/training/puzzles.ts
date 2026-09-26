import { db } from '../../db/schema';
import { positionKey } from '../pgn/parse';
import type { GameAnalysis, MoveAnalysis, Puzzle, StoredGame } from '../types';
import { NEW_CARD } from './srs';

const PUZZLE_CLASSES = new Set(['mistake', 'blunder', 'miss']);

/** Moves of the user that should become training puzzles. */
export function puzzleMoves(analysis: GameAnalysis, userColor: 'w' | 'b'): MoveAnalysis[] {
  return analysis.moves.filter(
    (m) => m.color === userColor && PUZZLE_CLASSES.has(m.classification) && m.bestLineUci.length > 0 && m.bestUci !== m.uci,
  );
}

/**
 * The line the user has to find: one move normally, or the whole mating line (up to 3 of the
 * user's moves) when the best line is a forced mate. Always ends on a user move.
 */
export function solutionFor(m: MoveAnalysis): string[] {
  const isMate = m.evalBefore.kind === 'mate' && (m.color === 'w' ? m.evalBefore.v > 0 : m.evalBefore.v < 0);
  if (!isMate) return m.bestLineUci.slice(0, 1);
  const max = Math.min(m.bestLineUci.length, 5);
  const len = max % 2 === 1 ? max : max - 1;
  return m.bestLineUci.slice(0, Math.max(1, len));
}

export function puzzleId(m: Pick<MoveAnalysis, 'fenBefore' | 'uci'>) {
  return `${positionKey(m.fenBefore)}|${m.uci}`;
}

export async function upsertPuzzlesFromAnalysis(game: StoredGame, analysis: GameAnalysis) {
  if (!game.userColor) return;
  const now = Date.now();
  for (const m of puzzleMoves(analysis, game.userColor)) {
    const id = puzzleId(m);
    const existing = await db.puzzles.get(id);
    const base = {
      fen: m.fenBefore,
      playedUci: m.uci,
      playedSan: m.san,
      explanation: m.explanation,
      solutionUci: solutionFor(m),
      classification: m.classification,
      motifs: m.motifs,
      phase: m.phase,
      opening: game.openingName,
      winLoss: m.winLoss,
      bestWin: m.winBefore,
    };
    if (!existing) {
      const p: Puzzle = { id, ...base, gameIds: [game.id], plies: [m.ply], occurrences: 1, createdAt: now, due: now, ...NEW_CARD };
      await db.puzzles.put(p);
    } else if (!existing.gameIds.includes(game.id)) {
      // The same mistake again: count it and make the puzzle due right away.
      await db.puzzles.put({
        ...existing,
        ...base,
        gameIds: [...existing.gameIds, game.id],
        plies: [...existing.plies, m.ply],
        occurrences: existing.occurrences + 1,
        due: Math.min(existing.due, now),
      });
    } else {
      await db.puzzles.put({ ...existing, ...base });
    }
  }
}
