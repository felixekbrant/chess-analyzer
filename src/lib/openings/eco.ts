import { positionKey } from '../pgn/parse';

/** Named positions map to [eco, name]; unnamed positions along a book line map to 0. */
type Table = Record<string, [string, string] | 0>;

// The opening book is ~700 kB, so it is loaded on demand instead of being part of the main bundle.
// Everything that imports or analyses games awaits ensureOpenings() first.
let table: Table = {};
let loading: Promise<void> | undefined;

export function ensureOpenings(): Promise<void> {
  loading ??= import('../../data/openings.json').then((m) => {
    table = (m.default ?? m) as unknown as Table;
  });
  return loading;
}

export interface OpeningInfo {
  eco: string;
  name: string;
  /** Ply index (0-based) of the last move that was still in the opening book. */
  lastBookPly: number;
}

export function lookupOpening(fen: string): { eco: string; name: string } | undefined {
  const hit = table[positionKey(fen)];
  return hit ? { eco: hit[0], name: hit[1] } : undefined;
}

export function isBookPosition(fen: string): boolean {
  return positionKey(fen) in table;
}

/** Finds the most specific named opening reached in a game (by walking positions after each move). */
export function detectOpening(fensAfter: string[]): OpeningInfo | undefined {
  let found: OpeningInfo | undefined;
  for (let i = 0; i < fensAfter.length && i < 40; i++) {
    const hit = lookupOpening(fensAfter[i]);
    if (hit) found = { ...hit, lastBookPly: i };
  }
  return found;
}

/** "Sicilian Defense: Najdorf Variation" -> "Sicilian Defense". */
export function openingFamily(name: string): string {
  return name.split(':')[0].trim();
}
