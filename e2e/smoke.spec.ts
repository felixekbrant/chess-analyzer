import { test as base, expect, type Page } from '@playwright/test';
import { SEED_FILE, USERNAME, mockChessCom, openTab, pick, seed } from './helpers';

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
      // Nothing may make the page wider than the phone screen (no sideways scrolling).
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, 'page wider than the screen').toBeLessThanOrEqual(0);
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
  await expect(page.getByRole('heading', { name: 'Your own chess coach' })).toBeVisible();

  // Unknown player: a clear message, and the form stays.
  await page.getByLabel('chess.com username').fill('no-such-player-xyz');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText(`There's no chess.com player called "no-such-player-xyz".`)).toBeVisible();

  // Pause analysis straight away so this test doesn't spend its time running Stockfish.
  await page.getByLabel('chess.com username').fill(USERNAME);
  await pick(page, 'History to import', 'All games');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText(/29 new games imported from chess\.com/)).toBeVisible();

  await openTab(page, 'Games');
  await expect(page.locator('[data-game-id]')).not.toHaveCount(0);
});

test('home: Today plan and skill focus', async ({ page }) => {
  await seed(page);
  await openTab(page, 'Home');
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
  // The line is stepped and played from the bottom bar.
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close the line' }).click();
  await expect(page.getByRole('button', { name: 'Close the line' })).toHaveCount(0);

  // The engine opens just before the current move, with that move one tap away.
  await page.getByRole('group', { name: 'Engine' }).first().getByRole('button', { name: 'Engine' }).click();
  await page.getByRole('button', { name: /Your move / }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).filter({ visible: true }).first().click();
  await page.getByRole('group', { name: 'Engine' }).first().getByRole('button', { name: 'Engine' }).click();

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
  await expect(page.getByText(/ is (a book move|best|excellent|good|forced|great|brilliant|an inaccuracy|a mistake|a blunder|a miss)$/).first()).toBeVisible();
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
  await expect(page.getByText(/last \d+ rapid games/)).toBeVisible();

  // Expand an area for its examples.
  await page.locator('button[aria-expanded="false"]').first().click();
  await expect(page.locator('button[aria-expanded="true"]')).toHaveCount(1);

  for (const option of ['Last 50 games', 'Last 100 games', 'Last 200 games', 'All games']) {
    await pick(page, 'Which games', option);
    await expect(page.getByText(/last \d+ rapid games/)).toBeVisible();
  }
  for (const name of ['Overview', 'Mistakes', 'Time', 'Results', 'Skills']) {
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
  await expect(sheet.getByText('Latest 50 games')).toBeVisible();
  await autoAnalyse.click();
  await expect(sheet.getByText('Off: a game is analysed when you open it.')).toBeVisible();
  await expect(sheet.getByRole('button', { name: '50', exact: true })).toHaveCount(0);
  await autoAnalyse.click();
  await expect(sheet.getByRole('button', { name: '300', exact: true })).toBeVisible();

  await sheet.getByRole('button', { name: 'Sync', exact: true }).click();
  await expect(sheet.getByText(/Synced .* ago|Synced just now|Synced/)).toBeVisible();
});

test('focus drill: tops up with Lichess puzzles and plays one', async ({ page }) => {
  await seed(page);
  await openTab(page, 'Home');
  const today = page.locator('section', { has: page.getByRole('heading', { name: 'Today', exact: true }) });
  await expect(today.getByText('Focus drill')).toBeVisible();
  // This player has plenty of their own middlegame positions; pick an area with few, so the drill needs Lichess puzzles.
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Opening/ }).click();
  await expect(today.getByText(/Lichess puzzles/)).toBeVisible();
  // The pack for the focus area is downloaded and its puzzles stored in the browser.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const req = indexedDB.open('chess-analyzer');
            req.onsuccess = () => {
              const r = req.result.transaction('extPuzzles').objectStore('extPuzzles').count();
              r.onsuccess = () => resolve(r.result);
            };
          }),
      ),
    )
    .toBeGreaterThan(0);

  // Mark today's due puzzles as done, so the session goes straight to the focus drill.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const d = new Date();
        const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const req = indexedDB.open('chess-analyzer');
        req.onsuccess = () => {
          const tx = req.result.transaction('kv', 'readwrite');
          tx.objectStore('kv').put({ key: 'today', value: { date, puzzles: 99, drill: 0 } });
          tx.oncomplete = () => resolve();
        };
      }),
  );
  // Skip through the drill until a Lichess puzzle comes up, then reveal it and move on.
  await page.goto('./#/training?session=today');
  await page.reload();
  const lichess = page.getByRole('link', { name: 'Open on lichess.org' });
  for (let i = 0; !(await lichess.isVisible()); i++) {
    expect(i, 'a Lichess puzzle in the session').toBeLessThan(30);
    await page.getByRole('button', { name: /Skip/ }).click();
  }
  await expect(page.getByText(/Lichess puzzle · \d+/)).toBeVisible();
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/lichess-puzzle.png`, fullPage: true });
  await page.getByRole('button', { name: /Solution/ }).click();
  await expect(page.getByText(/^Solution:/)).toBeVisible();
  await page.getByRole('button', { name: /Next puzzle/ }).click();
  await expect(page.getByTitle('Solved / missed this session')).toHaveText(/✗1/);
  // The Lichess puzzle counts towards today's drill.
  await openTab(page, 'Home');
  await expect(page.getByRole('link', { name: /Focus drill 1\/\d+/ })).toBeVisible();
});

test('engine controls: open the engine and toggle eval bar and suggestions in reviews and puzzles', async ({ page }) => {
  await seed(page);
  await openTab(page, 'Games');
  await page.locator('[data-game-id]').first().click();
  await page.getByRole('button', { name: 'Start review' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  const controls = page.getByRole('group', { name: 'Engine' }).first();
  const evalBar = controls.getByRole('button', { name: 'Eval bar' });
  const suggestions = controls.getByRole('button', { name: 'Suggestions' });
  await expect(evalBar).toHaveAttribute('aria-pressed', 'true');

  // Open the engine: live lines appear, and moves can be played freely.
  await controls.getByRole('button', { name: 'Engine' }).click();
  await expect(page.getByText(/Stockfish 19 lite · depth \d+/).filter({ visible: true })).toBeVisible();
  await suggestions.click();
  await expect(suggestions).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText(/Stockfish 19 lite · depth/)).toHaveCount(0);
  await evalBar.click();
  await expect(evalBar).toHaveAttribute('aria-pressed', 'false');
  await controls.getByRole('button', { name: 'Engine' }).click();
  await expect(controls.getByRole('button', { name: 'Engine' })).toHaveAttribute('aria-pressed', 'false');

  // The choices carry over to puzzles.
  await page.goto('./#/training');
  await expect(page.getByText(/to move$/)).toBeVisible();
  const pc = page.getByRole('group', { name: 'Engine' });
  await expect(pc.getByRole('button', { name: 'Suggestions' })).toHaveAttribute('aria-pressed', 'false');
  await pc.getByRole('button', { name: 'Suggestions' }).click();
  await pc.getByRole('button', { name: 'Engine' }).click();
  await expect(page.getByText(/Stockfish 19 lite · depth \d+/).filter({ visible: true })).toBeVisible();
  // The engine starts at the puzzle position; your game move can be played there and taken back.
  await page.getByRole('button', { name: /Your move / }).click();
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to puzzle' }).click();
  await expect(page.getByRole('button', { name: /Solution/ })).toBeVisible();
});

test('backup: export is compressed and restores into an empty app', async ({ page, browser }, testInfo) => {
  await seed(page);
  await page.goto('./#/settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const file = await (await download).path();
  const { readFileSync, statSync } = await import('node:fs');
  const bytes = readFileSync(file);
  expect([bytes[0], bytes[1]], 'gzip header').toEqual([0x1f, 0x8b]);
  expect(statSync(file).size).toBeLessThan(statSync(SEED_FILE).size / 3);

  // A fresh browser profile restores it.
  const fresh = await browser.newContext({ ...testInfo.project.use, serviceWorkers: 'block' });
  await mockChessCom(fresh);
  const p2 = await fresh.newPage();
  await p2.goto('./#/settings');
  await p2.locator('input[type="file"]').setInputFiles({ name: 'backup.json.gz', mimeType: 'application/gzip', buffer: bytes });
  await expect(p2.getByText('Restored 29 games from backup')).toBeVisible();
  await p2.goto('./#/games');
  await expect(p2.locator('[data-game-id]')).not.toHaveCount(0);
  await fresh.close();
});
