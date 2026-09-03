import { defineConfig } from 'vite';

/** @type {import('vite').UserConfig} */
export default defineConfig({
  base: process.env.GLAZE_SITE ? '/playground/' : '/',
  build: process.env.GLAZE_SITE
    ? {
        outDir: '../dist/playground',
        emptyOutDir: true,
      }
    : undefined,
});
