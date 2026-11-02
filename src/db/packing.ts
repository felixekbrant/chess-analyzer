import { Chess } from 'chess.js';
import type { GameAnalysis, MoveAnalysis } from '../lib/types';

// Stored analyses are packed to about half their size (analyses are by far the biggest thing in the
// database: ~57 KB per game before). The rest of the app never sees the packed form: the database
// middleware in schema.ts packs on write and unpacks on read.
//
// Packing is lossless:
//  - per-move objects become columns (one array per field), so field names aren't repeated per move;
//  - fields that duplicate other data are left out and rebuilt: positions (replayed from the moves),
//    evalBefore/evalAfter (= evals[i], evals[i+1]), bestUci/bestSan (= first move of the best line);
//  - anything that wouldn't be rebuilt exactly is simply kept, so unpack(pack(a)) always equals a.

export interface PackedAnalysis extends Omit<GameAnalysis, 'moves'> {
  packed: 1;
  /** Number of moves. */
  n: number;
  /** Position before the first move (only needed when positions are rebuilt). */
  startFen?: string;
  /** Which derived fields were left out. */
  derived: { fens: boolean; evals: boolean; best: boolean };
  cols: Record<string, unknown[]>;
}

const isPacked = (x: unknown): x is PackedAnalysis => !!x && (x as PackedAnalysis).packed === 1;

/** Positions before/after each move, replayed from the first position and the moves. */
function replay(startFen: string, ucis: string[]): string[] | null {
  try {
    const c = new Chess(startFen);
    const fens = [c.fen()];
    for (const u of ucis) {
      c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      fens.push(c.fen());
    }
    return fens;
  } catch {
    return null;
  }
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

export function packAnalysis(a: GameAnalysis | PackedAnalysis): GameAnalysis | PackedAnalysis {
  if (isPacked(a) || !a.moves?.length) return a;
  const moves = a.moves;
  const fens = replay(moves[0].fenBefore, moves.map((m) => m.uci));
  const derived = {
    fens: !!fens && moves.every((m, i) => m.fenBefore === fens[i] && m.fenAfter === fens[i + 1]),
    evals: moves.every((m, i) => same(m.evalBefore, a.evals[i]) && same(m.evalAfter, a.evals[i + 1])),
    best: moves.every((m) => m.bestUci === m.bestLineUci?.[0] && m.bestSan === m.bestLineSan?.[0]),
  };
  const drop = new Set<string>([
    ...(derived.fens ? ['fenBefore', 'fenAfter'] : []),
    ...(derived.evals ? ['evalBefore', 'evalAfter'] : []),
    ...(derived.best ? ['bestUci', 'bestSan'] : []),
  ]);
  const keys = [...new Set(moves.flatMap((m) => Object.keys(m)))].filter((k) => !drop.has(k));
  const cols: Record<string, unknown[]> = {};
  for (const k of keys) cols[k] = moves.map((m) => (m as unknown as Record<string, unknown>)[k]);
  const { moves: _moves, ...rest } = a;
  void _moves;
  return { ...rest, packed: 1, n: moves.length, startFen: derived.fens ? moves[0].fenBefore : undefined, derived, cols };
}

export function unpackAnalysis<T>(x: T): T {
  if (!isPacked(x)) return x;
  const { packed: _p, n, startFen, derived, cols, ...rest } = x;
  void _p;
  const fens = derived.fens && startFen ? replay(startFen, cols.uci as string[]) : null;
  const moves: MoveAnalysis[] = [];
  for (let i = 0; i < n; i++) {
    const m: Record<string, unknown> = {};
    for (const k of Object.keys(cols)) {
      const v = cols[k][i];
      // Optional fields that were missing stay missing (not "undefined" keys).
      if (v !== undefined) m[k] = v;
    }
    if (fens) {
      m.fenBefore = fens[i];
      m.fenAfter = fens[i + 1];
    }
    if (derived.evals) {
      m.evalBefore = rest.evals[i];
      m.evalAfter = rest.evals[i + 1];
    }
    if (derived.best) {
      const lu = m.bestLineUci as string[] | undefined;
      const ls = m.bestLineSan as string[] | undefined;
      if (lu?.[0] !== undefined) m.bestUci = lu[0];
      if (ls?.[0] !== undefined) m.bestSan = ls[0];
    }
    moves.push(m as unknown as MoveAnalysis);
  }
  return { ...rest, moves } as unknown as T;
}
