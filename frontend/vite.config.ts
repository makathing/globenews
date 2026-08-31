import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build works at any GitHub Pages project path.
export default defineConfig({
  base: './',
  plugins: [react()],
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
