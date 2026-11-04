import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { SEED_FILE, USERNAME, mockChessCom, openTab, pick, seed } from './helpers';
import { readFileSync } from 'node:fs';

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
  // Best moves can be hidden, to look for them yourself: no arrow, and the coach offers a retry instead.
  const arrows = page.locator('[id="review-board"] svg polygon');
  await expect(arrows).not.toHaveCount(0);
  const bestMoves = page.getByRole('button', { name: 'Best moves' }).filter({ visible: true });
  await bestMoves.click();
  await expect(bestMoves).toHaveAttribute('aria-pressed', 'false');
  await expect(arrows).toHaveCount(0);
  await page.getByRole('button', { name: 'Find a better move' }).filter({ visible: true }).click();
  await expect(page.getByText(/^Find a better move than /).filter({ visible: true })).toBeVisible();
  // The first hint says what to look for, in words.
  await page.getByRole('button', { name: 'Hint' }).filter({ visible: true }).click();
  await expect(page.getByText(/(Look for|No capture or check|There is a checkmate)/).filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop retrying' }).filter({ visible: true }).click();
  // Still hidden on the next visit, until switched back on.
  await expect(arrows).toHaveCount(0);
  await bestMoves.click();
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
  // Hints come in two steps: what to look for in words, then the piece is highlighted.
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.getByRole('status').getByText(/(Look for|No capture or check|There is a checkmate|under attack|threatens mate)/)).toBeVisible();
  await page.getByRole('button', { name: 'More hint' }).click();
  await expect(page.getByRole('button', { name: 'More hint' })).toBeDisabled();
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
  await page.getByTitle('Change focus').click();
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
  const evalBar = controls.getByRole('button', { name: 'Eval bar' });
  const suggestions = controls.getByRole('button', { name: 'Suggestions' });
  // The display options only appear while the engine is open.
  await expect(evalBar).toHaveCount(0);

  // Open the engine: live lines appear, and moves can be played freely.
  await controls.getByRole('button', { name: 'Engine' }).click();
  await expect(evalBar).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Stockfish 19 lite · depth \d+/).filter({ visible: true })).toBeVisible();
  // It opens just before the move, with that move played; the arrow keys step back and forward again.
  const reviewStart = page.locator('button.btn').filter({ hasText: /^\s*Start\s*$/ }).filter({ visible: true });
  await expect(reviewStart).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(reviewStart).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(reviewStart).toBeVisible();
  await suggestions.click();
  await expect(suggestions).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText(/Stockfish 19 lite · depth/)).toHaveCount(0);
  await evalBar.click();
  await expect(evalBar).toHaveAttribute('aria-pressed', 'false');
  await controls.getByRole('button', { name: 'Engine' }).click();
  await expect(controls.getByRole('button', { name: 'Engine' })).toHaveAttribute('aria-pressed', 'false');
  await expect(evalBar).toHaveCount(0);

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
  await expect(p2.getByText('Restored 29 games from backup')).toBeVisible();
  await p2.goto('./#/games');
  await expect(p2.locator('[data-game-id]')).not.toHaveCount(0);
  await fresh.close();
});

test('thrown games: lost from +3 or better, as a filter, in Insights and as puzzles', async ({ page }) => {
  await seed(page);
  // The biggest advantage is filled in for restored games in the background.
  await page.goto('./#/games');
  await expect(page.getByText(/^was \+\d+\.\d$/).filter({ visible: true })).toHaveCount(2, { timeout: 30_000 });

  await pick(page, 'Result', 'Thrown games (lost from +3)');
  await expect(page.locator('[data-game-id]')).toHaveCount(2);
  await expect(page.getByText('was +7.5').filter({ visible: true })).toBeVisible();

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
  await expect(page.getByRole('button', { name: /^Next game · / })).toBeVisible();
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
  await expect(page.getByText(/^✔ /)).toHaveCount(0);

  // Put back on its own square: still picked up, so a tap on a target finishes the move.
  await drag(page, from, from);
  await page.waitForTimeout(250); // a person's next tap; clicks right after a drag are ignored
  await clickSquare(page, move.slice(2, 4));
  await expect(page.getByText(/^✔ /)).toBeVisible();
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
  await page.getByRole('button', { name: /See the full line/ }).click();
  const line = (await page.locator('#puzzle-line').textContent())!;
  await page.getByRole('link', { name: /Open game/ }).click();
  // The review says where back goes.
  await page.getByRole('button', { name: 'Back to puzzle' }).filter({ visible: true }).click();
  // The same puzzle, still revealed, with its line open.
  await expect(page.getByRole('button', { name: /Next puzzle/ })).toBeVisible();
  await expect(page.locator('#puzzle-line')).toHaveText(line);
});
