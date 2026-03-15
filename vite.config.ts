import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/qcli/admin/',
  server: {
    proxy: {
      '/api': 'http://localhost:8047',
      '/ws': {
        target: 'ws://localhost:8047',
        ws: true,
      },
    },
  },
});
