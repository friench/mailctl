import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@contracts': fileURLToPath(new URL('../src/contracts/index.ts', import.meta.url)),
    },
  },
  base: '/admin/',
  server: {
    port: 5173,
    proxy: {
      '/admin/api': 'http://localhost:3050',
      '/admin/auth': 'http://localhost:3050',
      '/jobs': 'http://localhost:3050',
      '/health': 'http://localhost:3050',
      '/send': 'http://localhost:3050',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
