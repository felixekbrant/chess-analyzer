/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative base so the build also works from a GitHub Pages sub-path.
  base: './',
  plugins: [react(), tailwindcss()],
  // The two chunks over the default 500 kB limit are loaded lazily: the opening book (data, only
  // needed when importing/analysing) and the charting library (after the dashboard renders).
  build: { chunkSizeWarningLimit: 800 },
  test: {
    environment: 'node',
  },
});
