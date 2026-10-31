import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O jogo é servido no GitHub Pages em /element-merge/ — o `base` faz os
// assets (JS/CSS) apontarem para o subcaminho em vez da raiz do domínio.
export default defineConfig({
  plugins: [react()],
  base: '/element-merge/',
  build: {
    chunkSizeWarningLimit: 1200, // three.js é grande por natureza; aviso conhecido
  },
});
