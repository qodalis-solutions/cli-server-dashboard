import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * An extension's build: one ES module (React and the kit bundled in) plus its stylesheet. Outside
 * this repo, drop the alias: the kit comes from npm (`@qodalis/cli-server-dashboard-kit`).
 */
export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: {
    alias: { '@qodalis/cli-server-dashboard-kit': fileURLToPath(new URL('../src/index.ts', import.meta.url)) },
  },
  build: {
    lib: { entry: 'src/index.tsx', formats: ['es'], fileName: () => 'extension.js', cssFileName: 'extension' },
    outDir: 'dist',
    emptyOutDir: true,
  },
});
