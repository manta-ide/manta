import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? '/iframe/' : '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    allowedHosts: true,
    port: 5173,
    fs: { 
      allow: ["..", ".graph", "/absolute/path/to/config"] 
    }
  },
  preview: {
    host: true,
    port: 5173,
  },
})
