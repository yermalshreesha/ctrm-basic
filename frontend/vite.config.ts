import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxies to the backend (fixed port 3001, see CLAUDE.md) so the
      // frontend can call relative `/api/...` paths without needing CORS
      // middleware on the backend — the frontend's own port varies
      // (5173/5174/...) depending on what else is running.
      '/api': 'http://localhost:3002',
    },
  },
})
