// Screenshots of every screen with the test games loaded, for checking a visual change by eye.
//
//   npm run build && npx vite preview --port 4173 --strictPort &     (leave it running)
//   node scripts/screens.cjs <output folder> [phone|desk]            (both when left out)
//
// Writes <device>-<screen>.png files: home, games, summary, review (at a mistake), why (a line open),
// menu, engine, train, solved (a revealed puzzle), trainfilter, weak, losses, insights, results,
// openings, play, settings. The clock is fixed and chess.com is not contacted, so two runs match.
// Phone = Pixel 7 (412 x 839); desk = 1440 x 900.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE = 'http://localhost:4173/';
const out = process.argv[2];
if (!out) {
  console.error('usage: node scripts/screens.cjs <output folder> [phone|desk]');
  process.exit(1);
}
const OUT = path.resolve(out) + path.sep;
fs.mkdirSync(OUT, { recursive: true });
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'e2e/fixtures/seed.json'), 'utf8'));
// A loss with several mistakes: its review shows every part of the screen.
const gameId = seed.games.find((g) => (g.white + g.black).includes('Alex_aus')).id;

(async () => {
  for (const [name, opts] of [
    ['phone', devices['Pixel 7']],
    ['desk', { viewport: { width: 1440, height: 900 } }],
  ]) {
    if (process.argv[3] && process.argv[3] !== name) continue;
    const browser = await chromium.launch();
    const context = await browser.newContext({ ...opts, serviceWorkers: 'block', deviceScaleFactor: 1 });
    await context.route('https://api.chess.com/**', (r) => r.fulfill({ status: 404, body: '{}' }));
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log(name, 'PAGE ERROR', e.message));
    await page.clock.setFixedTime(new Date('2026-11-03T12:00:00'));
    await page.goto(BASE + '#/settings');
    await page.locator('input[type="file"]').setInputFiles(path.join(ROOT, 'e2e/fixtures/seed.json'));
    await page.getByText(/\d+ games restored/).waitFor();
    await page.goto(BASE + '#/games');
    await page.waitForTimeout(3500);
    await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 1500 }).catch(() => {});

    const shot = async (n, full) => {
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${OUT}${name}-${n}.png`, fullPage: !!full });
    };
    const step = async (n, fn, full) => {
      try {
        await fn();
        await shot(n, full);
      } catch (e) {
        console.log(name, 'FAILED', n, e.message.split('\n')[0]);
      }
    };
    const btn = (label, exact = true) => page.getByRole('button', { name: label, exact }).filter({ visible: true }).first();
    const open = (hash, wait = 1500) => async () => {
      await page.goto(BASE + '#/' + hash);
      await page.waitForTimeout(wait);
    };

    await step('home', open(''));
    await step('games', open('games'));
    await step('summary', async () => {
      await page.goto(BASE + '#/game/' + encodeURIComponent(gameId));
      await btn('Start review').waitFor();
    });
    await step('review', () => btn(/Key moments/, false).click());
    await step('why', () => btn('Why it fails').click());
    await step('menu', async () => {
      await btn('Close the line').click();
      await btn('More options').click();
    });
    await page.keyboard.press('Escape');
    await step('engine', async () => {
      await btn('Engine').click();
      await page.waitForTimeout(3000);
    });
    await step('train', open('training', 2500));
    await step('solved', async () => {
      await btn('Solution').click();
      await page.waitForTimeout(2000);
    });
    await step('trainfilter', () => btn(/All puzzles/, false).click());
    await step('weak', open('weaknesses'), true);
    await step('losses', open('losses'), true);
    await step('insights', open('insights'), true);
    await step('results', open('insights?tab=results'), true);
    await step('openings', open('openings'), true);
    await step('play', open('play'));
    await step('settings', open('settings', 500), true);
    await browser.close();
  }
})();
