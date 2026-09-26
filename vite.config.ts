/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
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
      const pub = publicFiles();
      const hash = createHash('sha256');
      for (const f of assets.sort()) hash.update(f);
      for (const f of pub.sort()) hash.update(f).update(readFileSync(join('public', f)));
      const version = hash.digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: buildServiceWorker([...assets, ...pub], version) });
    },
  };
}

export default defineConfig({
  // Relative base so the build also works from a GitHub Pages sub-path.
  base: './',
  plugins: [react(), tailwindcss(), serviceWorker()],
  // The two chunks over the default 500 kB limit are loaded lazily: the opening book (data, only
  // needed when importing/analysing) and the charting library (after the dashboard renders).
  build: { chunkSizeWarningLimit: 800 },
  test: {
    environment: 'node',
  },
});
