import { test, expect, type Page } from '@playwright/test';
import { mockChessCom, seed } from './helpers';

// Reference screenshots of the main screens (phone, dark), so a later change can't quietly break
// the look. The clock is fixed so relative dates ("Friday", "Synced 19 h ago") don't change, and
// motion is reduced so nothing is caught mid-animation. Update after an intended visual change:
//   npm run e2e:visual -- --update-snapshots
test.use({ colorScheme: 'dark' });

const NOW = new Date('2026-11-03T12:00:00');

async function ready(page: Page) {
  await page.clock.setFixedTime(NOW);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockChessCom(page.context());
  await seed(page);
  // Let the post-restore work (model check, biggest-advantage fill-in) finish, and clear the notice.
  await page.goto('./#/games');
  await expect(page.getByText(/^was \+/).filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 2_000 }).catch(() => {});
}

const shot = (page: Page, name: string) =>
  expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, animations: 'disabled', maxDiffPixelRatio: 0.01, timeout: 15_000 });

test('screens', async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page);
  await page.goto('./#/games');
  await page.locator('[data-game-id]').first().waitFor();
  await shot(page, 'games');

  await page.goto('./#/');
  await page.getByRole('heading', { name: 'Today' }).waitFor();
  await page.waitForTimeout(800);
  await shot(page, 'home');

  await page.goto('./#/games');
  await page.locator('[data-game-id]').first().click();
  await page.getByRole('button', { name: 'Start review' }).waitFor();
  await shot(page, 'summary');

  await page.getByRole('button', { name: 'Start review' }).click();
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(500);
  await shot(page, 'review');

  await page.goto('./#/insights');
  await page.getByText(/last \d+ rapid games/).waitFor();
  await page.waitForTimeout(800);
  await shot(page, 'insights-skills');

  await page.goto('./#/openings');
  await page.getByRole('heading', { name: 'As White' }).waitFor();
  await page.waitForTimeout(800);
  await shot(page, 'openings');

  await page.goto('./#/settings');
  await page.getByText('Stored in this browser').waitFor();
  await shot(page, 'settings');
});

test('welcome', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockChessCom(page.context());
  await page.goto('./');
  await page.getByRole('heading', { name: 'Your own chess coach' }).waitFor();
  await page.waitForTimeout(500);
  await shot(page, 'welcome');
});
