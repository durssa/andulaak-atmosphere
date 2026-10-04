import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_BASE lets the GitHub Pages workflow build under the repository sub-path.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0') },
  plugins: [react()],
  build: {
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
  },
})
