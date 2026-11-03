import { Chess } from 'chess.js';

/**
 * Checks a coach answer against what the model was given. Moves written with a piece letter, a
 * capture or castling are checked (a bare "e4" is usually a square, so it isn't); so are
 * evaluations like "+1.4".
 */
export interface Verdict {
  /** Moves that are neither legal in the position before/after the move nor in any line the model was given. */
  invented: string[];
  /** Legal moves the model named without checking them with the engine. */
  unchecked: string[];
  /** Evaluations that appear nowhere in the facts or tool results. */
  unknownEvals: string[];
  /** Best-move hint mode: the answer names the move it was meant to hint at. */
  leaked: string[];
}

const MOVE = /(?<![\w])(O-O(?:-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=[QRBN])?)[+#]?(?![\w])/g;
const EVAL = /(?<![\w.])[+-]\d{1,2}\.\d(?!\d)/g;

const strip = (san: string) => san.replace(/[+#!?]+$/, '');

export function movesIn(text: string): string[] {
  return [...text.matchAll(MOVE)].map((m) => strip(m[1]));
}

/**
 * `known`: every SAN and evaluation string the model saw (facts and tool results, as text).
 * `positions`: FENs where a named move may legally be played (before and after the move).
 * `secret`: moves a hint must not name.
 */
export function verifyAnswer(answer: string, known: string, positions: string[], secret: string[] = []): Verdict {
  const knownMoves = new Set(movesIn(known));
  const legalSomewhere = (san: string) =>
    positions.some((fen) => {
      try {
        new Chess(fen).move(san);
        return true;
      } catch {
        return false;
      }
    });
  const invented: string[] = [];
  const unchecked: string[] = [];
  for (const san of new Set(movesIn(answer))) {
    if (knownMoves.has(san)) continue;
    (legalSomewhere(san) ? unchecked : invented).push(san);
  }
  const knownEvals = new Set([...known.matchAll(EVAL)].map((m) => Number(m[0])));
  const unknownEvals = [...new Set([...answer.matchAll(EVAL)].map((m) => m[0]))].filter(
    (e) => ![...knownEvals].some((k) => Math.abs(k - Number(e)) < 0.051),
  );
  const named = new Set(movesIn(answer));
  // Pawn moves can only be caught as plain text ("e4"), so check secrets as words too.
  const leaked = secret.map(strip).filter((s) => named.has(s) || new RegExp(`(?<![\\w])${s.replace(/[+]/g, '\\+')}(?![\\w])`).test(answer));
  return { invented, unchecked, unknownEvals, leaked };
}

export const isClean = (v: Verdict) => !v.invented.length && !v.unknownEvals.length && !v.leaked.length;
