import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base relativo: funziona su GitHub Pages (https://utente.github.io/repo/) senza configurazioni
export default defineConfig({
  plugins: [react()],
  base: './',
})
