import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main process entry point
        entry: path.resolve(__dirname, 'main/index.ts'),
        onstart(options) {
          options.startup();
        },
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['electron', 'sql.js'],
            },
          },
        },
      },
      {
        // Preload scripts
        entry: path.resolve(__dirname, 'preload/index.ts'),
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron/preload',
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './renderer/src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
  root: './renderer',
  build: {
    outDir: '../dist',
  },
});
