import { useSyncExternalStore } from 'react';
import { GROQ, type Provider } from './client';

/*
 * The player's own free Groq key. Kept in this browser only (localStorage): not in the app's
 * database, so it never goes into a backup file, and each device asks for it once.
 */

const KEY = 'coach-groq-key';
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function setCoachKey(value: string) {
  try {
    if (value) localStorage.setItem(KEY, value.trim());
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked (private mode): the coach simply stays off.
  }
  listeners.forEach((l) => l());
}

/** The saved key ('' when none), updating when it changes. */
export function useCoachKey(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      const onStorage = (e: StorageEvent) => e.key === KEY && l();
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(l);
        window.removeEventListener('storage', onStorage);
      };
    },
    read,
    () => '',
  );
}

export const coachProvider = (apiKey: string): Provider => ({ ...GROQ, apiKey });

/** Checks a key against Groq: undefined if it works, otherwise what went wrong, in words. */
export async function testCoachKey(apiKey: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${GROQ.baseUrl}/models`, { headers: { authorization: `Bearer ${apiKey.trim()}` } });
    if (res.ok) return undefined;
    if (res.status === 401) return "Groq didn't accept this key. Copy it again from console.groq.com/keys.";
    return `Groq answered with an error (${res.status}). Try again in a minute.`;
  } catch {
    return 'No connection to Groq. Check your internet and try again.';
  }
}
