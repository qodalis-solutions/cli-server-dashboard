/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * The developer portal (`@qodalis/cli-server-portal`). Built with relative asset URLs (`base: './'`): the servers
 * serve it at any mount and rewrite the `<base href="/" />` of index.html to that mount, so the router, the assets
 * and portal.json all resolve below it.
 */
export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      // The dashboard's theme and self-contained components, shared so the two apps look like one family
      { find: '@dashboard', replacement: resolve(__dirname, '../src') },
      // The kit from its sources, as in the dashboard (it is not built yet when the portal is tested)
      { find: /^@qodalis\/cli-server-dashboard-kit$/, replacement: resolve(__dirname, '../kit/src/index.ts') },
    ],
  },
  server: {
    fs: { allow: ['..'] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Libraries in their own long-cached files: a new portal release only changes the small app chunk
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](highlight\.js|lowlight|rehype-highlight)[\\/]/.test(id)) return 'highlight';
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|scheduler|cookie|set-cookie-parser)[\\/]/.test(id)) return 'react';
          return 'markdown';
        },
      },
    },
  },
  test: {
    setupFiles: ['../src/test/setup.ts'],
  },
});
