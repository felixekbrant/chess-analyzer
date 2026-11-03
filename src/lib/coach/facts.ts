import { Chess } from 'chess.js';
import { MOTIF_LABEL } from '../insights/compute';
import { hideBestMove } from '../review/hideBest';
import type { Color, MoveAnalysis, Score } from '../types';
import { describeLine, describeMove, hintTarget } from './describe';

/** A line in words and what it wins. */
export interface LineFacts {
  steps: string[];
  outcome: string;
}

/**
 * What the coach is told about one move: everything the app already worked out, in words and from
 * the player's point of view, so the model explains it rather than reading the board itself.
 */
export interface MoveFacts {
  youPlay: 'White' | 'Black';
  opponent: 'White' | 'Black';
  /** Who played the move being discussed. */
  playedBy: 'you' | 'your opponent';
  /** The move in words: "You: bishop d6-c5 (Bc5)." */
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
  mistakeTypes: string[];
  /** The app's own one-line explanation. */
  appNote?: string;
  /** The engine's best move instead, with its line. */
  bestInstead?: { move: string; line: LineFacts };
  /** The move just before, which the discussed move answers (a recapture, a reply to a threat, …). */
  previousMove?: string;
  /** How the opponent punishes your move (your inaccuracies and mistakes). */
  howItIsPunished?: LineFacts;
  /** How the game goes on after a good move of yours (the engine's line). */
  howItContinues?: LineFacts;
  /** How you could punish the opponent's move (their mistakes). */
  howYouCouldPunish?: LineFacts;
  /** Best moves hidden: what to hint at, from general (target) to specific (piece). */
  hint?: { kind: string; targets: string[]; piece: string };
  /** Best moves hidden: moves the coach must not write, and the line it may use to understand them. */
  doNotReveal?: { moves: string[]; line?: LineFacts };
  /** Seconds spent on the move, when the game has clocks. */
  timeSpent?: number;
}

const ERRORS = ['inaccuracy', 'mistake', 'miss', 'blunder'];

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

/**
 * Facts for the move at `ply` (1-based, as in the review). `hideBest`: the player wants to find the
 * better move themselves, so it goes into `doNotReveal` and a `hint` is given instead.
 */
export function moveFacts(moves: MoveAnalysis[], ply: number, you: Color, opts: { hideBest?: boolean } = {}): MoveFacts {
  const m = moves[ply - 1];
  if (!m) throw new Error(`No move ${ply}`);
  const mine = m.color === you;
  const opp = you === 'w' ? 'Black' : 'White';
  const winYou = (w: number) => Math.round(mine ? w : 100 - w);
  const played = new Chess(m.fenBefore).move(m.san);
  const best = m.bestSan && m.bestSan !== m.san ? { move: m.bestSan, line: describeLine(m.fenBefore, m.bestLineUci.length ? m.bestLineUci : m.bestLineSan, you, opp) } : undefined;
  const reply = m.replyLineSan.length ? describeLine(m.fenAfter, m.replyLineSan, you, opp) : undefined;
  // What the player should find: the better move (your mistakes) or your best reply (theirs).
  const secret = mine ? m.bestSan : m.replyLineSan[0];
  const hide = !!opts.hideBest;
  return {
    youPlay: you === 'w' ? 'White' : 'Black',
    opponent: opp,
    playedBy: mine ? 'you' : 'your opponent',
    move: describeMove(played, you, opp),
    ...(ply > 1 ? { previousMove: describeMove(new Chess(moves[ply - 2].fenBefore).move(moves[ply - 2].san), you, opp) } : {}),
    verdict: m.classification,
    evalBefore: scoreFor(m.evalBefore, you),
    evalAfter: scoreFor(m.evalAfter, you),
    yourWinChanceBefore: winYou(m.winBefore),
    yourWinChanceAfter: winYou(m.winAfter),
    phase: m.phase,
    mistakeTypes: m.motifs.filter((x) => x !== 'long_think').map((x) => MOTIF_LABEL[x]),
    appNote: m.explanation ? (hide ? hideBestMove(m.explanation, m.bestSan) : m.explanation) || undefined : undefined,
    // The opponent's own better move is beside the point for you (and muddled the hints in trial 1).
    ...(best && mine && !hide ? { bestInstead: best } : {}),
    // A good move isn't "punished": the same line is just how the game goes on.
    ...(reply && mine ? (ERRORS.includes(m.classification) ? { howItIsPunished: reply } : { howItContinues: reply }) : {}),
    ...(reply && !mine && !hide ? { howYouCouldPunish: reply } : {}),
    ...(hide && secret
      ? {
          hint: hintTarget(mine ? m.fenBefore : m.fenAfter, secret, you, opp),
          doNotReveal: { moves: [secret], line: mine ? best?.line : reply },
        }
      : {}),
    ...(m.timeSpent !== undefined ? { timeSpent: Math.round(m.timeSpent) } : {}),
  };
}
