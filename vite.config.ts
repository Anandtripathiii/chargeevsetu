import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// Code used only by the admin app (src/admin/**) is emitted under /admin/assets/, which middleware.ts protects,
// so normal visitors never download it. Shared code (UI kit, data helpers) stays in /assets/.
const ADMIN = /[\/]src[\/]admin[\/]|[\/]admin[\/]index\.html/
const adminOnly = (c: { facadeModuleId: string | null; moduleIds: string[] }) =>
  (c.facadeModuleId != null && ADMIN.test(c.facadeModuleId)) || (c.moduleIds.length > 0 && c.moduleIds.every((id) => ADMIN.test(id)))

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), admin: resolve(__dirname, 'admin/index.html') },
      output: {
        entryFileNames: (c) => (c.name === 'admin' ? 'admin/assets/[name]-[hash].js' : 'assets/[name]-[hash].js'),
        chunkFileNames: (c) => (adminOnly(c) ? 'admin/assets/[name]-[hash].js' : 'assets/[name]-[hash].js'),
      },
    },
  },
})
