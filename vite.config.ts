import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O jogo é servido no GitHub Pages em /element-merge/ — o `base` faz os
// assets (JS/CSS) apontarem para o subcaminho em vez da raiz do domínio.
// A branch dev publica como PREVIEW do Pages num subdiretório que só se
// descobre depois do primeiro deploy — o workflow entrega VITE_BASE='./'
// (base relativa), que funciona em QUALQUER diretório. main segue fixa.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/element-merge/',
  build: {
    chunkSizeWarningLimit: 1200, // three.js é grande por natureza; aviso conhecido
  },
});
