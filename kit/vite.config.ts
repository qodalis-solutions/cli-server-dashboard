import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** ESM library: the kit (index) and the Tailwind preset; React stays the extension's own (peer dependency). */
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: { index: 'src/index.ts', 'tailwind-preset': 'src/theme/tailwind-preset.ts' },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
