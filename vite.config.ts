import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:8047';

export default defineConfig({
  plugins: [react()],
  // Given to extensions (context.dashboardVersion)
  define: { __DASHBOARD_VERSION__: JSON.stringify(version) },
  resolve: {
    // The kit (kit/) is used from its source, not its build
    // The kit from its sources (exact matches: `/testing` is its own entry)
    alias: [
      { find: /^@qodalis\/cli-server-dashboard-kit$/, replacement: fileURLToPath(new URL('./kit/src/index.ts', import.meta.url)) },
      { find: /^@qodalis\/cli-server-dashboard-kit\/testing$/, replacement: fileURLToPath(new URL('./kit/src/testing.tsx', import.meta.url)) },
    ],
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
