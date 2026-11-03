import { Chess, type Move, type Square } from 'chess.js';
import { PIECE_NAME, PIECE_VALUE, nullMoveFen } from '../analysis/board';
import type { Color } from '../types';

/*
 * Moves and lines in words, worked out from the board, so the model never has to read notation:
 * "You: bishop d6-b4 (Bb4), attacking White's queen on c3." The first trial showed that, given
 * bare notation, the model often mixed up whose move it was, which piece moved and what was won.
 */

const side = (c: Color, you: Color, opp: string) => (c === you ? 'You' : opp);
const owner = (c: Color, you: Color, opp: string) => (c === you ? 'your' : `${opp}'s`);

/** The opponent's pieces worth naming that the piece on `square` attacks after the move. */
function attacksOf(fenAfter: string, square: string, mover: Color): { type: string; square: string; defended: boolean }[] {
  // Ask chess.js which captures the moved piece would have if it could move again.
  const fen = fenAfter.split(' ')[1] === mover ? fenAfter : nullMoveFen(fenAfter);
  if (!fen) return [];
  const c = new Chess(fen);
  const them: Color = mover === 'w' ? 'b' : 'w';
  return c
    .moves({ square: square as Square, verbose: true })
    .filter((m) => m.captured)
    .map((m) => ({ type: m.captured!, square: m.to, defended: c.attackers(m.to as Square, them).length > 0 }))
    .filter((a) => a.type === 'k' || a.type === 'q' || !a.defended || PIECE_VALUE[a.type] > PIECE_VALUE[c.get(square as Square)?.type ?? 'p']);
}

/** One move in words: "You: bishop d6-b4 (Bb4), attacking White's queen on c3." */
export function describeMove(m: Move, you: Color, opp: string): string {
  const parts = [`${side(m.color as Color, you, opp)}: ${PIECE_NAME[m.piece]} ${m.from}-${m.to} (${m.san})`];
  if (m.captured) parts.push(`takes ${owner(m.color === 'w' ? 'b' : 'w', you, opp)} ${PIECE_NAME[m.captured]} on ${m.to}`);
  if (m.promotion) parts.push(`promotes to a ${PIECE_NAME[m.promotion]}`);
  if (m.san.includes('#')) parts.push('checkmate');
  else if (m.san.includes('+')) parts.push('check');
  else if (!m.captured) {
    // What a quiet move goes after (for captures, what was taken is the point).
    const hits = attacksOf(m.after, m.to, m.color as Color).filter((a) => a.type !== 'k');
    if (hits.length)
      parts.push(
        `attacking ${hits.map((h) => `${owner(m.color === 'w' ? 'b' : 'w', you, opp)} ${PIECE_NAME[h.type]} on ${h.square}${h.defended ? '' : ' (undefended)'}`).join(' and ')}`,
      );
  }
  return `${parts[0]}${parts.length > 1 ? `, ${parts.slice(1).join(', ')}` : ''}.`;
}

/** Material won and lost over a line, in words: "White loses a rook and a rook; you lose a rook and a knight. Net: you +2." */
function outcome(moves: Move[], you: Color, opp: string): string {
  if (!moves.length) return '';
  const last = moves[moves.length - 1];
  if (last.san.includes('#')) return `${side(last.color as Color, you, opp)} ${last.color === you ? 'give' : 'gives'} checkmate.`;
  const lost: Record<Color, string[]> = { w: [], b: [] };
  let net = 0;
  for (const m of moves) {
    if (!m.captured) continue;
    const victim: Color = m.color === 'w' ? 'b' : 'w';
    lost[victim].push(PIECE_NAME[m.captured]);
    net += (victim === you ? -1 : 1) * PIECE_VALUE[m.captured];
  }
  const them: Color = you === 'w' ? 'b' : 'w';
  if (!lost.w.length && !lost.b.length) return 'Nothing is captured in this line.';
  const list = (xs: string[]) => (xs.length ? xs.join(', ') : 'nothing');
  return `In this line ${opp} loses: ${list(lost[them])}. You lose: ${list(lost[you])}. Net material: ${net === 0 ? 'even' : `you are ${Math.abs(net)} point${Math.abs(net) === 1 ? '' : 's'} ${net > 0 ? 'up' : 'down'}`}.`;
}

/**
 * A line (SAN or UCI moves from `fen`) as numbered sentences plus what it wins. Stops at the first
 * illegal move. `max` caps the length; the material count covers the moves shown.
 */
export function describeLine(fen: string, moves: string[], you: Color, opp: string, max = 6): { steps: string[]; outcome: string } {
  const c = new Chess(fen);
  const played: Move[] = [];
  for (const mv of moves.slice(0, max)) {
    try {
      played.push(/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(mv) ? c.move({ from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] }) : c.move(mv));
    } catch {
      break;
    }
  }
  const last = played[played.length - 1];
  // A line cut off right after a capture may be missing the recapture.
  const caveat = last?.captured && !last.san.includes('#') ? ' (The line stops right after a capture, so this may not be the final count.)' : '';
  return { steps: played.map((m) => describeMove(m, you, opp)), outcome: outcome(played, you, opp) + caveat };
}

/** What the best move aims at, for hints: the piece it moves and what it captures or attacks. */
export function hintTarget(fen: string, san: string | undefined, you: Color, opp: string) {
  if (!san) return undefined;
  const c = new Chess(fen);
  let m: Move;
  try {
    m = c.move(san);
  } catch {
    return undefined;
  }
  const them: Color = m.color === 'w' ? 'b' : 'w';
  const theirs = owner(them, you, opp);
  const kind = m.san.includes('#') ? 'a checkmate' : m.san.includes('+') ? 'a check' : m.captured ? 'a capture' : 'a quiet move';
  const targets = m.captured
    ? [`${theirs} ${PIECE_NAME[m.captured]} on ${m.to}`]
    : attacksOf(m.after, m.to, m.color as Color).map((a) => (a.type === 'k' ? `${theirs} king` : `${theirs} ${PIECE_NAME[a.type]} on ${a.square}${a.defended ? '' : ' (undefended)'}`));
  return {
    /** Level 1: what kind of move and what it goes after. */
    kind,
    targets,
    /** Level 2: which piece does it (from where). */
    piece: `${owner(m.color as Color, you, opp)} ${PIECE_NAME[m.piece]} on ${m.from}`,
  };
}
