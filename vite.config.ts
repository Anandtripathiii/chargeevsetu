import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// BASE_PATH lets the same build run at a sub-path (e.g. GitHub Pages /repo-name/)
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 1500 },
})
