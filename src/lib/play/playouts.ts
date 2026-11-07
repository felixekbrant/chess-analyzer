import { db } from '../../db/schema';
import type { Color, PlayLevel } from '../types';

export type PlayResult = 'converted' | 'won' | 'draw' | 'lost' | 'resigned';

/** One game played from a position, saved for progress (e.g. converting advantages). */
export interface Playout {
  at: number;
  /** Where it started: "game:<id>:<ply>", "puzzle:<id>" or "position". */
  from: string;
  fen: string;
  you: Color;
  level: PlayLevel;
  result: PlayResult;
  /** Moves played (both sides). */
  plies: number;
  /** Did you start clearly ahead (+3 or better)? Those count as conversion practice. */
  ahead: boolean;
}

export const PLAYOUTS_KEY = 'playouts';
const MAX = 300;

export async function savePlayout(p: Playout) {
  await db.transaction('rw', db.kv, async () => {
    const list = ((await db.kv.get(PLAYOUTS_KEY))?.value as Playout[] | undefined) ?? [];
    await db.kv.put({ key: PLAYOUTS_KEY, value: [...list, p].slice(-MAX) });
  });
}

/** Conversion practice: play-outs that started clearly ahead, and how many were won. */
export function conversionStats(list: Playout[]): { tried: number; converted: number } {
  const ahead = list.filter((p) => p.ahead);
  return { tried: ahead.length, converted: ahead.filter((p) => p.result === 'converted' || p.result === 'won').length };
}

/** Where to play from: the URL of the play page. */
export function playHref(fen: string, you: Color, from: string): string {
  return `/play?fen=${encodeURIComponent(fen)}&you=${you}&from=${encodeURIComponent(from)}`;
}
