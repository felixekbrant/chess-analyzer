import { Chess } from 'chess.js';
import { db } from '../../db/schema';
import type { SkillArea } from '../insights/skills';
import type { Phase, Puzzle, StoredGame } from '../types';

// Extra puzzles for the focus drill from the Lichess puzzle database (CC0, database.lichess.org).
// scripts/lichess-puzzles/build.py writes one small pack per skill area and rating band into
// public/puzzles/; a pack is downloaded the first time a drill needs more puzzles than your own
// games provide, and the puzzles it adds are kept in the extPuzzles table (with their own repetition
// schedule), so drills keep working offline.

/** Areas with a pack. Time management is about the clock, not positions. */
export const PACK_AREAS: SkillArea[] = ['blunder_check', 'opp_tactics', 'chances', 'opening', 'converting', 'defending', 'endgame', 'middlegame'];
/** Lower bounds of the packs' puzzle-rating bands (see build.py). */
export const BANDS = [0, 1000, 1300, 1600, 1900, 2200];
/**
 * Lichess puzzle ratings run higher than chess.com game ratings: a typical 1200 player solves
 * ~1400-rated puzzles comfortably. Aim a little above that so drills stretch you.
 */
const PUZZLE_OFFSET = 250;

/** One row of a pack: [Lichess id, FEN before the opponent's move, moves (uci, space separated), rating, themes]. */
export type PackRow = [string, string, string, number, string];

export interface Pack {
  area: SkillArea;
  min: number;
  max: number;
  puzzles: PackRow[];
}

/** The player's current rating: median of the latest timed games (daily ratings are a different pool). */
export function playerRating(games: StoredGame[]): number | undefined {
  const all = games.filter((g) => g.userColor && (g.userColor === 'w' ? g.whiteElo : g.blackElo));
  const timed = all.filter((g) => g.timeClass !== 'daily');
  const rated = (timed.length ? timed : all)
    .sort((a, b) => b.endTime - a.endTime)
    .slice(0, 15)
    .map((g) => (g.userColor === 'w' ? g.whiteElo! : g.blackElo!))
    .sort((a, b) => a - b);
  return rated.length ? rated[Math.floor(rated.length / 2)] : undefined;
}

/** The puzzle rating a drill aims for, and the pack band that contains it. */
export function targetRating(rating: number | undefined): number {
  return (rating ?? 1200) + PUZZLE_OFFSET;
}

export function bandFor(target: number): number {
  return [...BANDS].reverse().find((b) => target >= b) ?? 0;
}

const PHASES: Phase[] = ['opening', 'endgame', 'middlegame'];

/**
 * Turns a pack row into a puzzle. The first Lichess move is the opponent's: it is played to reach
 * the puzzle position and highlighted as the last move; the rest is the solution.
 */
export function toPuzzle(row: PackRow, area: SkillArea, now = Date.now()): Puzzle | undefined {
  const [id, fen, moves, rating, themes] = row;
  const [setup, ...solution] = moves.split(' ');
  if (!setup || !solution.length) return undefined;
  const c = new Chess(fen);
  try {
    c.move({ from: setup.slice(0, 2), to: setup.slice(2, 4), promotion: setup[4] });
  } catch {
    return undefined;
  }
  const tags = themes.split(' ');
  return {
    id: `lichess:${id}`,
    fen: c.fen(),
    gameIds: [],
    plies: [],
    playedUci: '',
    playedSan: '',
    solutionUci: solution,
    classification: 'best',
    motifs: [],
    phase: PHASES.find((p) => tags.includes(p)) ?? 'middlegame',
    winLoss: 0,
    bestWin: 100,
    occurrences: 1,
    createdAt: now,
    due: now,
    interval: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    lichess: { id, rating, themes: tags, area, lastMove: setup },
  };
}

/** Lichess puzzles of an area that are ready to play (new or due again), oldest first. */
export function readyExt(ext: Puzzle[], area: SkillArea, now = Date.now()): Puzzle[] {
  return ext.filter((p) => p.lichess?.area === area && p.due <= now).sort((a, b) => a.due - b.due || a.createdAt - b.createdAt);
}

export async function fetchPack(area: SkillArea, band: number, fetcher: typeof fetch = fetch): Promise<Pack> {
  const res = await fetcher(`${import.meta.env.BASE_URL}puzzles/${area}-${band}.json`);
  if (!res.ok) throw new Error(`Puzzle pack ${area}-${band}: ${res.status}`);
  return res.json();
}

/** Pack puzzles not stored yet, closest to the target rating first. */
export function pickNew(pack: Pack, have: Set<string>, target: number, count: number, now = Date.now()): Puzzle[] {
  const out: Puzzle[] = [];
  const rows = [...pack.puzzles].sort((a, b) => Math.abs(a[3] - target) - Math.abs(b[3] - target));
  for (const row of rows) {
    if (out.length >= count) break;
    if (have.has(`lichess:${row[0]}`)) continue;
    const p = toPuzzle(row, pack.area, now + out.length);
    if (p) out.push(p);
  }
  return out;
}

const inFlight = new Map<string, Promise<number>>();

/**
 * Adds `missing` Lichess puzzles to the drill for `area`, downloading the matching pack (once; the
 * browser caches it). Returns how many were added; offline or on any error it simply adds none.
 */
export function topUpDrill(area: SkillArea, rating: number | undefined, missing: number): Promise<number> {
  if (!PACK_AREAS.includes(area) || missing <= 0) return Promise.resolve(0);
  const running = inFlight.get(area);
  if (running) return running;
  const job = (async () => {
    const now = Date.now();
    const ext = await db.extPuzzles.where('area').equals(area).toArray();
    const target = targetRating(rating);
    let band = bandFor(target);
    const have = new Set(ext.map((p) => p.id));
    const added: Puzzle[] = [];
    // If a band is used up, carry on with the next harder one (then easier ones).
    const order = [band, ...BANDS.filter((b) => b > band), ...BANDS.filter((b) => b < band).reverse()];
    for (band of order) {
      const pack = await fetchPack(area, band);
      added.push(...pickNew(pack, have, target, missing - added.length, now));
      if (added.length >= missing) break;
    }
    await db.extPuzzles.bulkPut(added.map((p) => ({ ...p, area })));
    return added.length;
  })()
    .catch(() => 0)
    .finally(() => inFlight.delete(area));
  inFlight.set(area, job);
  return job;
}
