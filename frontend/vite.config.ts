import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error - plain .mjs build plugin, no types needed
import { seoPlugin } from './vite-plugin-seo.mjs';

// Relative base so the same build works at any GitHub Pages project path.
export default defineConfig({
  base: './',
  // Every other asset is content-hashed by Vite, so a new build always wins.
  // data/events.json keeps its filename forever, which meant a returning
  // visitor kept whatever their browser had cached — the news would deploy
  // and still read "3d ago" until the cache aged out on its own.
  define: {
    __BUILD_ID__: JSON.stringify(Date.now().toString(36)),
  },
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
