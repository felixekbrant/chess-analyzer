import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { SEED_FILE, USERNAME, mockChessCom, openTab, pick, seed } from './helpers';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { SOLUTION_VERSION } from '../src/lib/training/puzzles';

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

/** Flips one of the review's display options, which live in its "More options" menu. */
async function reviewOption(page: Page, name: string) {
  await page.getByRole('button', { name: 'More options' }).filter({ visible: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
}

/** Reads all training puzzles straight from the app's IndexedDB. */
function readPuzzles(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ id: string; fen: string; solutionUci: string[]; motifs?: string[] }[]>((resolve, reject) => {
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

  // Find a game with a mistake of the user's: try games until "Retry mistakes n" (n > 0) is enabled.
  for (let i = 0; ; i++) {
    if (await page.getByRole('button', { name: /^Retry mistakes [1-9]\d*$/ }).isEnabled().catch(() => false)) break;
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
  // Best moves can be hidden, to look for them yourself: no arrow, and the coach offers a retry instead.
  const arrows = page.locator('[id="review-board"] svg polygon');
  await expect(arrows).not.toHaveCount(0);
  await reviewOption(page, 'Best moves');
  await expect(arrows).toHaveCount(0);
  await page.getByRole('button', { name: 'Find a better move' }).filter({ visible: true }).click();
  await expect(page.getByText(/^Find a better move than /).filter({ visible: true })).toBeVisible();
  // The first hint says what to look for, in words.
  await page.getByRole('button', { name: 'Hint' }).filter({ visible: true }).click();
  await expect(page.getByText(/(Look for|No capture or check|There is a checkmate)/).filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop retrying' }).filter({ visible: true }).click();
  // Still hidden on the next visit, until switched back on.
  await expect(arrows).toHaveCount(0);
  await reviewOption(page, 'Best moves');
  await expect(arrows).not.toHaveCount(0);
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

  // The best line is the bar's "Best" button.
  const best = page.getByRole('button', { name: 'Best', exact: true }).filter({ visible: true });
  if (await best.isEnabled()) {
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
  // Hints come in two steps: what to look for in words, then the piece is highlighted.
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.getByRole('status').getByText(/(Look for|No capture or check|There is a checkmate|under attack|threatens mate)/)).toBeVisible();
  await page.getByRole('button', { name: 'More hint' }).click();
  await expect(page.getByRole('button', { name: 'More hint' })).toBeDisabled();
  await clickSquare(page, move.slice(0, 2));
  await clickSquare(page, move.slice(2, 4));
  await expect(page.getByText(/^Solved/)).toBeVisible();
  const next = page.getByRole('button', { name: /Next puzzle/ });
  await expect(next).toBeVisible();
  // Auto-next may already move on; otherwise press Next.
  await next.click().catch(() => {});

  // Reveal: show the solution and step through the full line.
  await page.getByRole('button', { name: /Solution/ }).click();
  await expect(page.getByText(/^Solution:/)).toBeVisible();
  const full = page.getByRole('button', { name: 'Full line', exact: true });
  if (await full.isVisible()) {
    await full.click();
    await expect(page.getByText(/^The full line after/)).toBeVisible();
    // The arrow keys step through the line (desktop), Esc closes it.
    // Read the board once the move animation has finished.
    await page.waitForTimeout(500);
    const first = await boardPlacement(page, 'puzzle');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => boardPlacement(page, 'puzzle')).not.toBe(first);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => boardPlacement(page, 'puzzle')).toBe(first);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Close the line' })).toHaveCount(0);
  }
  // A revealed puzzle counts as missed once you move on (and the first one as solved).
  await page.getByRole('button', { name: /Next puzzle/ }).click();
  const results = () => readPuzzles(page).then((ps) => (ps as { lastResult?: string }[]).map((p) => p.lastResult).filter(Boolean).sort().join(','));
  await expect.poll(results).toBe('failed,solved');
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
    await page.getByRole('button', { name: /^Filters:/ }).click();
    await page.getByRole('radiogroup', { name: 'Which games' }).getByRole('radio', { name: option }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText(/last \d+ rapid games/)).toBeVisible();
  }
  for (const name of ['Mistakes', 'Time', 'Results', 'Skills']) {
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
  await page.getByRole('button', { name: 'Change', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Opening/ }).click();
  await expect(today.getByText(/Lichess puzzles/)).toBeVisible();
  // The pack for the focus area (Opening, not the area before it) is downloaded and stored.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const req = indexedDB.open('chess-analyzer');
            req.onsuccess = () => {
              const r = req.result.transaction('extPuzzles').objectStore('extPuzzles').index('area').count('opening');
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
  await expect(page.getByTitle('Lichess puzzle rating')).toBeVisible();
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/lichess-puzzle.png`, fullPage: true });
  await page.getByRole('button', { name: /Solution/ }).click();
  await expect(page.getByText(/^Solution:/)).toBeVisible();
  await page.getByRole('button', { name: /Next puzzle/ }).click();
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
  // Open the engine: live lines appear, and moves can be played freely.
  await controls.getByRole('button', { name: 'Engine' }).click();
  await expect(page.getByText(/Stockfish 19 lite · depth \d+/).filter({ visible: true })).toBeVisible();
  // It opens just before the move, with that move played; the arrow keys step back and forward again.
  const reviewStart = page.locator('button.btn').filter({ hasText: /^\s*Start\s*$/ }).filter({ visible: true });
  await expect(reviewStart).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(reviewStart).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(reviewStart).toBeVisible();
  // Its display options are in the menu, in the review and while exploring alike.
  await reviewOption(page, 'Engine: suggested moves');
  await expect(page.getByText(/Stockfish 19 lite · depth/)).toHaveCount(0);
  await reviewOption(page, 'Engine: eval bar');
  await page.getByRole('button', { name: 'More options' }).filter({ visible: true }).click();
  await expect(page.getByRole('button', { name: 'Engine: eval bar' })).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Escape');
  await controls.getByRole('button', { name: 'Engine' }).click();
  await expect(controls.getByRole('button', { name: 'Engine' })).toHaveAttribute('aria-pressed', 'false');

  // The choices carry over to puzzles.
  await page.goto('./#/training');
  await expect(page.getByText(/to move$/)).toBeVisible();
  const pc = page.getByRole('group', { name: 'Engine' });
  await expect(pc.getByRole('button', { name: 'Suggestions' })).toHaveCount(0);
  await pc.getByRole('button', { name: 'Engine' }).click();
  await expect(pc.getByRole('button', { name: 'Suggestions' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText(/Stockfish 19 lite · depth/)).toHaveCount(0);
  await pc.getByRole('button', { name: 'Suggestions' }).click();
  await expect(page.getByText(/Stockfish 19 lite · depth \d+/).filter({ visible: true })).toBeVisible();
  // The engine starts at the puzzle position; your game move can be played there and taken back.
  await page.getByRole('button', { name: /Your move / }).click();
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  // Back and forward, with the keys and the buttons; Esc goes back to the puzzle.
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Forward' }).click();
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);
  await page.keyboard.press('Escape');
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
  await expect(p2.getByText('29 games restored')).toBeVisible();
  await p2.goto('./#/games');
  await expect(p2.locator('[data-game-id]')).not.toHaveCount(0);
  await fresh.close();
});

test('thrown games: lost from +3 or better, as a filter, in Insights and as puzzles', async ({ page }) => {
  await seed(page);
  // The biggest advantage is filled in for restored games in the background.
  await page.goto('./#/games');
  await expect(page.getByText(/^had \+\d+\.\d$/).filter({ visible: true })).toHaveCount(2, { timeout: 30_000 });

  await pick(page, 'Result', 'Thrown games (lost from +3)');
  await expect(page.locator('[data-game-id]')).toHaveCount(2);
  await expect(page.getByText('had +7.5').filter({ visible: true })).toBeVisible();

  await page.goto('./#/insights?tab=results');
  await expect(page.getByText('Thrown games · lost from +3 or better')).toBeVisible();
  await page.getByRole('link', { name: 'All 2' }).click();
  await expect(page.locator('[data-game-id]')).toHaveCount(2);

  // Their review says what happened.
  await page.locator('[data-game-id]').first().click();
  await expect(page.getByText(/You were \+\d+\.\d and let it slip\./)).toBeVisible();

  await page.goto('./#/training');
  await page.getByRole('button', { name: /All puzzles/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Thrown games/ }).click();
  await expect(page.getByRole('button', { name: /Thrown games/ })).toBeVisible();
  await expect(page.getByText(/to move$/)).toBeVisible();
});

test('review edges: missing game, end of game, next game, offline message', async ({ page, context }) => {
  await seed(page);
  // A link to a game that doesn't exist says so (it used to load forever).
  await page.goto('./#/game/does-not-exist');
  await expect(page.getByText('Game not found')).toBeVisible();

  // At the end of a game Next becomes Summary; the summary offers the next game to review.
  await page.goto('./#/games');
  await page.locator('[data-game-id]').first().click();
  await expect(page.getByRole('link', { name: /^Next game · / })).toBeVisible();
  await page.getByRole('button', { name: 'Start review' }).click();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('button', { name: 'Summary', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start review' })).toBeVisible();

  // Restoring a backup keeps this device's display choices (the seed backup says theme "system").
  await expect(page.locator('html')).toHaveClass(/dark/);

  // No network: a plain message, not "Failed to fetch".
  await context.unroute('https://api.chess.com/**');
  await context.route('https://api.chess.com/**', (r) => r.abort());
  await page.goto('./#/settings');
  await page.getByLabel('chess.com username').fill('someone-else');
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByText('No connection to chess.com. Check your internet and try again.')).toBeVisible();
});

/** Drags with the mouse from one square's centre to another (or to a point), in small steps like a hand. */
async function drag(page: Page, from: string, to: string | { x: number; y: number }, opts: { hold?: (p: { x: number; y: number }) => Promise<void> } = {}) {
  const centre = async (sq: string) => {
    const b = (await page.locator(`[data-square="${sq}"]`).first().boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const a = await centre(from);
  const b = typeof to === 'string' ? await centre(to) : to;
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 6, a.y + 6, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await opts.hold?.(b);
  await page.mouse.up();
}

test('dragging pieces: own pieces only, centred under the pointer, snaps back from illegal squares', async ({ page }) => {
  const { Chess } = await import('chess.js');
  await seed(page);
  await openTab(page, 'Train');
  await expect(page.getByText(/to move$/)).toBeVisible();
  const puzzles = await readPuzzles(page);
  const placement = await boardPlacement(page, 'puzzle');
  const current = puzzles.find((p) => p.fen.split(' ')[0] === placement)!;
  const chess = new Chess(current.fen);
  const move = current.solutionUci[0];
  const from = move.slice(0, 2);
  const legal = new Set(chess.moves({ square: from as never, verbose: true }).map((m) => m.to as string));
  const illegal = [...'abcdefgh'].flatMap((f) => [...'12345678'].map((r) => f + r)).find((sq) => sq !== from && !legal.has(sq) && !chess.get(sq as never))!;

  // An opponent's piece can't be picked up.
  const theirs = chess.board().flat().find((p) => p && p.color !== chess.turn())!;
  await drag(page, theirs.square, illegal);
  expect(await boardPlacement(page, 'puzzle')).toBe(placement);

  // Count snap-back animations.
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args: Parameters<typeof animate>) {
      if (this.hasAttribute('data-piece')) (window as unknown as { __snaps: number }).__snaps = ((window as unknown as { __snaps?: number }).__snaps ?? 0) + 1;
      return animate.apply(this, args);
    };
  });

  // While dragging: the piece sits centred under the pointer, the square it left is empty, the legal squares show.
  await drag(page, from, illegal, {
    hold: async (p) => {
      const pieces = page.locator(`[id="puzzle-piece-${chess.get(from as never)!.color}${chess.get(from as never)!.type.toUpperCase()}-${from}"]`);
      await expect(pieces).toHaveCount(2); // the one on its square and the one in your hand
      const box = (await pieces.last().boundingBox())!;
      expect(Math.abs(box.x + box.width / 2 - p.x)).toBeLessThan(3);
      expect(Math.abs(box.y + box.height / 2 - p.y)).toBeLessThan(3);
      expect(await pieces.first().evaluate((e) => getComputedStyle(e).opacity)).toBe('0');
      if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/dragging.png` });
    },
  });
  // Let go on an illegal square: it glides back and nothing is played.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __snaps?: number }).__snaps ?? 0)).toBe(1);
  expect(await boardPlacement(page, 'puzzle')).toBe(placement);
  await expect(page.getByText(/^Solved/)).toHaveCount(0);

  // Put back on its own square: still picked up, so a tap on a target finishes the move.
  await drag(page, from, from);
  await page.waitForTimeout(250); // a person's next tap; clicks right after a drag are ignored
  await clickSquare(page, move.slice(2, 4));
  await expect(page.getByText(/^Solved/)).toBeVisible();
});

/** Answers Groq with a fake: only the key "gsk_test" works; every chat request is kept in `asked`. */
async function fakeGroq(context: BrowserContext, content: string) {
  const asked: string[] = [];
  await context.route('https://api.groq.com/**', async (route) => {
    const req = route.request();
    const ok = req.headers()['authorization'] === 'Bearer gsk_test';
    if (!ok) return route.fulfill({ status: 401, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":{"message":"Invalid API Key"}}' });
    if (req.url().endsWith('/models')) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"data":[]}' });
    asked.push(req.postData() ?? '');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 900, completion_tokens: 60 } }),
    });
  });
  return asked;
}

test("AI coach: a Groq key in Settings turns on Coach's view, which is saved", async ({ page, context }) => {
  // Groq answered by a fake: the key is checked, and the coach writes from the statistics only.
  const asked = await fakeGroq(context, 'You score well.\n- **Time management**: keep half your clock by move 20.');
  await seed(page);
  await openTab(page, 'Insights');
  await expect(page.getByText('It needs a free Groq key')).toBeVisible();

  await page.goto('./#/settings');
  await page.getByLabel('Groq key').fill('gsk_wrong');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText("Groq didn't accept this key")).toBeVisible();
  await page.getByLabel('Groq key').fill('gsk_test');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved in this browser · …test')).toBeVisible();
  if (process.env.E2E_SHOTS) await page.locator('#ai-coach').screenshot({ path: `${process.env.E2E_SHOTS}/coach-settings.png` });

  await openTab(page, 'Insights');
  await page.getByRole('button', { name: "Write my coach's view" }).click();
  await expect(page.getByText('keep half your clock by move 20.')).toBeVisible();
  await expect(page.locator('section', { hasText: "Coach's view" }).last().getByText('AI · may be wrong')).toBeVisible();
  if (process.env.E2E_SHOTS) await page.locator('section', { hasText: "Coach's view" }).last().screenshot({ path: `${process.env.E2E_SHOTS}/coach-view.png` });
  // Statistics only: no names are sent.
  expect(asked).toHaveLength(1);
  expect(asked[0]).toContain('STATS');
  expect(asked[0]).not.toContain(USERNAME);
  // Saved: shown again without asking, and no new one until the games change or a day passes.
  await page.reload();
  await expect(page.getByText('keep half your clock by move 20.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Write/ })).toHaveCount(0);
  expect(asked).toHaveLength(1);
});

test('AI coach: a weekly note on Home, written once a week', async ({ page, context }) => {
  // "Now" is just after a game with two more in the 7 days before it.
  const ends = (JSON.parse(readFileSync(SEED_FILE, 'utf8')).games as { endTime: number }[]).map((g) => g.endTime).sort((x, y) => y - x);
  const j = ends.findIndex((t, i) => i + 2 < ends.length && t - ends[i + 2] < 6 * 86_400_000);
  expect(j, 'three seed games within a week').toBeGreaterThanOrEqual(0);
  await page.clock.setFixedTime(ends[j] + 3_600_000);
  const asked = await fakeGroq(context, 'A busy week: your score went up. Watch the clock in the middlegame.');
  await seed(page);
  // Without a key there is no note.
  await openTab(page, 'Home');
  await expect(page.getByText('This week', { exact: true })).toHaveCount(0);

  await page.evaluate(() => localStorage.setItem('coach-groq-key', 'gsk_test'));
  await page.reload();
  await expect(page.getByText('A busy week: your score went up.')).toBeVisible();
  expect(asked).toHaveLength(1);
  expect(asked[0]).toContain('thisWeek');
  expect(asked[0]).not.toContain(USERNAME);
  // Saved: opening Home again doesn't ask again.
  await page.reload();
  await expect(page.getByText('A busy week: your score went up.')).toBeVisible();
  expect(asked).toHaveLength(1);
});

test('AI coach: ask about your games, answered from looked-up statistics', async ({ page, context }) => {
  // A fake Groq that does what the model does: asks for the "results" tool, then answers from it.
  // The second question gets a made-up number, which the app must flag.
  let round = 0;
  await context.route('https://api.groq.com/**', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    const last = body.messages.at(-1);
    let message: object;
    if (last.role === 'user' && body.tools && !last.content.startsWith('These numbers')) {
      message = { content: null, tool_calls: [{ id: `t${++round}`, type: 'function', function: { name: 'results', arguments: '{"color":"white"}' } }] };
    } else if (last.role === 'tool') {
      const r = JSON.parse(last.content);
      message = { content: body.messages[1].content.includes('Black') ? 'You scored 99% as Black.' : `As White you played ${r.games} games and scored ${r.scorePct}%.` };
    } else {
      message = { content: 'You scored 99% as Black.' };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 500, completion_tokens: 30 } }) });
  });
  await seed(page);
  await page.evaluate(() => localStorage.setItem('coach-groq-key', 'gsk_test'));
  await openTab(page, 'Insights');

  await page.getByLabel('Your question').fill('How do I do with White?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByText(/^As White you played \d+ games and scored \d+%\.$/)).toBeVisible();
  await expect(page.getByText("couldn't be checked")).toHaveCount(0);

  await page.getByLabel('Your question').fill('And with Black?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByText('Some numbers (99) couldn\'t be checked against your statistics.')).toBeVisible();
  // Kept after a reload, newest first.
  await page.reload();
  await expect(page.getByText('And with Black?')).toBeVisible();
  await expect(page.getByText('How do I do with White?')).toBeVisible();
  if (process.env.E2E_SHOTS) await page.locator('section', { hasText: 'Ask about your games' }).last().screenshot({ path: `${process.env.E2E_SHOTS}/ask.png` });
});

test('puzzles: a wrong move shows in red for a moment, then goes back by itself', async ({ page }) => {
  await seed(page);
  await openTab(page, 'Train');
  await expect(page.getByText(/to move$/)).toBeVisible();
  const placement = await boardPlacement(page, 'puzzle');
  const puzzles = (await readPuzzles(page)) as { fen: string; playedUci?: string }[];
  const current = puzzles.find((p) => p.fen.split(' ')[0] === placement)!;
  expect(current.playedUci, 'the puzzle has your game move').toBeTruthy();

  // Your move from the game: played on the board, marked ✗ on red squares…
  await clickSquare(page, current.playedUci!.slice(0, 2));
  await clickSquare(page, current.playedUci!.slice(2, 4));
  const cross = page.locator('[id="puzzle-board"]').getByText('✗');
  await expect(cross).toBeVisible();
  // The try is on the board for a moment (after its slide-in animation).
  await expect.poll(() => boardPlacement(page, 'puzzle'), { intervals: [50], timeout: 1500 }).not.toBe(placement);
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/puzzle-wrong.png` });
  await expect(page.getByText("That's the move you played in the game", { exact: false }).first()).toBeVisible();
  // …then taken back: the puzzle position again, nothing left on the board, and you can try again.
  await expect(cross).toHaveCount(0, { timeout: 3000 });
  await expect.poll(() => boardPlacement(page, 'puzzle')).toBe(placement);
  await expect(page.getByText("That's the move you played in the game", { exact: false }).first()).toBeVisible();
});

test("Today: a game review counts once you've reached its end, not when you open it", async ({ page }) => {
  // Today offers games from the last 14 days for review, so "now" is the day after the newest seed
  // game; on the real date the seed games grow too old and the plan has no review in it.
  const newest = Math.max(...(JSON.parse(readFileSync(SEED_FILE, 'utf8')).games as { endTime: number }[]).map((g) => g.endTime));
  await page.clock.setFixedTime(newest + 86_400_000);
  await seed(page);
  await openTab(page, 'Home');
  const today = page.locator('section', { has: page.getByRole('heading', { name: 'Today', exact: true }) });
  const first = today.getByRole('listitem').first();
  await expect(first).toContainText('Review your game');
  const title = first.locator('span.block').first();
  await expect(title).not.toHaveClass(/line-through/);

  // Open it (it starts at the key moments) and come back: still to do.
  await first.click();
  await expect(page.getByRole('button', { name: 'Next key' }).filter({ visible: true }).first()).toBeVisible();
  await page.goto('./#/');
  await expect(title).not.toHaveClass(/line-through/);

  // Step through to the end: done.
  await first.click();
  await expect(page.getByRole('button', { name: 'Next key' }).filter({ visible: true }).first()).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Summary' }).filter({ visible: true }).first()).toBeVisible();
  await page.goto('./#/');
  await expect(today.getByRole('listitem').first().locator('span.block').first()).toHaveClass(/line-through/);
});

test('offline: the header says so; openings with few games wait behind "Show more"', async ({ page, context }) => {
  await seed(page);
  await openTab(page, 'Home');
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByRole('button', { name: /^Status: Offline/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Status: Offline/ }).first().click();
  await expect(page.getByText("You're offline.")).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Sync' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('button', { name: /^Status: Offline/ })).toHaveCount(0);

  await openTab(page, 'Openings');
  const more = page.getByRole('button', { name: /^Show \d+ more with fewer than 3 games$/ }).first();
  if (await more.isVisible()) {
    const before = await page.locator('li').count();
    await more.click();
    await expect.poll(() => page.locator('li').count()).toBeGreaterThan(before);
  }
});

test('puzzles: open the game, then back to the puzzle where you left it', async ({ page }) => {
  await seed(page);
  await openTab(page, 'Train');
  await expect(page.getByText(/to move$/)).toBeVisible();
  await page.getByRole('button', { name: /Solution/ }).click();
  await page.getByRole('button', { name: 'Full line', exact: true }).click();
  const line = (await page.locator('#puzzle-line').textContent())!;
  await page.getByRole('link', { name: /Open game/ }).click();
  // The review says where back goes.
  await page.getByRole('button', { name: 'Back to puzzle' }).filter({ visible: true }).click();
  // The same puzzle, still revealed, with its line open.
  await expect(page.getByRole('button', { name: /Next puzzle/ })).toBeVisible();
  await expect(page.locator('#puzzle-line')).toHaveText(line);
});

test('review: after a retry, step through the lines and come back to it', async ({ page }) => {
  await seed(page);
  await openTab(page, 'Train');
  await expect(page.getByText(/to move$/)).toBeVisible();
  await page.getByRole('link', { name: /Open game/ }).click();
  await page.getByRole('button', { name: 'Retry', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Show', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Full line', exact: true }).filter({ visible: true }).click();
  await expect(page.getByText(/^The full line after /).filter({ visible: true })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  // Closing the line goes back to the finished retry, with its other line.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Why it fails', exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(/^The best move was /).filter({ visible: true })).toBeVisible();
});

test('weaknesses: the top three, with moments from your games, training and focus', async ({ page }) => {
  await seed(page);
  await openTab(page, 'Weaknesses');
  // Three ranked cards, each with a way to train it (or a tip for time management).
  const cards = page.locator('section', { has: page.getByText('In your games', { exact: true }) });
  await expect(cards).toHaveCount(3);
  await expect(cards.first().getByText('In training', { exact: true })).toBeVisible();
  // A moment from your games opens the review, with the way back named.
  await cards.first().getByRole('link', { name: /^\d+\.{1,3}\S+/ }).first().click();
  await page.getByRole('button', { name: 'Back to Weaknesses' }).filter({ visible: true }).click();
  // Making another area the focus moves the "this week's focus" chip there.
  const other = cards.filter({ has: page.getByRole('button', { name: 'Make it my focus' }) }).first();
  const area = await other.getByRole('heading').innerText();
  await other.getByRole('button', { name: 'Make it my focus' }).click();
  await expect(cards.filter({ hasText: area }).getByText("this week's focus")).toBeVisible();
  // Insights is still there, under More.
  await openTab(page, 'Insights');
  await expect(page.getByRole('tab', { name: 'Skills' })).toBeVisible();
});

test('play from here: after a puzzle, with a hint, take-back and resigning', async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  await page.goto('./#/training');
  await expect(page.getByText(/to move$/)).toBeVisible();
  await page.getByRole('button', { name: /Solution/ }).click();
  await page.getByRole('link', { name: 'Play it out' }).click();
  await expect(page.getByRole('button', { name: 'Back to puzzle' }).filter({ visible: true })).toBeVisible();
  // The engine moves first (the solution was your move), then it's your turn.
  await expect(page.getByText('Your move.')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.getByText(/Hint: move the highlighted piece/)).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'More' }).click();
  await expect(page.getByText(/Hint: the arrow shows the move/)).toBeVisible();
  await page.getByRole('button', { name: 'Take back' }).click();
  await page.getByRole('button', { name: 'Resign' }).click();
  await expect(page.getByText('You resigned.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('play from here: a decisive lead ends as converted, and you can keep playing', async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  await page.goto('./#/play?fen=' + encodeURIComponent('6k1/5ppp/8/8/8/8/5PPP/2QQ2K1 w - - 0 1') + '&you=w&from=position');
  await expect(page.getByText('Your move.')).toBeVisible({ timeout: 15000 });
  await clickSquare(page, 'h2'); await clickSquare(page, 'h3');
  await expect(page.getByText('Your move.')).toBeVisible({ timeout: 15000 });
  await clickSquare(page, 'g2'); await clickSquare(page, 'g3');
  await expect(page.getByText(/Converted!/)).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Keep playing' }).click();
  await expect(page.getByText('Your move.')).toBeVisible({ timeout: 15000 });
  const saved = await page.evaluate(() => new Promise<number>((r) => { const q = indexedDB.open('chess-analyzer'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('playouts'); g.onsuccess = () => r((g.result?.value ?? []).length); }; }));
  expect(saved).toBe(1);
});

/** The piece placement (first field of a FEN) after playing moves from a position. */
function placementAfter(fen: string, moves: string[]): string {
  const c = new Chess(fen);
  for (const m of moves) c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
  return c.fen().split(' ')[0];
}

/** Makes one puzzle the only one due, straight in the app's IndexedDB. */
function onlyDue(page: Page, id: string) {
  return page.evaluate(
    (id) =>
      new Promise<void>((resolve) => {
        const q = indexedDB.open('chess-analyzer');
        q.onsuccess = () => {
          const tx = q.result.transaction('puzzles', 'readwrite');
          const store = tx.objectStore('puzzles');
          const all = store.getAll();
          all.onsuccess = () => all.result.forEach((p) => store.put({ ...p, due: p.id === id ? 0 : Date.now() + 1e10 }));
          tx.oncomplete = () => resolve();
        };
      }),
    id,
  );
}

test('puzzles: a longer puzzle needs your second move too, after their reply', async ({ page }) => {
  await seed(page);
  // Older puzzles get their longer solutions in the background, a moment after loading.
  await page.goto('./#/training');
  // A tactic one (not a small positional one, and without the threat question first), whose line
  // has already been rebuilt: one still waiting may get a longer line after it's read here.
  const isLong = (p: { solutionUci: string[]; motifs?: string[]; solutionV?: number }) =>
    p.solutionV === SOLUTION_VERSION && p.solutionUci.length >= 3 && !!p.motifs?.some((m) => m === 'allowed_tactic' || m === 'hung_piece') && !p.motifs.includes('ignored_threat');
  await expect.poll(async () => (await readPuzzles(page)).filter(isLong).length, { timeout: 15000 }).toBeGreaterThan(0);
  const id = (await readPuzzles(page)).find(isLong)!.id;
  // Only that puzzle is due.
  await onlyDue(page, id);
  await page.reload();
  await expect(page.getByText(/to move$/)).toBeVisible();
  const placement = await boardPlacement(page, 'puzzle');
  const current = (await readPuzzles(page)).find((p) => p.id === id)!;
  expect(current.fen.split(' ')[0]).toBe(placement);
  expect(current, 'the long puzzle is shown').toBeTruthy();
  // A background update marking it done meanwhile (old, already-tried puzzles are) must not swap it out.
  await page.evaluate(
    (id) =>
      new Promise<void>((resolve) => {
        const q = indexedDB.open('chess-analyzer');
        q.onsuccess = () => {
          const tx = q.result.transaction('puzzles', 'readwrite');
          const store = tx.objectStore('puzzles');
          const g = store.get(id);
          g.onsuccess = () => store.put({ ...g.result, doneAt: Date.now(), due: 8.64e15 });
          tx.oncomplete = () => resolve();
        };
      }),
    id,
  );
  await page.waitForTimeout(300);
  expect(await boardPlacement(page, 'puzzle')).toBe(placement);
  // Every move of yours in the line (it may be longer than two). After each but the last: not
  // solved yet, their reply comes, then it's your move again.
  const line = current.solutionUci;
  for (let i = 0; i < line.length; i += 2) {
    await clickSquare(page, line[i].slice(0, 2));
    await clickSquare(page, line[i].slice(2, 4));
    if (i + 1 >= line.length) break;
    await expect(page.getByText(/^Solved/)).toHaveCount(0);
    // Wait for the whole position after their reply: the square it lands on may already hold your piece.
    await expect.poll(() => boardPlacement(page, 'puzzle')).toBe(placementAfter(current.fen, line.slice(0, i + 2)));
    await page.waitForTimeout(400);
  }
  await expect(page.getByText(/^Solved/)).toBeVisible();
});

test('puzzles: spot the threat first, then find your move', async ({ page }) => {
  await seed(page);
  await page.goto('./#/training?threat=1');
  await expect(page.getByText('First: what does your opponent threaten?')).toBeVisible();
  // Your moves wait until you've answered; the usual buttons are hidden.
  await expect(page.getByRole('button', { name: 'Hint' })).toBeHidden();
  // A wrong guess says what the threat was.
  await page.getByRole('button', { name: 'They threaten mate' }).click();
  await expect(page.getByText(/^(✔ Right|Not quite): your opponent threatens/)).toBeVisible();
  await page.getByRole('button', { name: /Now find your move/ }).click();
  await expect(page.getByRole('button', { name: 'Hint' })).toBeVisible();
  await expect(page.getByText('First: what does your opponent threaten?')).toHaveCount(0);
});

test('puzzles: each is done once; after a miss, a new position with the same idea comes next', async ({ page }) => {
  await seed(page);
  await page.goto('./#/training?motif=hung_piece');
  await expect(page.getByText(/to move$/)).toBeVisible();
  type P = { id: string; fen: string; solutionUci: string[]; motifs?: string[]; doneAt?: number; due: number };
  const shown = async () => {
    const placement = await boardPlacement(page, 'puzzle');
    return ((await readPuzzles(page)) as P[]).find((p) => p.fen.split(' ')[0] === placement)!;
  };
  const first = await shown();
  // Missed (the solution shown): it's done for good, and another "hung a piece" position is next.
  await page.getByRole('button', { name: /Solution/ }).click();
  await expect(page.getByText(/^Next: a new position with the same idea \(hung a piece\)\.$/)).toBeVisible();
  await page.getByRole('button', { name: /Next puzzle/ }).click();
  await expect.poll(async () => ((await readPuzzles(page)) as P[]).find((p) => p.id === first.id)?.doneAt).toBeTruthy();
  // (The board shows the new puzzle once its setup move has played.)
  await expect.poll(async () => (await shown())?.id ?? first.id).not.toBe(first.id);
  expect((await shown()).motifs).toContain('hung_piece');
  // It never comes back, also after a reload.
  await page.reload();
  await expect(page.getByText(/to move$/)).toBeVisible();
  await expect.poll(async () => (await shown())?.id ?? first.id).not.toBe(first.id);
  // No mastery anywhere.
  await expect(page.getByText(/Mastery|mastered/)).toHaveCount(0);
});

test("review: a mistake you've made in earlier games says so", async ({ page }) => {
  await seed(page);
  await page.goto('./#/training');
  // Repeats are counted in the background after loading.
  type P = { gameIds: string[]; plies: number[]; repeats?: number; occurrences: number };
  await expect.poll(async () => ((await readPuzzles(page)) as unknown as P[]).filter((p) => (p.repeats ?? 0) > 0).length, { timeout: 15000 }).toBeGreaterThan(0);
  const r = ((await readPuzzles(page)) as unknown as P[]).find((p) => (p.repeats ?? 0) > 0 && p.occurrences === 1)!;
  await page.goto(`./#/game/${encodeURIComponent(r.gameIds[0])}?ply=${r.plies[0] + 1}`);
  const note = page.getByText("You've done this before:").filter({ visible: true });
  await expect(note).toBeVisible({ timeout: 15000 });
  await page.getByRole('link', { name: 'Practise it' }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/#\/training\?motif=/);
});

test('review: explanations say what the reply does and what the better move does', async ({ page }) => {
  await seed(page);
  await page.goto('./#/training');
  // Stored analyses are rebuilt with the new explanations in the background, puzzles with them.
  type P = { gameIds: string[]; plies: number[]; explanation?: string };
  const written = (p: P) => !!p.explanation?.startsWith('After this,') && p.explanation.includes(' was better: it ');
  await expect.poll(async () => ((await readPuzzles(page)) as unknown as P[]).filter(written).length, { timeout: 30000 }).toBeGreaterThan(0);
  const p = ((await readPuzzles(page)) as unknown as P[]).find(written)!;
  await page.goto(`./#/game/${encodeURIComponent(p.gameIds[0])}?ply=${p.plies[0] + 1}`);
  await expect(page.getByText(/^After this, .* was better: it /).filter({ visible: true })).toBeVisible({ timeout: 15000 });
  // With best moves hidden, the better move and what it does are left out.
  await reviewOption(page, 'Best moves');
  await expect(page.getByText(/ was better: it /).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByText(/^After this, /).filter({ visible: true })).toBeVisible();
});

test('weaknesses: a deep look at your last losses, with what to focus on and the games', async ({ page }) => {
  await seed(page);
  await openTab(page, 'Weaknesses');
  await page.getByRole('link', { name: /Your last losses/ }).click();
  await expect(page).toHaveURL(/#\/losses/);
  await expect(page.getByText('What they have in common')).toBeVisible();
  await expect(page.getByRole('heading', { name: /of your last \d+ losses/ })).toBeVisible();
  await expect(page.getByText('What decided each loss')).toBeVisible();
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/losses.png`, fullPage: true });
  // A game opens at its decisive move, with a way back.
  const rows = page.locator('a[href*="#/game/"]');
  expect(await rows.count()).toBeGreaterThanOrEqual(3);
  await rows.first().click();
  await expect(page.getByRole('button', { name: 'Back to your losses' }).filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to your losses' }).filter({ visible: true }).click();
  // Puzzles from those games.
  await page.getByRole('link', { name: /^\d+ puzzles?$/ }).click();
  await expect(page.getByRole('button', { name: /From your last losses/ })).toBeVisible();
  // Each is done once: once finished, it's marked done and won't come back.
  await expect(page.getByText(/to move$/)).toBeVisible();
  await page.getByRole('button', { name: /Solution/ }).click();
  await page.getByRole('button', { name: /Next puzzle/ }).click();
  await expect.poll(async () => ((await readPuzzles(page)) as unknown as { doneAt?: number }[]).filter((p) => p.doneAt).length).toBe(1);
});

test('home: your last game leads, with its decisive moment and its puzzles', async ({ page }) => {
  await seed(page);
  await openTab(page, 'Home');
  const card = page.getByRole('region', { name: 'Your last game' });
  // The move it turned on is the headline.
  await expect(card.getByRole('heading', { name: /^\d+\.+\S+$/ })).toBeVisible();
  // The better move isn't given away here: the review and the puzzle show it.
  await expect(card.getByText(/ was better/)).toHaveCount(0);
  // One tap to the board at that move, and back.
  await card.getByRole('link', { name: 'Show me the moment' }).click();
  await expect(page).toHaveURL(/#\/game\/.*ply=\d+/);
  await page.getByRole('button', { name: 'Back to Home' }).filter({ visible: true }).click();
  // Its puzzles, labelled as this game's.
  await card.getByRole('link', { name: /Puzzles from it \(\d+\)/ }).click();
  await expect(page.getByRole('button', { name: /From your last game/ })).toBeVisible();
  await expect(page.getByText(/to move$/)).toBeVisible();
});
