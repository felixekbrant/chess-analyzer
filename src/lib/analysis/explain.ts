import { Chess, type Move } from 'chess.js';
import { PIECE_NAME, PIECE_VALUE, attackersOf, forkTargets, materialBalance, nullMoveFen, other, piecesOf, readonlyChess, winningCaptures } from './board';
import type { Color, Phase } from '../types';

/**
 * What a move does, in words, computed from the board and the engine's line (no AI model): what it
 * takes, forks, attacks, threatens, defends or rescues. Always true about the position, and written
 * for the player `me` reading it: their own pieces are "your", the other side's "their".
 */

export interface IdeaOptions {
  phase?: Phase;
  /** Only forcing ideas (captures, forks, checks, threats, mate): for an opponent's reply. */
  forcing?: boolean;
  /** Leave out the material won along the line (said elsewhere). */
  noGain?: boolean;
}

/** "a pawn", "2 points", "a piece", "a rook", "a queen" (2 points is often the exchange). */
export function materialWord(n: number): string {
  return n >= 9 ? 'a queen' : n >= 5 ? 'a rook' : n >= 3 ? 'a piece' : n >= 2 ? `${Math.round(n)} points` : 'a pawn';
}

const uciMove = (u: string) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });

/** "your bishop on e5", "their rook on a8", "their queen" (a queen or king needs no square). */
function nameOf(type: string, square: string, owner: Color, me: Color, undefended = false): string {
  const whose = owner === me ? 'your' : 'their';
  const piece = PIECE_NAME[type];
  if (type === 'k') return `${whose} king`;
  return `${whose} ${undefended ? 'undefended ' : ''}${piece}${type === 'q' ? '' : ` on ${square}`}`;
}

function listWords(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  // A comma before the last "and" when a part has its own "and" ("forks your king and rook, and wins…").
  const sep = xs.slice(0, -1).some((x) => x.includes(' and ')) ? ', and ' : ' and ';
  return `${xs.slice(0, -1).join(', ')}${sep}${xs[xs.length - 1]}`;
}

const PLURAL: Record<string, string> = { p: 'pawns', n: 'knights', b: 'bishops', r: 'rooks', q: 'queens' };

/** Material the mover wins along the line, judged where it's quiet (not right after a capture), and the moves up to there. */
function lineGain(fen: string, line: string[], mover: Color): { gain: number; sans: string[] } {
  const c = new Chess(fen);
  const start = materialBalance(fen, mover);
  const fens: string[] = [];
  const moves: Move[] = [];
  for (const u of line.slice(0, 7)) {
    try {
      moves.push(c.move(uciMove(u)));
      fens.push(c.fen());
    } catch {
      break;
    }
  }
  let n = Math.min(5, fens.length);
  while (n > 0 && moves[n]?.captured) n--;
  return { gain: n ? materialBalance(fens[n - 1], mover) - start : 0, sans: moves.slice(0, n).map((m) => m.san) };
}

function isPassed(fen: string, square: string, color: Color): boolean {
  const file = square.charCodeAt(0);
  const rank = Number(square[1]);
  const ahead = (r: number) => (color === 'w' ? r > rank : r < rank);
  return !piecesOf(fen, other(color)).some((p) => p.type === 'p' && Math.abs(p.square.charCodeAt(0) - file) <= 1 && ahead(Number(p.square[1])));
}

const mateInOne = (fen: string) => readonlyChess(fen).moves({ verbose: true }).find((m) => m.san.endsWith('#'));

/**
 * The idea of `line[0]` played from `fen`, as a clause to follow its SAN: "takes the undefended
 * knight on f6 and attacks the queen", "forks your king and your rook on a1", "defends your bishop
 * on e5". `line` is the engine's line from `fen` (the move first); undefined when there's nothing
 * concrete to say.
 */
export function moveIdea(fen: string, line: string[], me: Color, opts: IdeaOptions = {}): string | undefined {
  if (!line.length) return undefined;
  const c = new Chess(fen);
  const mover = c.turn() as Color;
  const opp = other(mover);
  let mv: Move;
  try {
    mv = c.move(uciMove(line[0]));
  } catch {
    return undefined;
  }
  const after = c.fen();
  if (c.isCheckmate()) return 'is checkmate';

  // A forced mate along the line.
  const full = new Chess(fen);
  const sans: string[] = [];
  for (const u of line) {
    try {
      sans.push(full.move(uciMove(u)).san);
    } catch {
      break;
    }
  }
  if (sans.length === line.length && full.isCheckmate() && full.turn() === opp && sans.length <= 7) return `starts a forced mate (${sans.join(' ')})`;

  const clauses: string[] = [];
  const check = mv.san.includes('+');
  let gainSaid = 0;

  if (mv.captured) {
    const recapture = attackersOf(after, mv.to, opp).length > 0;
    const victim = nameOf(mv.captured, mv.to, opp, me);
    if (!recapture) {
      clauses.push(`wins ${victim} for free`);
      gainSaid = PIECE_VALUE[mv.captured];
    } else if (PIECE_VALUE[mv.captured] > PIECE_VALUE[mv.piece]) {
      clauses.push(`wins ${victim} for ${mv.piece === 'p' ? 'a pawn' : `a ${PIECE_NAME[mv.piece]}`}`);
      gainSaid = PIECE_VALUE[mv.captured] - PIECE_VALUE[mv.piece];
    } else if (mv.captured === mv.piece && mv.piece !== 'p') clauses.push(`trades ${PLURAL[mv.piece]}`);
    else clauses.push(`takes ${victim}`);
  }
  if (mv.promotion) clauses.push(`promotes to a ${PIECE_NAME[mv.promotion]}`);

  // The king first, then the most valuable.
  const forked = forkTargets(after, mv.to, opp).sort((a, b) => (b.type === 'k' ? 99 : PIECE_VALUE[b.type]) - (a.type === 'k' ? 99 : PIECE_VALUE[a.type]));
  if (forked.length >= 2) {
    // "forks their king and rook on h1": the owner said once.
    clauses.push(`forks ${listWords(forked.map((f, i) => nameOf(f.type, f.square, opp, me).replace(i ? /^(your|their) / : /^$/, '')))}`);
  } else {
    // Threats: what the mover could win next if the other side did nothing.
    const again = nullMoveFen(after);
    if (again) {
      const mate = mateInOne(again);
      if (mate) clauses.push(`threatens mate with ${mate.san}`);
      else {
        const had = new Set(winningCaptures(fen, mover).map((m) => m.to));
        const fresh = winningCaptures(again, mover)
          .filter((m) => !had.has(m.to) && m.to !== mv.to)
          .sort((a, b) => PIECE_VALUE[b.captured!] - PIECE_VALUE[a.captured!]);
        if (fresh.length) {
          const t = fresh[0];
          const undefended = attackersOf(again, t.to, opp).length === 0;
          clauses.push(`attacks ${nameOf(t.captured!, t.to, opp, me, undefended)}`);
        }
      }
    }
  }

  // A check forces the reply, so what it happens to defend isn't the point.
  if (!opts.forcing && !check && clauses.length < 2) {
    // Defence: what the other side threatened before the move, and no longer can.
    const before = nullMoveFen(fen);
    if (before) {
      const theirMate = mateInOne(before);
      if (theirMate && !mateInOne(after)) clauses.push(`stops ${theirMate.san}`);
      else {
        const still = new Set(winningCaptures(after, opp).map((m) => m.to));
        const saved = winningCaptures(before, opp)
          .filter((t) => !still.has(t.to === mv.from ? mv.to : t.to) && !(mv.captured && t.from === mv.to))
          .sort((a, b) => PIECE_VALUE[b.captured!] - PIECE_VALUE[a.captured!]);
        const s = saved[0];
        if (s) {
          if (s.to === mv.from) clauses.push(`moves ${nameOf(mv.piece, mv.from, mover, me)} out of the attack`.replace(/ on [a-h][1-8] out/, ' out'));
          else clauses.push(`defends ${nameOf(s.captured!, s.to, mover, me)}`);
        }
      }
    }
  }

  if (!opts.forcing && !clauses.length) {
    const kingSide = mover === me ? 'your' : 'their';
    const backRank = mover === 'w' ? '1' : '8';
    const king = piecesOf(fen, mover).find((p) => p.type === 'k');
    if (mv.flags.includes('k') || mv.flags.includes('q')) clauses.push(`castles, bringing ${kingSide} king to safety`);
    else if (mv.piece === 'p' && king && boxedIn(fen, king.square, mover) && Math.abs(mv.from.charCodeAt(0) - king.square.charCodeAt(0)) <= 1)
      clauses.push(`gives ${kingSide} king an escape square`);
    else if (mv.piece === 'p' && isPassed(after, mv.to, mover)) clauses.push('pushes the passed pawn');
    else if (opts.phase === 'opening' && (mv.piece === 'n' || mv.piece === 'b') && mv.from[1] === backRank) clauses.push(`develops the ${PIECE_NAME[mv.piece]}`);
  }

  if (check) {
    if (clauses.length) clauses[0] += ' with check';
    else clauses.push('gives check');
  }
  // At most two ideas, then what the line wins.
  clauses.splice(2);

  if (!opts.noGain) {
    const { gain, sans } = lineGain(fen, line, mover);
    if (gain >= 1 && gain >= gainSaid + 1)
      clauses.push(clauses.length ? `in the end wins ${materialWord(gain)}` : `starts a line that wins ${materialWord(gain)} (${sans.join(' ')})`);
  }
  // "gives check" on its own says nothing the move doesn't.
  if (!clauses.length || (clauses.length === 1 && clauses[0] === 'gives check')) return undefined;
  return listWords(clauses);
}

/**
 * A castled king (not on its starting square) with no way off the back rank: the squares in front of
 * it are all taken by its own pieces. Then a pawn move beside it is "an escape square".
 */
function boxedIn(fen: string, king: string, color: Color): boolean {
  const back = color === 'w' ? '1' : '8';
  if (king[1] !== back || king[0] === 'e' || king[0] === 'd') return false;
  const front = color === 'w' ? '2' : '7';
  const own = new Set(piecesOf(fen, color).map((p) => p.square));
  const f = king.charCodeAt(0);
  return [f - 1, f, f + 1].filter((x) => x >= 97 && x <= 104).every((x) => own.has(String.fromCharCode(x) + front) || own.has(String.fromCharCode(x) + back));
}

/** The same from a line in SAN (as stored for replies). */
export function moveIdeaSan(fen: string, sans: string[], me: Color, opts: IdeaOptions = {}): string | undefined {
  const c = new Chess(fen);
  const ucis: string[] = [];
  for (const s of sans) {
    try {
      const m = c.move(s);
      ucis.push(m.from + m.to + (m.promotion ?? ''));
    } catch {
      break;
    }
  }
  return moveIdea(fen, ucis, me, opts);
}
