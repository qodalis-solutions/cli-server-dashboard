import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * One ES module (React and the kit bundled in) plus its stylesheet, served by the servers' databases plugins and
 * loaded by the dashboard as an extension. In this repo the kit comes from its sources.
 */
export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: {
    alias: { '@qodalis/cli-server-dashboard-kit': fileURLToPath(new URL('../../kit/src/index.ts', import.meta.url)) },
  },
  build: {
    lib: { entry: 'src/index.tsx', formats: ['es'], fileName: () => 'extension.js', cssFileName: 'extension' },
    outDir: 'dist',
    emptyOutDir: true,
  },
});
