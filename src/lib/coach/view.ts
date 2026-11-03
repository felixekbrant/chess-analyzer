import { db } from '../../db/schema';
import { RateLimited, askProfile } from './client';
import { coachProvider } from './key';
import { PROFILE_PROMPT, profileFacts } from './profile';

/** A saved "Coach's view": shown again without asking the model until the games change or a day passes. */
export interface CoachView {
  /** What it was written from (filters and the analysed games), so a stale one is recognisable. */
  basis: string;
  text: string;
  at: number;
}

const KV_KEY = 'coachView';
const DAY = 24 * 60 * 60 * 1000;

export async function savedCoachView(): Promise<CoachView | undefined> {
  return (await db.kv.get(KV_KEY))?.value as CoachView | undefined;
}

/** Whether a new one may be written: the games changed, or the last one is a day old. */
export const canRefresh = (v: CoachView | undefined, basis: string, now = Date.now()) => !v || v.basis !== basis || now - v.at >= DAY;

/** Asks the model for a new Coach's view and saves it. Throws an Error with a message for the player. */
export async function writeCoachView(apiKey: string, basis: string, ...args: Parameters<typeof profileFacts>): Promise<CoachView> {
  let text: string;
  try {
    ({ answer: text } = await askProfile(coachProvider(apiKey), profileFacts(...args), PROFILE_PROMPT));
  } catch (e) {
    if (e instanceof RateLimited) throw new Error("Groq's free limit is used up for now. Try again later.");
    if (String(e).includes('401')) throw new Error("Groq didn't accept your key. Check it in Settings.");
    if (e instanceof TypeError) throw new Error('No connection to Groq. Check your internet and try again.');
    throw new Error("The coach couldn't answer right now. Try again in a minute.");
  }
  if (!text) throw new Error("The coach couldn't answer right now. Try again in a minute.");
  const view = { basis, text, at: Date.now() };
  await db.kv.put({ key: KV_KEY, value: view });
  return view;
}
