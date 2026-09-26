import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Caminhos relativos funcionam em /qualquer-nome-de-repositorio/ e também
  // em desenvolvimento local, sem exigir domínio ou nome fixo de projeto.
  base: './',
  build: {
    target: 'es2022',
  },
})
