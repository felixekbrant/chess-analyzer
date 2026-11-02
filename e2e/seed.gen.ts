import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { SEED_FILE, USERNAME, fixture, mockChessCom } from './helpers';

// Regenerates e2e/fixtures/seed.json: imports the fixture games through the real connect flow,
// lets the app's own Stockfish analyse all of them, and saves the backup the smoke tests load.
// Run with `npm run e2e:seed` (takes a few minutes) after changing the fixture games.
test('generate seed backup', async ({ page, context }) => {
  await mockChessCom(context);
  await page.goto('./');
  await page.getByLabel('chess.com username').fill(USERNAME);
  await page.getByLabel('History to import').selectOption('0');
  await page.getByRole('button', { name: 'Start' }).click();

  const total = Object.values(fixture.months).reduce((n, g) => n + g.length, 0);
  await page.goto('./#/settings');
  await page.getByRole('button', { name: /^Max/ }).click();
  // Analysis runs in the background; poll the database until every game is done.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const req = indexedDB.open('chess-analyzer');
              req.onsuccess = () => {
                const r = req.result.transaction('analyses').objectStore('analyses').count();
                r.onsuccess = () => resolve(r.result);
              };
            }),
        ),
      { timeout: 25 * 60_000, intervals: [5000] },
    )
    .toBe(total);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const file = await (await download).path();
  const data = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(SEED_FILE, JSON.stringify(data));
  expect(data.games.length).toBe(total);
});
