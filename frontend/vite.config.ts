import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Reads the repo root .env (not frontend/.env) so the proxy target
  // always matches the backend's actual port — the same file
  // backend/src/db.ts loads via dotenv. Only PORT is read here; no
  // other .env value is passed to the frontend.
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')
  const backendPort = env.PORT || '3002'

  return {
    plugins: [react()],
    server: {
      proxy: {
        // Proxies to the backend so the frontend can call relative
        // `/api/...` paths without needing CORS middleware on the
        // backend — the frontend's own port varies (5173/5174/...)
        // depending on what else is running.
        '/api': `http://localhost:${backendPort}`,
      },
    },
  }
})
