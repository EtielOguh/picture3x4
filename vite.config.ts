import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // O runtime fica em public/ort para funcionar no subdiretório do Pages e
  // não ser duplicado dentro do bundle JavaScript.
  resolve: {
    conditions: ['onnxruntime-web-use-extern-wasm'],
  },
  // Caminhos relativos funcionam em /qualquer-nome-de-repositorio/ e também
  // em desenvolvimento local, sem exigir domínio ou nome fixo de projeto.
  base: './',
  build: {
    target: 'es2022',
  },
})
