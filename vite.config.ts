import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = import.meta.dirname;

export default defineConfig({
  // repositório "racing-manager" servido em github.io/racing-manager/ (T-006) —
  // sem isso os assets tentam carregar da raiz do domínio e quebram
  base: '/racing-manager/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        trackDebug: resolve(root, 'track-debug.html'),
      },
    },
  },
});
