import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { pick } from './helpers';

// Collects real games for the AI coach trial (scripts/coach-trial): imports a player's recent games
// from chess.com through the normal connect flow, lets the app analyse them, and saves the backup.
// COACH_USER=<chess.com name> [COACH_MONTHS=1] npx playwright test --project=coach-trial
const user = process.env.COACH_USER;
const months = process.env.COACH_MONTHS ?? '1';
const out = fileURLToPath(new URL('../scripts/coach-trial/data/backup.json', import.meta.url));

test('collect games for the coach trial', async ({ page }) => {
  test.skip(!user, 'Set COACH_USER');
  await page.goto('./');
  await page.getByLabel('chess.com username').fill(user!);
  await pick(page, 'History to import', `Last ${months} month${months === '1' ? '' : 's'}`);
  await page.getByRole('button', { name: 'Start' }).click();
  await page.goto('./#/settings');
  await page.getByRole('radio', { name: 'Max' }).click();

  const count = (store: string) =>
    page.evaluate(
      (s) =>
        new Promise<number>((resolve) => {
          const req = indexedDB.open('chess-analyzer');
          req.onsuccess = () => {
            const r = req.result.transaction(s).objectStore(s).count();
            r.onsuccess = () => resolve(r.result);
          };
        }),
      store,
    );
  await expect.poll(() => count('games'), { timeout: 120_000 }).toBeGreaterThan(0);
  const total = await count('games');
  // The app analyses up to its auto-analysis limit; wait for all of those.
  await expect.poll(() => count('analyses'), { timeout: 55 * 60_000, intervals: [10_000] }).toBe(Math.min(total, 150));

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const bytes = readFileSync(await (await download).path());
  mkdirSync(fileURLToPath(new URL('../scripts/coach-trial/data/', import.meta.url)), { recursive: true });
  writeFileSync(out, (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString('utf8'));
});
