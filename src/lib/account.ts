import { saveSettings } from '../db/schema';
import { fetchProfile } from './chesscom/api';
import { syncManager } from './syncManager';

/**
 * Verifies a chess.com username, stores it and starts the first import.
 * Returns the canonical username; throws a user-readable error if it doesn't exist.
 */
export async function connectAccount(username: string, historyMonths?: number): Promise<string> {
  const u = username.trim();
  let canonical = u;
  try {
    const profile = await fetchProfile(u);
    canonical = profile.username ?? u;
  } catch (e) {
    const status = (e as { status?: number }).status;
    throw new Error(status === 404 ? `There's no chess.com player called "${u}".` : `Couldn't reach chess.com (${(e as Error).message}).`);
  }
  await saveSettings({ username: canonical, ...(historyMonths !== undefined ? { historyMonths } : {}) });
  void syncManager.syncNow();
  return canonical;
}
