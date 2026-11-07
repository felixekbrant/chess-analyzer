import { Chess } from 'chess.js';
import { hintTarget } from '../coach/describe';
import { PIECE_NAME, PIECE_VALUE, nullMoveFen, other, winningCaptures } from '../analysis/board';
import type { Color } from '../types';

const join = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The position with the opponent to move, to see what they threaten (undefined if you're in check). */
const theirTurn = (fen: string, you: Color) => (fen.split(' ')[1] === you ? nullMoveFen(fen) : fen);

/** Your pieces the opponent could win right now, most valuable first. */
function underAttack(fen: string, you: Color): { type: string; square: string }[] {
  const f = theirTurn(fen, you);
  if (!f) return [];
  const seen = new Set<string>();
  return winningCaptures(f, other(you))
    .filter((c) => c.captured && !seen.has(c.to) && seen.add(c.to))
    .map((c) => ({ type: c.captured!, square: c.to }))
    .sort((a, b) => PIECE_VALUE[b.type] - PIECE_VALUE[a.type]);
}

/** Whether the opponent would mate in one if it were their move. */
function mateThreat(fen: string, you: Color): boolean {
  const f = theirTurn(fen, you);
  if (!f) return false;
  const c = new Chess(f);
  return c.moves().some((m) => m.endsWith('#'));
}

/**
 * A first hint towards `san` in `fen`, written by the app from the board: what to notice or what
 * kind of move to look for, without naming the move or the square it goes to ("Look for a capture:
 * White's knight on e5 can be taken", "Your rook on d2 is under attack"). The second hint
 * highlights the piece.
 */
export function hintText(fen: string, san: string | undefined, you: Color): string | undefined {
  const t = hintTarget(fen, san, you, you === 'w' ? 'Black' : 'White');
  if (!t) return undefined;
  if (t.kind === 'a checkmate') return 'There is a checkmate in one. Look at every check.';
  if (t.kind === 'a capture') return `Look for a capture: ${t.targets[0]} can be taken.`;
  if (t.kind === 'a check') {
    const others = t.targets.filter((x) => !x.endsWith('king'));
    return others.length ? `Look for a check that also hits ${join(others)}.` : 'Look for a check.';
  }
  // A quiet move is often an answer to something: a mate threat, or a piece under attack. But when
  // it attacks something itself (a counter-attack), that's the clue, unless it moves the piece
  // that was under attack.
  if (mateThreat(fen, you)) return 'Your opponent threatens mate: deal with that first.';
  const attacked = underAttack(fen, you);
  const from = new Chess(fen).move(san!).from;
  const moved = attacked.find((a) => a.square === from);
  const say = (a: { type: string; square: string }) => `Your ${PIECE_NAME[a.type]} on ${a.square} is under attack. What's the best way to deal with it?`;
  if (moved) return say(moved);
  if (t.targets.length) return `No capture or check: look for a quiet move that attacks ${join(t.targets)}.`;
  if (attacked.length) return say(attacked[0]);
  return 'No capture or check here: look for a quiet move that improves one of your pieces.';
}

/** What your opponent threatens: the move they'd play if it were their turn. */
export interface Threat {
  kind: 'mate' | 'piece';
  /** Their move, as UCI and SAN. */
  uci: string;
  san: string;
  /** Squares that count as the answer: the pieces they could win, or your king for a mate. */
  squares: string[];
  /** For a piece: the most valuable one they'd win. */
  target?: { type: string; square: string };
}

/**
 * The threat in a position where it's your move (for "Spot the threat"): a mate in one, or the
 * most valuable piece of yours they could win. Undefined when there's none, or you're in check.
 */
export function threatOf(fen: string, you: Color): Threat | undefined {
  if (fen.split(' ')[1] !== you) return undefined;
  const f = nullMoveFen(fen);
  if (!f) return undefined;
  const mate = new Chess(f).moves({ verbose: true }).find((m) => m.san.endsWith('#'));
  if (mate) {
    const king = new Chess(fen).board().flat().find((p) => p && p.type === 'k' && p.color === you);
    return { kind: 'mate', uci: mate.from + mate.to + (mate.promotion ?? ''), san: mate.san, squares: king ? [king.square] : [] };
  }
  const caps = winningCaptures(f, other(you)).sort((a, b) => PIECE_VALUE[b.captured!] - PIECE_VALUE[a.captured!]);
  if (!caps.length) return undefined;
  const best = caps[0];
  return { kind: 'piece', uci: best.from + best.to, san: best.san, squares: [...new Set(caps.map((c) => c.to))], target: { type: best.captured!, square: best.to } };
}
