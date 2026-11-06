import { expect, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (f: string) => fileURLToPath(new URL(f, import.meta.url));

interface Fixture {
  username: string;
  profile: { username: string; url: string };
  months: Record<string, unknown[]>;
}

export const fixture: Fixture = JSON.parse(readFileSync(here('./fixtures/chesscom.json'), 'utf8'));
export const USERNAME = fixture.username;
export const SEED_FILE = here('./fixtures/seed.json');

/**
 * Answers every chess.com API request from the fixture: the player's profile, their archive list
 * and the archived months. Unknown players get a 404, like the real API.
 */
export async function mockChessCom(context: BrowserContext) {
  await context.route('https://api.chess.com/**', async (route) => {
    const url = new URL(route.request().url());
    const base = `/pub/player/${USERNAME}`;
    const path = url.pathname.toLowerCase();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (path === base) return json(fixture.profile);
    if (path === `${base}/games/archives`) return json({ archives: Object.keys(fixture.months).map((m) => `https://api.chess.com${base}/games/${m}`) });
    const month = path.startsWith(`${base}/games/`) ? path.slice(`${base}/games/`.length) : '';
    if (fixture.months[month]) return json({ games: fixture.months[month] });
    return route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"message":"not found"}' });
  });
}

/** Loads the analysed games from e2e/fixtures/seed.json through Settings → Import backup. */
export async function seed(page: Page) {
  await page.goto('./#/settings');
  await page.locator('input[type="file"]').setInputFiles(SEED_FILE);
  await expect(page.getByText(/\d+ games restored/)).toBeVisible();
}

/** Chooses an option in one of the app's pickers (a pill button that opens a sheet of options). */
export async function pick(page: Page, label: string, option: string) {
  await page.getByRole('button', { name: new RegExp(`^${label}:`) }).first().click();
  await page.getByRole('dialog', { name: label }).getByRole('radio', { name: option }).click();
}

/** Opens a tab from the phone tab bar (or the "More" sheet for the rest). */
export async function openTab(page: Page, name: 'Home' | 'Games' | 'Train' | 'Insights' | 'Openings' | 'Settings') {
  const nav = page.getByRole('navigation', { name: 'Main' }).last();
  if (name === 'Openings' || name === 'Settings') {
    await nav.getByRole('button', { name: 'More' }).click();
    await page.getByRole('dialog').getByRole('link', { name }).click();
  } else {
    await nav.getByRole('link', { name }).click();
  }
}
