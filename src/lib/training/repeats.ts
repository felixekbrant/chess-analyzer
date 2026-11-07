import { db } from '../../db/schema';
import type { MoveAnalysis, Motif, Puzzle, StoredGame } from '../types';
import { MOTIF_LABEL } from '../insights/compute';
import { positionKey } from '../pgn/parse';

/**
 * The kind of mistake, for spotting when you make the same one again: the most specific tactical
 * motif. Positional and clock motifs are too common to say "you've done this before".
 */
const KEY_MOTIFS: Motif[] = ['allowed_mate', 'back_rank', 'missed_mate', 'allowed_fork', 'hung_piece', 'ignored_threat', 'allowed_tactic', 'missed_win', 'king_safety'];

export function keyMotif(motifs: Motif[]): Motif | undefined {
  return KEY_MOTIFS.find((m) => motifs.includes(m));
}

const DAY = 86400000;
/** How far back an earlier mistake of the same kind counts as "recently". */
export const REPEAT_DAYS = 60;

/** Your puzzles from earlier games with the same kind of mistake, latest first. */
export function earlierOfKind(puzzles: Puzzle[], motif: Motif, before: number, gameId?: string): Puzzle[] {
  return puzzles
    .filter((p) => !p.lichess && keyMotif(p.motifs) === motif && (p.playedAt ?? p.createdAt) < before && (p.playedAt ?? p.createdAt) >= before - REPEAT_DAYS * DAY && (!gameId || !p.gameIds.includes(gameId)))
    .sort((a, b) => (b.playedAt ?? b.createdAt) - (a.playedAt ?? a.createdAt));
}

/** How many earlier games (in the last 60 days before it) had the same kind of mistake as this puzzle. */
export function repeatsOf(p: Puzzle, all: Puzzle[]): number {
  const motif = keyMotif(p.motifs);
  if (!motif || p.lichess) return 0;
  const at = p.playedAt ?? p.createdAt;
  const games = new Set(earlierOfKind(all, motif, at, p.gameIds[p.gameIds.length - 1]).flatMap((x) => x.gameIds));
  for (const id of p.gameIds) games.delete(id);
  return games.size;
}

/** "Hung a piece" → "hung a piece", for use inside a sentence. */
export const kindText = (m: Motif) => MOTIF_LABEL[m][0].toLowerCase() + MOTIF_LABEL[m].slice(1);

export interface Repeat {
  /** The same position and move as before, or the same kind of mistake in another position. */
  same: 'position' | 'kind';
  motif?: Motif;
  /** The latest earlier game with it. */
  gameId: string;
  ply: number;
  opponent: string;
  at: number;
  /** Earlier games with it (in the 60 days before, for the same kind). */
  games: number;
}

/** Whether your mistake in a game repeats one from your earlier games, and the latest of those. */
export async function findRepeat(game: StoredGame, m: MoveAnalysis): Promise<Repeat | null> {
  const opponentOf = (g: StoredGame) => (g.userColor === 'w' ? g.black : g.white);
  const exact = await db.puzzles.get(`${positionKey(m.fenBefore)}|${m.uci}`);
  if (exact) {
    const earlier = (await db.games.bulkGet(exact.gameIds)).filter((g): g is StoredGame => !!g && g.id !== game.id && g.endTime < game.endTime);
    const last = earlier.sort((a, b) => b.endTime - a.endTime)[0];
    if (last) return { same: 'position', gameId: last.id, ply: exact.plies[exact.gameIds.indexOf(last.id)], opponent: opponentOf(last), at: last.endTime, games: earlier.length };
  }
  const motif = keyMotif(m.motifs);
  if (!motif) return null;
  const earlier = earlierOfKind(await db.puzzles.toArray(), motif, game.endTime, game.id);
  if (!earlier.length) return null;
  const p = earlier[0];
  const gameId = p.gameIds[p.gameIds.length - 1];
  const g = await db.games.get(gameId);
  if (!g) return null;
  const games = new Set(earlier.flatMap((x) => x.gameIds).filter((id) => id !== game.id)).size;
  return { same: 'kind', motif, gameId, ply: p.plies[p.plies.length - 1], opponent: opponentOf(g), at: g.endTime, games };
}
