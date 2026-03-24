import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:8047';

export default defineConfig({
  plugins: [react()],
  base: '/qcli/admin/',
  server: {
    proxy: {
      '/api': proxyTarget,
      '/ws': {
        target: proxyTarget.replace(/^http/, 'ws'),
        ws: true,
      },
    },
  },
});
