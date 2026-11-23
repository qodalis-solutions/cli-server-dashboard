import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:8047';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The kit (kit/) is used from its source, not its build
    alias: { '@qodalis/cli-server-dashboard-kit': fileURLToPath(new URL('./kit/src/index.ts', import.meta.url)) },
  },
  base: '/qcli/admin/',
  test: {
    setupFiles: ['src/test/setup.ts'],
    // The portal (portal/) is its own workspace with its own config: `npm test -w portal`
    exclude: [...configDefaults.exclude, 'portal/**', 'kit/example/**'],
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
