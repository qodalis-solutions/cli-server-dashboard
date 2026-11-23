import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * The build of a dashboard module (modules/<name>): one ES module, `dist/extension.js` (React and the kit bundled
 * in), its stylesheet `dist/extension.css` and any lazy chunks next to them, served by a server plugin and loaded by
 * the dashboard as an extension. In this repo the kit comes from its sources.
 *
 * An app build rather than library mode: library mode leaves ES output unminified (it is meant for bundlers), while
 * this file goes to the browser as is. The entry keeps its exports (the extension).
 */
export function moduleConfig(extra: UserConfig = {}) {
  return defineConfig({
    plugins: [react()],
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    resolve: {
      alias: { '@qodalis/cli-server-dashboard-kit': fileURLToPath(new URL('../kit/src/index.ts', import.meta.url)) },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: 'src/index.tsx',
        preserveEntrySignatures: 'exports-only',
        output: {
          format: 'es',
          entryFileNames: 'extension.js',
          chunkFileNames: '[name]-[hash].js',
          assetFileNames: asset => (asset.names?.some(n => n.endsWith('.css')) ? 'extension.css' : '[name]-[hash][extname]'),
        },
      },
    },
    ...extra,
  });
}
