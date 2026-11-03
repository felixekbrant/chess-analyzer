import { MOTIF_LABEL } from '../insights/compute';
import { PIECE_NAME, materialBalance, nullMoveFen, other, winningCaptures } from '../analysis/board';
import { hideBestMove } from '../review/hideBest';
import type { Color, MoveAnalysis, Score } from '../types';

/**
 * What the coach is told about one move: everything the app already worked out, written from the
 * player's point of view. The model explains from this and never has to read the board itself.
 */
export interface MoveFacts {
  moveNumber: number;
  /** Who played the move being discussed. */
  playedBy: 'you' | 'your opponent';
  /** Your colour. */
  youPlay: 'White' | 'Black';
  move: string;
  /** "mistake", "blunder", "best", … as in the review. */
  verdict: string;
  /** Evaluation from your point of view before and after the move ("+1.2" = you are better). */
  evalBefore: string;
  evalAfter: string;
  /** Your chance of winning (%) before and after. */
  yourWinChanceBefore: number;
  yourWinChanceAfter: number;
  phase: string;
  /** Labels of the mistake types the app found ("Hung a piece", …). */
  mistakeTypes: string[];
  /** The app's own one-line explanation. */
  appNote?: string;
  /** The engine's best move in the position before, and its line. */
  bestMove?: string;
  bestLine?: string[];
  /** The best answer to the move: how it gets punished (your mistakes) or how you could punish it (theirs). */
  replyLine?: string[];
  /**
   * Best moves hidden: what the coach knows but must not say (to hint towards it instead). The
   * fields above that would give it away are moved here.
   */
  doNotReveal?: { bestMove?: string; bestLine?: string[]; replyLine?: string[]; winningCapturesAfter?: string[] };
  /** Captures that win material right after the move, by the side that didn't move. */
  winningCapturesAfter: string[];
  /** Material from your point of view after the move (+2 = you are up two pawns' worth). */
  materialAfter: number;
  /** Seconds spent on the move, when the game has clocks. */
  timeSpent?: number;
}

/** A score (white's point of view) as seen by `color`: "+1.4", "-0.3", "mate in 3", "mated in 2". */
export function scoreFor(score: Score | undefined, color: Color): string {
  if (!score) return '?';
  const s = color === 'w' ? 1 : -1;
  if (score.kind === 'cp') {
    const p = (s * score.v) / 100;
    return `${p > 0 ? '+' : ''}${p.toFixed(1)}`;
  }
  if (score.kind === 'mate') return s * score.v > 0 ? `mate in ${Math.abs(score.v)}` : `mated in ${Math.abs(score.v)}`;
  return s * score.v > 0 ? 'won' : s * score.v < 0 ? 'lost' : 'draw';
}

const captureNote = (c: { san: string; captured?: string; to: string }) => `${c.san} (takes the ${PIECE_NAME[c.captured ?? ''] ?? 'piece'} on ${c.to})`;

/**
 * Facts for the move at `ply` (1-based, as in the review). `hideBest` moves the best move, and any
 * line that gives it away, into `doNotReveal`, for looking for it yourself.
 */
export function moveFacts(moves: MoveAnalysis[], ply: number, you: Color, opts: { hideBest?: boolean } = {}): MoveFacts {
  const m = moves[ply - 1];
  if (!m) throw new Error(`No move ${ply}`);
  const mine = m.color === you;
  const winYou = (w: number) => Math.round(mine ? w : 100 - w);
  const capturesAfter = winningCaptures(m.fenAfter, other(m.color)).map(captureNote);
  // For the opponent's mistakes the reply line is your best move: that's what a hint must not give away.
  const replyGivesAway = opts.hideBest && !mine;
  return {
    moveNumber: m.moveNumber,
    playedBy: mine ? 'you' : 'your opponent',
    youPlay: you === 'w' ? 'White' : 'Black',
    move: `${m.moveNumber}${m.color === 'w' ? '.' : '...'}${m.san}`,
    verdict: m.classification,
    evalBefore: scoreFor(m.evalBefore, you),
    evalAfter: scoreFor(m.evalAfter, you),
    yourWinChanceBefore: winYou(m.winBefore),
    yourWinChanceAfter: winYou(m.winAfter),
    phase: m.phase,
    mistakeTypes: m.motifs.filter((x) => x !== 'long_think').map((x) => MOTIF_LABEL[x]),
    appNote: m.explanation ? (opts.hideBest ? hideBestMove(m.explanation, m.bestSan) : m.explanation) || undefined : undefined,
    ...(opts.hideBest ? {} : { bestMove: m.bestSan, bestLine: m.bestLineSan.slice(0, 6) }),
    ...(replyGivesAway ? {} : { replyLine: m.replyLineSan.slice(0, 6) }),
    winningCapturesAfter: replyGivesAway ? [] : capturesAfter,
    ...(opts.hideBest
      ? {
          doNotReveal: {
            bestMove: m.bestSan,
            bestLine: m.bestLineSan.slice(0, 6),
            ...(replyGivesAway ? { replyLine: m.replyLineSan.slice(0, 6), winningCapturesAfter: capturesAfter } : {}),
          },
        }
      : {}),
    materialAfter: materialBalance(m.fenAfter, you),
    ...(m.timeSpent !== undefined ? { timeSpent: Math.round(m.timeSpent) } : {}),
  };
}

/** Pieces of `color` that the other side could take with a winning capture right now (ignoring whose move it is). */
export function piecesEnPrise(fen: string, color: Color): string[] {
  const flipped = fen.split(' ')[1] === color ? nullMoveFen(fen) : fen;
  if (!flipped) return [];
  return winningCaptures(flipped, other(color)).map(captureNote);
}
