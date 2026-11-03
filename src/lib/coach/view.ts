import { db } from '../../db/schema';
import { RateLimited, askProfile } from './client';
import { coachProvider } from './key';

/**
 * A saved piece of AI writing (Coach's view, the weekly note): shown again without asking the model,
 * until what it was written from changes or it is old enough to write a new one.
 */
export interface SavedText {
  /** What it was written from (e.g. the analysed games), so a stale one is recognisable. */
  basis: string;
  text: string;
  at: number;
}

export const COACH_VIEW = 'coachView';
export const WEEKLY_NOTE = 'weeklyNote';
const DAY = 24 * 60 * 60 * 1000;

/** The saved text, or null when there is none (undefined is left for "still loading"). */
export async function savedText(kvKey: string): Promise<SavedText | null> {
  return ((await db.kv.get(kvKey))?.value as SavedText | undefined) ?? null;
}

/** Whether a new one may be written: nothing yet, what it's based on changed, or it's a day old. */
export const canRefresh = (v: SavedText | null | undefined, basis: string, now = Date.now()) => !v || v.basis !== basis || now - v.at >= DAY;

/** The player-facing message for a failed request. */
export function coachError(e: unknown): Error {
  if (e instanceof RateLimited) return new Error("Groq's free limit is used up for now. Try again later.");
  if (String(e).includes('401')) return new Error("Groq didn't accept your key. Check it in Settings.");
  if (e instanceof TypeError) return new Error('No connection to Groq. Check your internet and try again.');
  return new Error("The coach couldn't answer right now. Try again in a minute.");
}

/** Asks the model to write from `stats` with `prompt`, and saves the text. Throws an Error with a message for the player. */
export async function writeSaved(kvKey: string, apiKey: string, basis: string, stats: object, prompt: string): Promise<SavedText> {
  let text: string;
  try {
    ({ answer: text } = await askProfile(coachProvider(apiKey), stats, prompt));
  } catch (e) {
    throw coachError(e);
  }
  if (!text) throw new Error("The coach couldn't answer right now. Try again in a minute.");
  const saved = { basis, text, at: Date.now() };
  await db.kv.put({ key: kvKey, value: saved });
  return saved;
}
