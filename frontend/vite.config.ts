import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error - plain .mjs build plugin, no types needed
import { seoPlugin } from './vite-plugin-seo.mjs';

// Relative base so the same build works at any GitHub Pages project path.
export default defineConfig({
  base: './',
  plugins: [react(), seoPlugin()],
  server: {
    fs: {
      // allow importing ../shared from the monorepo root
      allow: ['..'],
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
