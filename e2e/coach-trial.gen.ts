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
/** Enough analysed games for the trial; the rest wait (the app analyses newest first). */
const enough = Number(process.env.COACH_GAMES ?? 25);
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
  // Months arrive one by one: wait until the number of games stops growing.
  let total = 0;
  await expect
    .poll(
      async () => {
        const n = await count('games');
        const settled = n > 0 && n === total;
        total = n;
        return settled;
      },
      { timeout: 180_000, intervals: [5000] },
    )
    .toBe(true);
  console.log(`${total} games imported`);
  const progress = fileURLToPath(new URL('../scripts/coach-trial/data/progress.txt', import.meta.url));
  mkdirSync(fileURLToPath(new URL('../scripts/coach-trial/data/', import.meta.url)), { recursive: true });
  await expect
    .poll(
      async () => {
        const n = await count('analyses');
        writeFileSync(progress, `${new Date().toISOString()} ${n}/${Math.min(total, enough)} analysed of ${total} games\n`, { flag: 'a' });
        await page.screenshot({ path: progress.replace('progress.txt', 'progress.png') });
        return n;
      },
      { timeout: 55 * 60_000, intervals: [15_000] },
    )
    .toBeGreaterThanOrEqual(Math.min(total, enough));

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const bytes = readFileSync(await (await download).path());
  mkdirSync(fileURLToPath(new URL('../scripts/coach-trial/data/', import.meta.url)), { recursive: true });
  writeFileSync(out, (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString('utf8'));
});
