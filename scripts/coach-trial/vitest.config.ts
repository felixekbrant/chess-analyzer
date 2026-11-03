import { defineConfig } from 'vitest/config';

// Runs the coach trial (trial.run.ts) as a long Vitest "test", so it can import the app's
// TypeScript directly. Not part of `npm test`.
export default defineConfig({
  test: {
    include: [process.env.COACH_WEEKLY ? 'scripts/coach-trial/weekly.run.ts' : 'scripts/coach-trial/trial.run.ts'],
    environment: 'node',
    testTimeout: 24 * 60 * 60_000,
    reporters: ['verbose'],
  },
});
