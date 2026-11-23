import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** ESM library: the kit (index), the Tailwind preset and the test helpers (testing); React stays the extension's own (peer dependency). */
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: { index: 'src/index.ts', 'tailwind-preset': 'src/theme/tailwind-preset.ts', testing: 'src/testing.tsx' },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', '@testing-library/react'],
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
