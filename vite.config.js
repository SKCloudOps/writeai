import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/', // Use '/' for Netlify or custom domains, '/writeai/' for GitHub Pages
})