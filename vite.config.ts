import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Repo is served from https://<org>.github.io/recruiting/ on GitHub Pages,
// so the base path must match the repository name. Override with VITE_BASE
// (e.g. "/" ) if you deploy to a custom domain or the repo is renamed.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/recruiting/',
})
