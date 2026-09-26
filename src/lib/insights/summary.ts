import { positionKey } from '../pgn/parse';
import type { Color, GameAnalysis, MoveAnalysis } from '../types';

/** The part of a user's move that the insights need. */
export type SummaryMove = Pick<
  MoveAnalysis,
  | 'ply'
  | 'moveNumber'
  | 'color'
  | 'san'
  | 'classification'
  | 'motifs'
  | 'phase'
  | 'winBefore'
  | 'winAfter'
  | 'winLoss'
  | 'accuracy'
  | 'isBook'
  | 'clock'
  | 'timeSpent'
  | 'bestSan'
> & {
  // The fields below are only kept for inaccuracies and worse, which is all the insights look at
  // them for (repeated mistakes, opening slips, example positions).
  /** positionKey of the position before the move. */
  key?: string;
  uci?: string;
  fenBefore?: string;
  explanation?: string;
};

/**
 * A compact (~6x smaller) digest of a GameAnalysis holding only what cross-game insights read.
 * Insights pages load all summaries; full analyses are only loaded when reviewing one game.
 */
export interface GameSummary {
  gameId: string;
  userColor: Color;
  accuracy: GameAnalysis['accuracy'];
  phaseAccuracy: GameAnalysis['phaseAccuracy'];
  /** The user's moves only. */
  moves: SummaryMove[];
  /** Clock readings (both players) every 5th move, for the clock-usage curve. */
  clocks: { moveNumber: number; color: Color; clock: number }[];
  /** The user's win % after every ply of the game. */
  userWin: number[];
  /** Full-move number of the last book move, if any. */
  bookExitMove?: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const DETAIL = new Set(['inaccuracy', 'mistake', 'miss', 'blunder']);

export function buildSummary(analysis: GameAnalysis, userColor: Color): GameSummary {
  const moves: SummaryMove[] = analysis.moves
    .filter((m) => m.color === userColor)
    .map((m) => {
      const detail = DETAIL.has(m.classification);
      return {
        ply: m.ply,
        moveNumber: m.moveNumber,
        color: m.color,
        san: m.san,
        classification: m.classification,
        motifs: m.motifs,
        phase: m.phase,
        winBefore: r1(m.winBefore),
        winAfter: r1(m.winAfter),
        winLoss: r1(m.winLoss),
        accuracy: r1(m.accuracy),
        isBook: m.isBook,
        clock: m.clock,
        timeSpent: m.timeSpent,
        bestSan: m.bestSan,
        ...(detail ? { key: positionKey(m.fenBefore), uci: m.uci, fenBefore: m.fenBefore, explanation: m.explanation } : {}),
      };
    });
  let bookExitMove: number | undefined;
  for (const m of analysis.moves) if (m.isBook) bookExitMove = m.moveNumber;
  return {
    gameId: analysis.gameId,
    userColor,
    accuracy: analysis.accuracy,
    phaseAccuracy: analysis.phaseAccuracy,
    moves,
    clocks: analysis.moves
      .filter((m) => m.clock !== undefined && m.moveNumber % 5 === 0)
      .map((m) => ({ moveNumber: m.moveNumber, color: m.color, clock: m.clock! })),
    userWin: analysis.moves.map((m) => r1(m.color === userColor ? m.winAfter : 100 - m.winAfter)),
    bookExitMove,
  };
}
