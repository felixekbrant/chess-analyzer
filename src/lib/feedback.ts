import { playSound, type SoundKind } from './sound';

/**
 * How right and wrong feel, the same everywhere: a puzzle, a retry in a review, the threat question
 * and a play-out all answer with these. Each moment has one sound, one vibration, one coach tone and
 * one animation, so the app speaks with one voice.
 *
 * - right: a good move on the way (a puzzle step, a correct retry, the threat spotted)
 * - wrong: a move or answer that isn't it (the try glides back so you can go again)
 * - solved: a puzzle finished
 * - won / drawn / lost: a play-out over
 */
export type Feel = 'right' | 'wrong' | 'solved' | 'won' | 'drawn' | 'lost';

export type FeelTone = 'good' | 'bad' | 'neutral';

const SOUND: Record<Feel, SoundKind> = {
  right: 'correct',
  wrong: 'wrong',
  solved: 'solved',
  won: 'won',
  drawn: 'drawn',
  lost: 'lost',
};

// Vibration (Android; iOS has none): a tick for right, a buzz for wrong, a double pulse to finish well.
// Nothing for a draw or a loss: the phone doesn't scold.
const VIBRATION: Record<Feel, number | number[] | null> = {
  right: 12,
  wrong: 60,
  solved: [20, 60, 30],
  won: [20, 60, 30],
  drawn: null,
  lost: null,
};

const TONE: Record<Feel, FeelTone> = {
  right: 'good',
  wrong: 'bad',
  solved: 'good',
  won: 'good',
  drawn: 'neutral',
  lost: 'bad',
};

/** The coach bubble's tone for a moment: green edge for good, red for bad. */
export function feelTone(kind: Feel | null | undefined): FeelTone {
  return kind ? TONE[kind] : 'neutral';
}

/** The red a wrong try shows on the board (mixed into the squares, so a plain hex colour). */
export const WRONG_TINT = '#ff7a66';

/** Answer a moment: its sound (if sounds are on) and its vibration. */
export function feel(kind: Feel) {
  playSound(SOUND[kind]);
  const v = VIBRATION[kind];
  if (v !== null && typeof navigator !== 'undefined') navigator.vibrate?.(v);
}
