import type { ParsedGame, ParsedPly } from '../pgn/parse';
import { isBookPosition } from '../openings/eco';
import type {
  Classification,
  Color,
  GameAnalysis,
  Motif,
  MoveAnalysis,
  Phase,
  PositionEval,
  Score,
} from '../types';
import { gameAccuracy, meanAccuracy, moveAccuracy } from './accuracy';
import {
  PIECE_NAME,
  PIECE_VALUE,
  attackersOf,
  isInCheck,
  legalMoveCount,
  materialBalance,
  nonPawnMaterial,
  nullMoveFen,
  other,
  pieceAt,
  piecesOf,
  playUci,
  winningCaptures,
} from './board';
import { winPercent, winPercentFor } from './winprob';
import { formatDuration } from '../pgn/parse';

/** Win-% loss thresholds (mover POV) for each classification. */
export const THRESHOLDS = { excellent: 2, good: 5, inaccuracy: 10, mistake: 20 } as const;

export function phaseOf(fen: string, ply: number): Phase {
  if (nonPawnMaterial(fen) <= 26) return 'endgame';
  if (ply < 24) return 'opening';
  return 'middlegame';
}

export function bestScore(e: PositionEval): Score {
  return e.lines[0]?.score ?? { kind: 'cp', v: 0 };
}

/**
 * Builds the full move-by-move analysis from engine evaluations.
 * `evals[i]` is the evaluation of the position before ply i; `evals[plies.length]` is the final position.
 */
export function buildAnalysis(gameId: string, parsed: ParsedGame, evals: PositionEval[], depth: number): GameAnalysis {
  const plies = parsed.plies;
  const scores = evals.map(bestScore);
  const whiteWin = scores.map(winPercent);
  const firstMover: Color = plies[0]?.color ?? 'w';

  const medianSpent = {
    w: median(plies.filter((p) => p.color === 'w' && p.timeSpent !== undefined).map((p) => p.timeSpent!)),
    b: median(plies.filter((p) => p.color === 'b' && p.timeSpent !== undefined).map((p) => p.timeSpent!)),
  };

  let stillBook = true;
  const moves: MoveAnalysis[] = [];
  for (let i = 0; i < plies.length; i++) {
    const p = plies[i];
    const before = evals[i];
    const after = evals[i + 1];
    const evalBefore = scores[i];
    const evalAfter = scores[i + 1];
    const winBefore = winPercentFor(evalBefore, p.color);
    const winAfter = winPercentFor(evalAfter, p.color);
    const winLoss = Math.max(0, winBefore - winAfter);
    const best = before.lines[0];
    // Converting lines to SAN is the most expensive step here, so full lines are only built for
    // inaccuracies and worse. The UI derives other lines on demand from bestLineUci.
    const lineLen = winLoss >= THRESHOLDS.good ? 8 : 1;
    const bestLine = best ? playUci(p.fenBefore, best.pv.slice(0, lineLen)) : { sans: [], fens: [], moves: [] };
    const replyLine = after.lines[0] ? playUci(p.fenAfter, after.lines[0].pv.slice(0, lineLen)) : { sans: [], fens: [], moves: [] };

    const isBook = stillBook && i < 30 && isBookPosition(p.fenAfter);
    if (!isBook) stillBook = false;

    const prev = moves[i - 1];
    const classification = classify({
      ply: p,
      before,
      winBefore,
      winAfter,
      winLoss,
      isBook,
      prevWinLoss: prev?.winLoss ?? 0,
      prevTo: prev?.uci.slice(2, 4),
    });

    const motifs: Motif[] = [];
    let explanation = '';
    if (['inaccuracy', 'mistake', 'blunder', 'miss'].includes(classification)) {
      const r = detectMotifs({ p, evalBefore, evalAfter, winBefore, winAfter, bestUci: best?.pv ?? [], replyUci: after.lines[0]?.pv ?? [] });
      motifs.push(...r.motifs);
      explanation = r.explanation;
    }
    motifs.push(...timeMotifs(p, parsed, medianSpent[p.color], classification));
    if (!explanation) explanation = defaultExplanation(classification, bestLine.sans[0]);
    const timeNote = timeExplanation(p, motifs, classification);
    if (timeNote) explanation = explanation ? `${explanation} ${timeNote}` : timeNote;

    moves.push({
      ply: i,
      moveNumber: p.moveNumber,
      color: p.color,
      san: p.san,
      uci: p.uci,
      fenBefore: p.fenBefore,
      fenAfter: p.fenAfter,
      evalBefore,
      evalAfter,
      bestUci: best?.pv[0],
      bestSan: bestLine.sans[0],
      bestLineSan: bestLine.sans,
      bestLineUci: best?.pv.slice(0, 10) ?? [],
      replyLineSan: replyLine.sans,
      winBefore,
      winAfter,
      winLoss,
      accuracy: moveAccuracy(winBefore, winAfter),
      classification,
      motifs,
      explanation,
      phase: phaseOf(p.fenBefore, i),
      isBook,
      clock: p.clock,
      timeSpent: p.timeSpent,
    });
  }

  const phaseAccuracy: GameAnalysis['phaseAccuracy'] = { w: {}, b: {} };
  for (const c of ['w', 'b'] as Color[]) {
    for (const ph of ['opening', 'middlegame', 'endgame'] as Phase[]) {
      const acc = meanAccuracy(moves.filter((m) => m.color === c && m.phase === ph).map((m) => m.accuracy));
      if (acc !== undefined) phaseAccuracy[c][ph] = acc;
    }
  }

  return {
    gameId,
    depth,
    createdAt: Date.now(),
    moves,
    accuracy: gameAccuracy(whiteWin, firstMover),
    phaseAccuracy,
    evals: scores,
  };
}

interface ClassifyInput {
  ply: ParsedPly;
  before: PositionEval;
  winBefore: number;
  winAfter: number;
  winLoss: number;
  isBook: boolean;
  prevWinLoss: number;
  prevTo?: string;
}

export function classify(c: ClassifyInput): Classification {
  const { ply, before, winBefore, winAfter, winLoss } = c;
  if (c.isBook) return 'book';
  if (legalMoveCount(ply.fenBefore) === 1) return 'forced';

  const isBest = before.lines[0]?.pv[0] === ply.uci;
  const opponentJustErred = c.prevWinLoss >= THRESHOLDS.inaccuracy;

  if (winLoss >= THRESHOLDS.mistake) return 'blunder';
  if (winLoss >= THRESHOLDS.good && opponentJustErred && winBefore >= 60) return 'miss';
  if (winLoss >= THRESHOLDS.inaccuracy) return 'mistake';
  if (winLoss >= THRESHOLDS.good) return 'inaccuracy';

  if (winLoss < THRESHOLDS.excellent && isSacrifice(ply) && winAfter >= 50 && winBefore < 97) return 'brilliant';

  if (isBest) {
    const second = before.lines[1];
    const isRecapture = c.prevTo === ply.uci.slice(2, 4);
    if (second && !isRecapture && !isInCheck(ply.fenBefore)) {
      const secondWin = winPercentFor(second.score, ply.color);
      // Only in a real fight: finding the only move when already totally winning isn't special.
      if (winAfter - secondWin >= 15 && winAfter >= 30 && winBefore < 90) return 'great';
    }
    return 'best';
  }
  if (winLoss < THRESHOLDS.excellent) return 'excellent';
  return 'good';
}

/** The moved piece (worth 3+) can be taken for free or by a cheaper piece, and it didn't just win more material. */
export function isSacrifice(ply: ParsedPly): boolean {
  const to = ply.uci.slice(2, 4);
  const moved = pieceAt(ply.fenAfter, to);
  if (!moved || PIECE_VALUE[moved.type] < 3) return false;
  const captured = pieceAt(ply.fenBefore, to);
  const opp = other(ply.color);
  const attackers = attackersOf(ply.fenAfter, to, opp);
  if (!attackers.length) return false;
  const defended = attackersOf(ply.fenAfter, to, ply.color).length > 0;
  const cheapest = Math.min(...attackers.map((sq) => PIECE_VALUE[pieceAt(ply.fenAfter, sq)?.type ?? 'k'] || 100));
  const exposed = !defended || cheapest < PIECE_VALUE[moved.type];
  const gained = captured ? PIECE_VALUE[captured.type] : 0;
  return exposed && gained < PIECE_VALUE[moved.type] - 1;
}

interface MotifInput {
  p: ParsedPly;
  evalBefore: Score;
  evalAfter: Score;
  winBefore: number;
  winAfter: number;
  bestUci: string[];
  replyUci: string[];
}

const mateFor = (s: Score, c: Color) => s.kind === 'mate' && (c === 'w' ? s.v > 0 : s.v < 0);

/** Tags an error with what went wrong, using the engine's best reply and simple board checks. */
export function detectMotifs(x: MotifInput): { motifs: Motif[]; explanation: string } {
  const { p } = x;
  const me = p.color;
  const opp = other(me);
  const motifs: Motif[] = [];
  const notes: string[] = [];
  const reply = playUci(p.fenAfter, x.replyUci.slice(0, 6));
  const r1 = reply.moves[0];

  // Mates
  if (mateFor(x.evalBefore, me) && !mateFor(x.evalAfter, me)) {
    motifs.push('missed_mate');
    const best = playUci(p.fenBefore, x.bestUci.slice(0, 1)).sans[0];
    notes.push(`You had a forced mate in ${Math.abs((x.evalBefore as { v: number }).v)}${best ? ` starting with ${best}` : ''}.`);
  }
  if (mateFor(x.evalAfter, opp) && !mateFor(x.evalBefore, opp)) {
    motifs.push('allowed_mate');
    const n = Math.abs((x.evalAfter as { v: number }).v);
    const full = playUci(p.fenAfter, x.replyUci);
    const last = full.moves[full.moves.length - 1];
    const backRank = me === 'w' ? '1' : '8';
    const king = piecesOf(p.fenAfter, me).find((pc) => pc.type === 'k');
    if (last && last.to[1] === backRank && king?.square[1] === backRank && (last.piece === 'r' || last.piece === 'q')) {
      motifs.push('back_rank');
      notes.push(`This allows a back-rank mate (${full.sans.join(' ')}). Give your king an escape square.`);
    } else {
      notes.push(`This allows mate in ${n}${r1 ? ` starting with ${r1.san}` : ''}.`);
    }
  }

  // Material lost along the opponent's best line, measured from before your move at each point where
  // you have just replied (so plain trades cancel out). The worst point counts.
  const checkpoints = [2, 4, 6].filter((k) => k <= reply.fens.length);
  if (!checkpoints.length && reply.fens.length) checkpoints.push(reply.fens.length);
  const balBefore = materialBalance(p.fenBefore, me);
  let lost = 0;
  let lostAt = 0;
  for (const k of checkpoints) {
    const l = balBefore - materialBalance(reply.fens[k - 1], me);
    if (l > lost) {
      lost = l;
      lostAt = k;
    }
  }
  const plies = lostAt || checkpoints[checkpoints.length - 1] || 0;

  if (!motifs.includes('allowed_mate') && r1 && lost >= 2) {
    const movedTo = p.uci.slice(2, 4);
    const threatsBefore = (() => {
      const nf = nullMoveFen(p.fenBefore);
      return nf ? winningCaptures(nf, opp) : [];
    })();
    if (r1.captured) {
      const alreadyThreatened = threatsBefore.some((t) => t.to === r1.to && t.to !== p.uci.slice(0, 2));
      const defended = attackersOf(p.fenAfter, r1.to, me).length > 0;
      const cheaper = PIECE_VALUE[r1.piece] < PIECE_VALUE[r1.captured];
      const name = PIECE_NAME[r1.captured];
      if (alreadyThreatened && r1.to !== movedTo) {
        motifs.push('ignored_threat');
        notes.push(`Your ${name} on ${r1.to} was already under attack and ${p.san} didn't deal with it: ${r1.san} wins it.`);
      } else if (!defended || cheaper) {
        motifs.push('hung_piece');
        notes.push(
          r1.to === movedTo
            ? `${p.san} puts your ${name} on a square where ${r1.san} simply takes it.`
            : `This leaves your ${name} on ${r1.to} ${defended ? 'attacked by a cheaper piece' : 'undefended'}: ${r1.san}.`,
        );
      }
    }
    if (!motifs.includes('hung_piece') && !motifs.includes('ignored_threat')) {
      const forked = forkTargets(reply.fens[0], r1.to, me);
      if (forked.length >= 2) {
        motifs.push('allowed_fork');
        notes.push(`${r1.san} forks your ${forked.map((f) => PIECE_NAME[f.type]).join(' and ')}.`);
      } else {
        motifs.push('allowed_tactic');
        notes.push(`After ${reply.sans.slice(0, plies).join(' ')} you lose material (${lost} points).`);
      }
    }
  }

  // Missed chances
  if (!motifs.includes('missed_mate') && x.bestUci.length) {
    const best = playUci(p.fenBefore, x.bestUci.slice(0, 5));
    const n = best.fens.length >= 5 ? 5 : best.fens.length >= 3 ? 3 : best.fens.length;
    if (n) {
      const gained = materialBalance(best.fens[n - 1], me) - materialBalance(p.fenBefore, me);
      if (gained >= 2 && lost < 2) {
        motifs.push('missed_win');
        notes.push(`${best.sans[0]} would have won material (${best.sans.slice(0, n).join(' ')}).`);
      }
    }
  }
  if (x.winBefore >= 75 && x.winAfter <= 55) {
    motifs.push('threw_advantage');
    if (!notes.length) notes.push('This throws away a winning advantage.');
  }

  // No material or mate involved: either the king got exposed or it's a positional concession.
  const tactical = motifs.some((m) => m !== 'threw_advantage');
  if (!tactical && x.winBefore - x.winAfter >= THRESHOLDS.inaccuracy) {
    const checks = reply.moves.slice(0, 6).filter((m) => m.color === opp && m.san.includes('+')).length;
    if (checks >= 2) {
      motifs.push('king_safety');
      notes.push(`This exposes your king: ${reply.sans.slice(0, 4).join(' ')} and the checks keep coming.`);
    } else {
      motifs.push('positional');
      const best = playUci(p.fenBefore, x.bestUci.slice(0, 1)).sans[0];
      if (!notes.length)
        notes.push(
          `No material is lost right away, but this gives your opponent the better game${reply.sans[0] ? ` (${reply.sans.slice(0, 3).join(' ')})` : ''}.${best ? ` ${best} kept more of your advantage.` : ''}`,
        );
    }
  }

  return { motifs, explanation: notes.join(' ') };
}

/** Pieces of `victim` worth 3+ (or the king) attacked by the piece standing on `square`. */
function forkTargets(fen: string | undefined, square: string, victim: Color) {
  if (!fen) return [];
  const attacker = pieceAt(fen, square);
  if (!attacker) return [];
  return piecesOf(fen, victim).filter(
    (pc) =>
      (pc.type === 'k' || PIECE_VALUE[pc.type] >= 3) &&
      (pc.type === 'k' || PIECE_VALUE[pc.type] > PIECE_VALUE[attacker.type] || attackersOf(fen, pc.square, victim).length === 0) &&
      attackersOf(fen, pc.square, other(victim)).includes(square),
  );
}

function timeMotifs(p: ParsedPly, parsed: ParsedGame, medianSpent: number, cls: Classification): Motif[] {
  const tc = parsed.timeControl;
  if (!tc || p.timeSpent === undefined) return [];
  const out: Motif[] = [];
  const clockBefore = (p.clock ?? 0) + p.timeSpent - tc.increment;
  const isError = cls === 'mistake' || cls === 'blunder' || cls === 'miss';
  if (clockBefore <= Math.max(0.1 * tc.base, 10)) out.push('time_trouble');
  else if (isError && p.timeSpent <= Math.max(1.5, 0.01 * tc.base) && tc.base >= 180 && p.ply >= 16) out.push('rushed');
  if (p.timeSpent >= Math.max(3 * medianSpent, 0.1 * tc.base) && p.timeSpent >= 10) out.push('long_think');
  return out;
}

function timeExplanation(p: ParsedPly, motifs: Motif[], cls: Classification): string {
  const isError = cls === 'mistake' || cls === 'blunder' || cls === 'miss';
  if (!isError) return '';
  if (motifs.includes('long_think')) return `You spent ${formatDuration(p.timeSpent)} here and still went wrong.`;
  if (motifs.includes('rushed')) return `Played in ${formatDuration(p.timeSpent)}: slow down in sharp positions.`;
  if (motifs.includes('time_trouble')) return `You were low on time (${formatDuration((p.clock ?? 0) + (p.timeSpent ?? 0))} left).`;
  return '';
}

function defaultExplanation(cls: Classification, bestSan?: string): string {
  switch (cls) {
    case 'brilliant':
      return 'A strong sacrifice!';
    case 'great':
      return 'The only good move here.';
    case 'best':
      return 'The best move.';
    case 'book':
      return 'An opening book move.';
    case 'forced':
      return 'The only legal move.';
    case 'excellent':
    case 'good':
      return bestSan ? `Fine. The engine slightly preferred ${bestSan}.` : '';
    default:
      return bestSan ? `Better was ${bestSan}.` : '';
  }
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
