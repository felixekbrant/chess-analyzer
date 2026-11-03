import { defineConfig, devices } from '@playwright/test';

// Browser smoke tests. They run against the production build (`vite preview`), with chess.com's
// API answered from e2e/fixtures, so they need no network and give the same result every time.
// `npm run e2e` runs the smoke tests; `npm run e2e:seed` regenerates e2e/fixtures/seed.json.
const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    // The service worker would cache the build between tests; the app works without it.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Phone-sized (Pixel 7 viewport, touch, mobile user agent) in Chromium.
    { name: 'smoke', testMatch: /.*\.spec\.ts/, testIgnore: /visual\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    // Reference screenshots (e2e/visual.spec.ts-snapshots). Fonts are bundled, so they match across machines.
    { name: 'visual', testMatch: /visual\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    { name: 'seed', testMatch: /seed\.gen\.ts/, timeout: 30 * 60_000, use: { viewport: { width: 1280, height: 800 } } },
    // Real games for the AI coach trial (scripts/coach-trial/README.md); needs network access to chess.com.
    { name: 'coach-trial', testMatch: /coach-trial\.gen\.ts/, timeout: 60 * 60_000, use: { viewport: { width: 1280, height: 800 }, acceptDownloads: true } },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
