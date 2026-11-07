import { Chess, type Move } from 'chess.js';
import { db } from '../../db/schema';
import { positionKey } from '../pgn/parse';
import { PIECE_VALUE, materialBalance, other } from '../analysis/board';
import type { Color, GameAnalysis, MoveAnalysis, Puzzle, PuzzleStake, Score, StoredGame } from '../types';
import { NEW_CARD } from './srs';
import { repeatsOf } from './repeats';
import { backfilledMastery } from './mastery';

/**
 * Material change for `you` along a line (UCI or SAN moves from `fen`, at most 10 plies). A line
 * that stops right after a capture assumes the recapture, if there is one.
 */
function lineMaterial(fen: string, moves: string[], you: Color): number {
  const c = new Chess(fen);
  const start = materialBalance(fen, you);
  let last: Move | undefined;
  for (const mv of moves.slice(0, 10)) {
    try {
      last = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(mv) ? c.move({ from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] }) : c.move(mv);
    } catch {
      break;
    }
  }
  let bal = materialBalance(c.fen(), you);
  if (last?.captured && c.moves({ verbose: true }).some((x) => x.to === last.to && x.captured)) {
    const piece = PIECE_VALUE[last.promotion ?? last.piece];
    bal += last.color === you ? -piece : piece;
  }
  return bal - start;
}

const mateFor = (s: Score, c: Color) => s.kind === 'mate' && (c === 'w' ? s.v > 0 : s.v < 0);

/** What a mistake cost in concrete terms: material between the best line and yours, or a mate. */
export function stakeOf(m: MoveAnalysis): PuzzleStake {
  const best = lineMaterial(m.fenBefore, m.bestLineUci, m.color);
  const played = lineMaterial(m.fenBefore, [m.uci, ...m.replyLineSan], m.color);
  const mate = mateFor(m.evalBefore, m.color) ? 'missed' : mateFor(m.evalAfter, other(m.color)) ? 'allowed' : undefined;
  return { material: Math.max(0, best - played), ...(mate ? { mate } : {}) };
}

/** A big swing in win chance counts on its own, even without material or mate in the lines. */
const BIG_SWING = 25;

/**
 * A small positional puzzle: no mate and less than 2 points of material at stake, and under 25%
 * win chance. Usually there's no clear lesson in it, so it's left out of daily practice by default.
 * Puzzles not yet measured, and Lichess puzzles, never count as small.
 */
export function isSmall(p: Puzzle): boolean {
  return !p.lichess && !!p.stake && !p.stake.mate && p.stake.material < 2 && p.winLoss < BIG_SWING;
}

/** How much a puzzle matters, for putting the biggest first: win chance, plus material and mate. */
export function stakeScore(p: Puzzle): number {
  if (!p.stake) return p.winLoss;
  return p.winLoss + 4 * Math.min(p.stake.material, 9) + (p.stake.mate ? 30 : 0);
}

const DAY = 86400000;
/** Recent games first, but not strictly: up to +40 for a game played today, fading over weeks. */
const RECENT_BONUS = 40;
const RECENT_DAYS = 21;

/**
 * Which due puzzle to show first: what was at stake, a bonus for recent games (a puzzle from today
 * beats a slightly bigger one from two months ago, not a much bigger one), for the same position
 * gone wrong again, and for the same kind of mistake as in earlier games ("you've done this before").
 */
export function puzzlePriority(p: Puzzle, now = Date.now()): number {
  const played = p.playedAt ?? p.createdAt;
  const ageDays = Math.max(0, (now - played) / DAY);
  return stakeScore(p) + RECENT_BONUS * Math.exp(-ageDays / RECENT_DAYS) + 20 * (p.occurrences - 1) + 10 * Math.min(p.repeats ?? 0, 3);
}

/** Recounts, for all your puzzles, how many earlier games had the same kind of mistake; saves the changed ones. */
export async function refreshRepeats(): Promise<number> {
  const all = (await db.puzzles.toArray()).filter((p) => !p.lichess);
  const changed = all.flatMap((p) => {
    const repeats = repeatsOf(p, all);
    return repeats === p.repeats ? [] : [{ key: p.id, changes: { repeats } }];
  });
  if (changed.length) await db.puzzles.bulkUpdate(changed);
  return changed.length;
}

// Two points is often the exchange, not two pawns, so it's given as points.
const pieceWord = (n: number) => (n >= 9 ? 'a queen' : n >= 5 ? 'a rook' : n >= 3 ? 'a piece' : n >= 2 ? `${Math.round(n)} points` : 'a pawn');

/**
 * The material at stake in a few words ("Worth a piece"), or nothing. Mates aren't named here:
 * the puzzle's "Missed a mate" / "Allowed mate" tags already say so.
 */
export function stakeLabel(p: Puzzle): string | undefined {
  const s = p.stake;
  if (!s || p.lichess || s.mate) return undefined;
  if (s.material >= 1) return `Worth ${pieceWord(s.material)}`;
  return undefined;
}

/**
 * Fills in what older puzzles (and ones restored from older backups) are missing: the stake, from
 * the game's stored analysis, and when the game was played. Puzzles getting their game date for the
 * first time were scheduled with the old, short gaps; a puzzle solved once then came back the next
 * day, so that gap is stretched to the new one (4 days). Only touches puzzles that are missing
 * something, so it's cheap to call often.
 */
export async function backfillPuzzleStakes(): Promise<number> {
  const todo = await db.puzzles
    .filter((p) => !p.lichess && p.gameIds.length > 0 && (!p.stake || p.playedAt === undefined || p.solutionV !== SOLUTION_VERSION || p.mastery === undefined))
    .toArray();
  let n = 0;
  for (const p of todo) {
    const gameId = p.gameIds[p.gameIds.length - 1];
    const change: Partial<Puzzle> = {};
    if (!p.stake || p.solutionV !== SOLUTION_VERSION) {
      const a = await db.analyses.get(gameId);
      const m = a?.moves[p.plies[p.plies.length - 1]];
      if (m && m.uci === p.playedUci) {
        if (!p.stake) change.stake = stakeOf(m);
        // Puzzles made before longer solutions: the line to find is rebuilt.
        if (p.solutionV !== SOLUTION_VERSION) Object.assign(change, { solutionUci: solutionFor(m), solutionV: SOLUTION_VERSION });
      }
    }
    if (p.playedAt === undefined) {
      change.playedAt = (await db.games.get(gameId))?.endTime ?? p.createdAt;
      if (p.lastResult === 'solved' && p.reps === 1 && p.interval === 1) Object.assign(change, { interval: 4, due: p.due + 3 * DAY });
    }
    // Applied to the stored puzzle as it is now (it may have been solved since this list was read).
    await db.puzzles
      .where('id')
      .equals(p.id)
      .modify((x) => {
        Object.assign(x, change);
        // Puzzles from before mastery: credit the clean solves their schedule shows.
        if (x.mastery === undefined) x.mastery = backfilledMastery(x);
      });
    if (++n % 20 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return n + (await refreshRepeats());
}

const PUZZLE_CLASSES = new Set(['mistake', 'blunder', 'miss']);

/** Moves of the user that should become training puzzles. */
export function puzzleMoves(analysis: GameAnalysis, userColor: 'w' | 'b'): MoveAnalysis[] {
  return analysis.moves.filter(
    (m) => m.color === userColor && PUZZLE_CLASSES.has(m.classification) && m.bestLineUci.length > 0 && m.bestUci !== m.uci,
  );
}

/** Bumped when solutionFor changes, so stored puzzles get their solutions rebuilt. */
export const SOLUTION_VERSION = 2;

/**
 * The line the user has to find, always ending on a user move:
 * - a forced mate: the whole mating line (up to 3 of the user's moves);
 * - otherwise the best move, continued while the win isn't in the bag yet: as long as the next move
 *   of yours in the engine's line is forcing (a capture or a check) and wins more material once the
 *   opponent has replied (a fork: the check, then taking the queen). Up to 3 of the user's moves.
 */
export function solutionFor(m: MoveAnalysis): string[] {
  const isMate = m.evalBefore.kind === 'mate' && (m.color === 'w' ? m.evalBefore.v > 0 : m.evalBefore.v < 0);
  const line = m.bestLineUci;
  if (isMate) {
    const max = Math.min(line.length, 5);
    const len = max % 2 === 1 ? max : max - 1;
    return line.slice(0, Math.max(1, len));
  }
  if (!m.fenBefore) return line.slice(0, 1);
  const c = new Chess(m.fenBefore);
  const start = materialBalance(m.fenBefore, m.color);
  const plies: Move[] = [];
  // Material after each of the opponent's replies (index k: after your move k+1 and its answer).
  const settled: number[] = [];
  for (const uci of line.slice(0, 6)) {
    try {
      plies.push(c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined }));
    } catch {
      break;
    }
    if (plies.length % 2 === 0) settled.push(materialBalance(c.fen(), m.color) - start);
  }
  let moves = 1;
  while (moves < 3) {
    const next = plies[2 * moves];
    const after = settled[moves];
    if (!next || after === undefined || !(next.captured || next.san.includes('+')) || after <= (settled[moves - 1] ?? 0)) break;
    moves++;
  }
  return line.slice(0, 2 * moves - 1);
}

export function puzzleId(m: Pick<MoveAnalysis, 'fenBefore' | 'uci'>) {
  return `${positionKey(m.fenBefore)}|${m.uci}`;
}

export async function upsertPuzzlesFromAnalysis(game: StoredGame, analysis: GameAnalysis) {
  if (!game.userColor) return;
  const now = Date.now();
  for (const m of puzzleMoves(analysis, game.userColor)) {
    const id = puzzleId(m);
    const existing = await db.puzzles.get(id);
    const base = {
      fen: m.fenBefore,
      playedUci: m.uci,
      playedSan: m.san,
      explanation: m.explanation,
      solutionUci: solutionFor(m),
      classification: m.classification,
      motifs: m.motifs,
      phase: m.phase,
      opening: game.openingName,
      winLoss: m.winLoss,
      bestWin: m.winBefore,
      stake: stakeOf(m),
      solutionV: SOLUTION_VERSION,
      playedAt: Math.max(existing?.playedAt ?? 0, game.endTime),
    };
    if (!existing) {
      const p: Puzzle = { id, ...base, gameIds: [game.id], plies: [m.ply], occurrences: 1, createdAt: now, due: now, ...NEW_CARD, mastery: [] };
      await db.puzzles.put(p);
    } else if (!existing.gameIds.includes(game.id)) {
      // The same mistake again: count it and make the puzzle due right away.
      await db.puzzles.put({
        ...existing,
        ...base,
        gameIds: [...existing.gameIds, game.id],
        plies: [...existing.plies, m.ply],
        occurrences: existing.occurrences + 1,
        due: Math.min(existing.due, now),
      });
    } else {
      await db.puzzles.put({ ...existing, ...base });
    }
  }
  await refreshRepeats();
}
