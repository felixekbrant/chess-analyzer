/** This build's version and latest changes, filled in at build time (vite.config.ts). */
declare const __BUILD__: { version: string; date: string; changes: string[] };

export const BUILD: { version: string; date: string; changes: string[] } =
  typeof __BUILD__ !== 'undefined' ? __BUILD__ : { version: 'dev', date: '', changes: [] };

const SEEN = 'seen-version';

/**
 * The version this browser ran last time, if it was a different one (i.e. the app was just
 * updated); remembers the current one. Undefined on the first run and when nothing changed.
 */
export function justUpdatedFrom(): string | undefined {
  try {
    const before = localStorage.getItem(SEEN);
    localStorage.setItem(SEEN, BUILD.version);
    return before && before !== BUILD.version ? before : undefined;
  } catch {
    return undefined;
  }
}
