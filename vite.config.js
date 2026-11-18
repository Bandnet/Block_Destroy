import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages under any repository name.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 800,
  },
});
