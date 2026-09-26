import { Chess, type Square } from 'chess.js';
import type { Color, Score } from '../types';

export const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const PIECE_NAME: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const CACHE_SIZE = 64;
const cache = new Map<string, Chess>();

/**
 * A shared chess.js instance for a position. Constructing one costs ~1 ms, and the analysis asks
 * about the same few positions many times, so instances are cached (LRU). Callers must not mutate it.
 */
export function readonlyChess(fen: string): Chess {
  let c = cache.get(fen);
  if (c) {
    cache.delete(fen);
  } else {
    c = new Chess(fen);
    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
  }
  cache.set(fen, c);
  return c;
}

/** Material balance (mover POV): own material minus opponent's. */
export function materialBalance(fen: string, color: Color): number {
  let bal = 0;
  const placement = fen.split(' ')[0];
  for (const ch of placement) {
    const lower = ch.toLowerCase();
    if (!(lower in PIECE_VALUE)) continue;
    const isWhite = ch !== lower;
    const v = PIECE_VALUE[lower];
    bal += (isWhite === (color === 'w') ? 1 : -1) * v;
  }
  return bal;
}

/** Sum of knights, bishops, rooks and queens for both sides. 62 at the start. */
export function nonPawnMaterial(fen: string): number {
  let total = 0;
  for (const ch of fen.split(' ')[0]) {
    const l = ch.toLowerCase();
    if (l === 'n' || l === 'b' || l === 'r' || l === 'q') total += PIECE_VALUE[l];
  }
  return total;
}

export function sideToMove(fen: string): Color {
  return fen.split(' ')[1] as Color;
}

export function other(c: Color): Color {
  return c === 'w' ? 'b' : 'w';
}

/** Plays uci moves from a FEN. Stops at the first illegal move. Returns SANs and resulting FENs. */
export function playUci(fen: string, ucis: string[]): { sans: string[]; fens: string[]; moves: MoveInfo[] } {
  const chess = new Chess(fen);
  const sans: string[] = [];
  const fens: string[] = [];
  const moves: MoveInfo[] = [];
  for (const u of ucis) {
    try {
      const m = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      sans.push(m.san);
      fens.push(chess.fen());
      moves.push({ from: m.from, to: m.to, piece: m.piece, captured: m.captured, san: m.san, color: m.color as Color });
    } catch {
      break;
    }
  }
  return { sans, fens, moves };
}

export interface MoveInfo {
  from: string;
  to: string;
  piece: string;
  captured?: string;
  san: string;
  color: Color;
}

export function uciToSan(fen: string, uci: string): string | undefined {
  return playUci(fen, [uci]).sans[0];
}

/** Score of a finished position, or undefined if the game continues. */
export function terminalScore(fen: string): Score | undefined {
  const chess = readonlyChess(fen);
  if (chess.isCheckmate()) return { kind: 'over', v: chess.turn() === 'w' ? -1 : 1 };
  if (chess.isStalemate() || chess.isInsufficientMaterial()) return { kind: 'over', v: 0 };
  return undefined;
}

export function legalMoveCount(fen: string): number {
  return readonlyChess(fen).moves().length;
}

export function isInCheck(fen: string): boolean {
  return readonlyChess(fen).inCheck();
}

/** Squares of `by`'s pieces attacking `square` in the given position (ignores pins). */
export function attackersOf(fen: string, square: string, by: Color): string[] {
  return readonlyChess(fen).attackers(square as Square, by);
}

export function pieceAt(fen: string, square: string): { type: string; color: Color } | undefined {
  const p = readonlyChess(fen).get(square as Square);
  return p ? { type: p.type, color: p.color as Color } : undefined;
}

/** All pieces of `color` in a position. */
export function piecesOf(fen: string, color: Color): { square: string; type: string }[] {
  const out: { square: string; type: string }[] = [];
  const rows = readonlyChess(fen).board();
  for (const row of rows) for (const p of row) if (p && p.color === color) out.push({ square: p.square, type: p.type });
  return out;
}

/**
 * Captures available to `by` that win material outright: the target is undefended or worth more
 * than the capturing piece. Pass a position where `by` is to move.
 */
export function winningCaptures(fen: string, by: Color): MoveInfo[] {
  const chess = readonlyChess(fen);
  if (chess.turn() !== by) return [];
  const victim = other(by);
  return chess
    .moves({ verbose: true })
    .filter((m) => m.captured && m.captured !== 'k')
    .filter((m) => {
      const gain = PIECE_VALUE[m.captured!];
      const defended = chess.attackers(m.to as Square, victim).length > 0;
      return !defended ? gain >= 1 : gain > PIECE_VALUE[m.piece];
    })
    .map((m) => ({ from: m.from, to: m.to, piece: m.piece, captured: m.captured, san: m.san, color: by }));
}

/** The same position with the other side to move (a "null move"), or undefined if illegal (in check). */
export function nullMoveFen(fen: string): string | undefined {
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  const flipped = parts.join(' ');
  try {
    const chess = readonlyChess(flipped);
    // The side that just "passed" must not be giving check (otherwise the king could be captured).
    const opp = chess.turn() === 'w' ? 'b' : 'w';
    const k = piecesOf(flipped, opp).find((p) => p.type === 'k');
    if (k && chess.isAttacked(k.square as Square, chess.turn())) return undefined;
    return flipped;
  } catch {
    return undefined;
  }
}
