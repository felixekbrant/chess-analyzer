import { PIECE_VALUE } from './board';
import type { Color } from '../types';

/** What each side has taken, like chess.com shows next to the players. */
export interface SideMaterial {
  /** Types of the opponent's pieces this side has captured, pawns first then knights, bishops, rooks, queens. */
  captured: string[];
  /** How many points this side is ahead (0 when level or behind). */
  advantage: number;
}

const START: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const ORDER = ['p', 'n', 'b', 'r', 'q'];

function counts(fen: string): Record<Color, Record<string, number>> {
  const out: Record<Color, Record<string, number>> = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const ch of fen.split(' ')[0]) {
    const t = ch.toLowerCase();
    if (t in START) out[ch === t ? 'b' : 'w'][t]++;
  }
  return out;
}

/**
 * Captured pieces and material lead for both sides. A promoted piece counts as a pawn that is gone
 * but not captured, so promotions don't show up as captures.
 */
export function materialOf(fen: string): Record<Color, SideMaterial> {
  const c = counts(fen);
  const missing = (side: Color) => {
    // Pieces above the starting number came from promotions: that many pawns weren't captured.
    const promoted = ORDER.filter((t) => t !== 'p').reduce((n, t) => n + Math.max(0, c[side][t] - START[t]), 0);
    return Object.fromEntries(ORDER.map((t) => [t, t === 'p' ? Math.max(0, START.p - c[side].p - promoted) : Math.max(0, START[t] - c[side][t])]));
  };
  const value = (side: Color) => ORDER.reduce((s, t) => s + c[side][t] * PIECE_VALUE[t], 0);
  const diff = value('w') - value('b');
  const capturedBy = (side: Color) => {
    const m = missing(side === 'w' ? 'b' : 'w');
    return ORDER.flatMap((t) => Array<string>(m[t]).fill(t));
  };
  return {
    w: { captured: capturedBy('w'), advantage: Math.max(0, diff) },
    b: { captured: capturedBy('b'), advantage: Math.max(0, -diff) },
  };
}
