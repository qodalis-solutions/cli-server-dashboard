/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:8047';

export default defineConfig({
  plugins: [react()],
  base: '/qcli/admin/',
  test: {
    setupFiles: ['src/test/setup.ts'],
    // The portal (portal/) is its own workspace with its own config: `npm test -w portal`
    exclude: ['**/node_modules/**', 'portal/**'],
  },
  server: {
    proxy: {
      '/api': proxyTarget,
      // The server's color scheme (admin plugin `theme` option)
      '/qcli/admin/theme.json': proxyTarget,
      '/ws': {
        target: proxyTarget.replace(/^http/, 'ws'),
        ws: true,
      },
    },
  },
});
