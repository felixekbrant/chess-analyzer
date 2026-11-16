import { db, getSettings, saveSettings } from '../db/schema';
import type { Settings } from './types';

/** localStorage key holding the settings to keep while "Delete everything" waits for the next start. */
const WIPE_KEY = 'wipe-pending';

/**
 * "Delete everything": the data is deleted at the start of the next page load, before anything opens
 * the database. Deleting it here would leave work still running in this page (an import from
 * chess.com, an analysis) writing into the emptied database. The settings are kept.
 */
export async function wipeOnRestart() {
  const settings = await getSettings();
  try {
    localStorage.setItem(WIPE_KEY, JSON.stringify(settings));
  } catch {
    // No storage for the note: delete here instead.
    await wipe(settings);
  }
  location.reload();
}

/** Finishes a "Delete everything" asked for before this load. Call before the app starts. */
export async function finishWipe() {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(WIPE_KEY);
  } catch {
    return;
  }
  if (raw === null) return;
  await wipe(JSON.parse(raw) as Settings);
  try {
    localStorage.removeItem(WIPE_KEY);
  } catch {
    // Deleted again on the next start: harmless.
  }
}

async function wipe(settings: Settings) {
  await db.delete();
  await db.open();
  await saveSettings(settings);
}
