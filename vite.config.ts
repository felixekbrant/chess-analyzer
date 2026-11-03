/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { buildServiceWorker } from './src/pwa/buildServiceWorker.ts';

/** All files under public/ (engine, icons, manifest), relative paths with forward slashes. */
function publicFiles(dir = 'public'): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (!name.startsWith('.')) out.push(relative(dir, p).split('\\').join('/'));
    }
  };
  walk(dir);
  return out;
}

/** Emits sw.js with every built asset and public file precached, versioned by their contents. */
function serviceWorker(): Plugin {
  return {
    name: 'chess-analyzer-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      // Puzzle packs are fetched only when a drill needs one (then cached), not on install.
      const pub = publicFiles().filter((f) => !f.startsWith('puzzles/'));
      const hash = createHash('sha256');
      for (const f of assets.sort()) hash.update(f);
      for (const f of pub.sort()) hash.update(f).update(readFileSync(join('public', f)));
      const version = hash.digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: buildServiceWorker([...assets, ...pub], version) });
    },
  };
}

/** This build's version and its latest changes (commit subjects), for "What's new" in the app. */
function buildInfo() {
  const git = (cmd: string) => {
    try {
      return execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return '';
    }
  };
  return {
    version: git('rev-parse --short HEAD') || 'dev',
    date: new Date().toISOString().slice(0, 10),
    changes: git('log -8 --format=%s')
      .split('\n')
      .filter((s) => s && !/^(Test|Plan|Seed|AI coach: trial|Coach trial)/i.test(s))
      .slice(0, 5),
  };
}

export default defineConfig({
  define: { __BUILD__: JSON.stringify(buildInfo()) },
  // Relative base so the build also works from a GitHub Pages sub-path.
  base: './',
  plugins: [react(), tailwindcss(), serviceWorker()],
  // The two chunks over the default 500 kB limit are loaded lazily: the opening book (data, only
  // needed when importing/analysing) and the charting library (after the dashboard renders).
  build: { chunkSizeWarningLimit: 800 },
  test: {
    environment: 'node',
    // Browser tests in e2e/ run with Playwright (`npm run e2e`), not Vitest.
    exclude: ['**/node_modules/**', 'e2e/**'],
    // The contrast test reads the theme tokens from index.css as text.
    css: { include: [/index\.css/] },
  },
});
