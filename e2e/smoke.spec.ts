import { test as base, expect, type Page } from '@playwright/test';
import { USERNAME, mockChessCom, openTab, seed } from './helpers';

// Click-through tests of the main flows at phone size. Every test starts with an empty browser;
// most load e2e/fixtures/seed.json (29 analysed games) first. chess.com is answered from fixtures.

/** Fails a test on any uncaught error in the page or "Something went wrong" screen. */
const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page, context }, use) => {
      await mockChessCom(context);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await use(errors);
      await expect(page.getByText('Something went wrong on this page')).toHaveCount(0);
      expect(errors, 'uncaught errors in the page').toEqual([]);
    },
    { auto: true },
  ],
});

/** The player's colour in a puzzle is the side to move; rebuilds the board's placement from the DOM. */
async function boardPlacement(page: Page, id: string): Promise<string> {
  const ids = await page.locator(`[id^="${id}-piece-"]`).evaluateAll((els) => els.map((e) => e.id));
  const board: string[][] = Array.from({ length: 8 }, () => Array(8).fill(''));
  for (const el of ids) {
    const m = /-piece-([wb])([PNBRQK])-([a-h])([1-8])$/.exec(el);
    if (!m) continue;
    const ch = m[1] === 'w' ? m[2] : m[2].toLowerCase();
    board[8 - Number(m[4])][m[3].charCodeAt(0) - 97] = ch;
  }
  return board
    .map((row) => {
      let s = '';
      let empty = 0;
      for (const c of row) {
        if (!c) empty++;
        else {
          if (empty) s += empty;
          empty = 0;
          s += c;
        }
      }
      return s + (empty || '');
    })
    .join('/');
}

/** Reads all training puzzles straight from the app's IndexedDB. */
function readPuzzles(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ id: string; fen: string; solutionUci: string[] }[]>((resolve, reject) => {
        const req = indexedDB.open('chess-analyzer');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const r = req.result.transaction('puzzles').objectStore('puzzles').getAll();
          r.onsuccess = () => resolve(r.result);
        };
      }),
  );
}

async function clickSquare(page: Page, square: string) {
  await page.locator(`[data-square="${square}"]`).first().click();
}

test('first visit: connect form imports games from chess.com', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Your free, private chess coach', { exact: false })).toBeVisible();

  // Unknown player: a clear message, and the form stays.
  await page.getByLabel('chess.com username').fill('no-such-player-xyz');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText(`There's no chess.com player called "no-such-player-xyz".`)).toBeVisible();

  // Pause analysis straight away so this test doesn't spend its time running Stockfish.
  await page.getByLabel('chess.com username').fill(USERNAME);
  await page.getByLabel('History to import').selectOption('0');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText(/29 new games imported from chess\.com/)).toBeVisible();
  await expect(page.getByText(/^29 games · \d+ analysed$/)).toBeVisible();

  await openTab(page, 'Games');
  await expect(page.locator('[data-game-id]')).not.toHaveCount(0);
});

test('home: Today plan and skill focus', async ({ page }) => {
  await seed(page);
  await openTab(page, 'Home');
  await expect(page.getByText(/^29 games · 29 analysed$/)).toBeVisible();
  const today = page.locator('section', { has: page.getByRole('heading', { name: 'Today', exact: true }) });
  await expect(today).toBeVisible();
  await expect(today.getByRole('listitem').first()).toBeVisible();
  // The skill profile is ready with 20 analysed rapid games, so the focus card replaces "on its way".
  await expect(page.getByText('Your skill profile is on its way')).toHaveCount(0);

  await today.getByRole('button', { name: /Start|Continue/ }).click();
  await expect(page).not.toHaveURL(/#\/$/);
});

test('game review: summary, walkthrough and the line viewer', async ({ page }) => {
  await seed(page);
  await openTab(page, 'Games');
  const games = page.locator('[data-game-id]');
  await games.first().click();
  await expect(page.getByRole('button', { name: 'Start review' })).toBeVisible();
  await expect(page.getByText('accuracy').first()).toBeVisible();

  // Find a game with a mistake of the user's: try games until "Retry mistakes (n>0)" is enabled.
  for (let i = 0; ; i++) {
    if (await page.getByRole('button', { name: /Retry mistakes \(([1-9]\d*)\)/ }).isEnabled().catch(() => false)) break;
    expect(i, 'a fixture game with mistakes').toBeLessThan(10);
    await page.goBack();
    await games.nth(i + 1).click();
    await expect(page.getByRole('button', { name: 'Start review' })).toBeVisible();
  }

  // Step through the key moments until the coach offers "Why it fails".
  await page.getByRole('button', { name: /Key moments/ }).click();
  const why = page.getByRole('button', { name: 'Why it fails' });
  for (let i = 0; !(await why.isVisible()); i++) {
    expect(i, 'a key moment with "Why it fails"').toBeLessThan(30);
    await page.getByRole('button', { name: 'Next key' }).click();
  }
  await why.click();
  await expect(page.getByRole('button', { name: 'Close the line' })).toBeVisible();
  await page.getByRole('button', { name: 'Next move' }).click();
  await page.getByRole('button', { name: 'Back to game' }).click();
  await expect(page.getByRole('button', { name: 'Close the line' })).toHaveCount(0);

  const best = page.getByRole('button', { name: 'Best line' });
  if (await best.isVisible()) {
    await best.click();
    await expect(page.getByRole('button', { name: 'Close the line' })).toBeVisible();
    await page.getByRole('button', { name: 'Close the line' }).click();
  }
  // The regular walkthrough steps move by move.
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('button', { name: 'Game summary' }).click();
  await page.getByRole('button', { name: 'Start review' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText(/winning chances \d+% → \d+%/).first()).toBeVisible();
});

test('training: solve a puzzle, reveal the next and see the full line', async ({ page }) => {
  await seed(page);
  await openTab(page, 'Train');
  await expect(page.getByText(/to move$/)).toBeVisible();
  const puzzles = await readPuzzles(page);
  expect(puzzles.length).toBeGreaterThan(0);

  // Solve: play the stored solution's first move on the board.
  const placement = await boardPlacement(page, 'puzzle');
  const current = puzzles.find((p) => p.fen.split(' ')[0] === placement);
  expect(current, 'the shown puzzle is in the database').toBeTruthy();
  const move = current!.solutionUci[0];
  await clickSquare(page, move.slice(0, 2));
  await clickSquare(page, move.slice(2, 4));
  await expect(page.getByText(/^✔ /)).toBeVisible();
  const next = page.getByRole('button', { name: /Next puzzle/ });
  await expect(next).toBeVisible();
  // Auto-next may already move on; otherwise press Next.
  await next.click().catch(() => {});

  // Reveal: show the solution and step through the full line.
  await page.getByRole('button', { name: /Solution/ }).click();
  await expect(page.getByText(/^Solution:/)).toBeVisible();
  const full = page.getByRole('button', { name: 'See the full line' });
  if (await full.isVisible()) {
    await full.click();
    await expect(page.getByText(/^The full line after/)).toBeVisible();
    await page.getByRole('button', { name: 'Close the line' }).click();
  }
  // A revealed puzzle counts as missed once you move on.
  await page.getByRole('button', { name: /Next puzzle/ }).click();
  await expect(page.getByTitle('Solved / missed this session')).toHaveText(/✓1\s*✗1/);
});

test('insights: skills tab and game filters', async ({ page }) => {
  await seed(page);
  await openTab(page, 'Insights');
  const tabs = page.getByRole('tablist', { name: 'Insight sections' });
  await expect(tabs.getByRole('tab', { name: 'Skills' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(/Each mistake in your last \d+ rapid games/)).toBeVisible();

  // Expand an area for its examples.
  await page.locator('button[aria-expanded="false"]').first().click();
  await expect(page.locator('button[aria-expanded="true"]')).toHaveCount(1);

  const which = page.getByLabel('Which games');
  for (const option of ['g50', 'g100', 'g200', 'd0']) {
    await which.selectOption(option);
    await expect(page.getByText(/Each mistake in your last \d+ rapid games/)).toBeVisible();
  }
  for (const name of ['Overview', 'Mistakes', 'Time', 'Results', 'Sessions', 'Skills']) {
    await tabs.getByRole('tab', { name }).click();
    await expect(tabs.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
  }
  // Openings report (under "More").
  await openTab(page, 'Openings');
  await expect(page.getByRole('heading', { name: 'Openings' }).first()).toBeVisible();
});

test('sync sheet: import and analysis controls', async ({ page }) => {
  await seed(page);
  // Queue every game again so there is something to pause.
  page.on('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Re-analyse all' }).click();
  await openTab(page, 'Home');
  await page.getByRole('button', { name: /^Status:/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText(`chess.com · ${USERNAME}`)).toBeVisible();

  const pause = sheet.getByRole('button', { name: /Pause/ });
  await expect(pause).toBeVisible();
  await pause.click();
  await expect(sheet.getByRole('button', { name: /Resume/ })).toBeVisible();
  await expect(sheet.getByText(/paused/)).toBeVisible();

  const autoImport = sheet.getByRole('switch').nth(0);
  await autoImport.click();
  await expect(sheet.getByText('Off: only when you press Sync.')).toBeVisible();
  await autoImport.click();
  await expect(sheet.getByText('When the app opens and every 10 minutes.')).toBeVisible();

  const autoAnalyse = sheet.getByRole('switch').nth(1);
  await sheet.getByRole('button', { name: '50', exact: true }).click();
  await expect(sheet.getByText('Your latest 50 games are kept analysed.')).toBeVisible();
  await autoAnalyse.click();
  await expect(sheet.getByText('Off: a game is analysed when you open it.')).toBeVisible();
  await expect(sheet.getByRole('button', { name: '50', exact: true })).toHaveCount(0);
  await autoAnalyse.click();
  await expect(sheet.getByRole('button', { name: '200', exact: true })).toBeVisible();

  await sheet.getByRole('button', { name: 'Sync', exact: true }).click();
  await expect(sheet.getByText(/Synced .* ago|Synced just now|Synced/)).toBeVisible();
});
