import { defineConfig, type Plugin, type UserConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * The build of a dashboard module (modules/<name>): one ES module, `dist/extension.js` (React, the kit and every lazy
 * import bundled in), and its stylesheet `dist/extension.css`, served by a server plugin and loaded by the dashboard as
 * an extension. Exactly these two files: the marketplace records and the servers install only them, so a lazy chunk
 * next to them would be missing on a server that installed the module from the marketplace. In this repo the kit
 * comes from its sources.
 *
 * An app build rather than library mode: library mode leaves ES output unminified (it is meant for bundlers), while
 * this file goes to the browser as is. The entry keeps its exports (the extension).
 */
export function moduleConfig(extra: UserConfig = {}) {
  return defineConfig({
    plugins: [react(), moduleBanner()],
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
          inlineDynamicImports: true,
          assetFileNames: asset => (asset.names?.some(n => n.endsWith('.css')) ? 'extension.css' : '[name]-[hash][extname]'),
        },
      },
    },
    ...extra,
  });
}

/**
 * `/*! <package> <version> *\/` as the first line of `extension.js`, from the module's package.json: the servers read
 * it to show a module embedded in a plugin (added in code) with its package and version on the Marketplace tab.
 * Prepended after minification, so it is always the first line.
 */
export function moduleBanner(dir = process.cwd()): Plugin {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name: string; version: string };
  return {
    name: 'qcli-module-banner',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const entry = bundle['extension.js'];
      if (entry?.type === 'chunk') entry.code = `/*! ${pkg.name} ${pkg.version} */\n${entry.code}`;
    },
  };
}
