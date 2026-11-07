import type { PlayLevel } from '../types';

/**
 * The engine's strength when you play against it. Stockfish's own Elo setting starts at about 1320
 * (on its engine-list scale), too strong to stand in for a ~1100 club player, so "Your level" uses its
 * skill level with a shallow, quick search. "Strong" uses the Elo setting; "Full" is the real thing.
 * These are estimates, not measured against people.
 */
export const LEVELS: Record<PlayLevel, { label: string; about: string; depth: number; movetime: number; options: [string, string | number | boolean][] }> = {
  club: {
    label: 'Your level',
    about: 'About 1100: makes human-like mistakes',
    depth: 5,
    movetime: 150,
    options: [
      ['UCI_LimitStrength', false],
      ['Skill Level', 2],
    ],
  },
  strong: {
    label: 'Strong',
    about: 'About 1800: punishes most mistakes',
    depth: 12,
    movetime: 500,
    options: [
      ['Skill Level', 20],
      ['UCI_LimitStrength', true],
      ['UCI_Elo', 1800],
    ],
  },
  full: {
    label: 'Full strength',
    about: 'Stockfish at full strength: converting against it is the real test',
    depth: 18,
    movetime: 1000,
    options: [
      ['UCI_LimitStrength', false],
      ['Skill Level', 20],
    ],
  },
};

/** The engine waits at least this long before answering, so its moves don't land instantly. */
export const MIN_THINK_MS = 400;

/** "Converted": a lead this big (in pawns), or a mate for you, seen this many engine moves in a row. */
export const CONVERTED_PAWNS = 10;
export const CONVERTED_STREAK = 2;
