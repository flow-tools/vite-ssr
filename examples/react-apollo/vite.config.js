import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import viteSSR from 'vite-ssr/plugin'
import { api } from '../node-server/api'

export default defineConfig({
  ssr: { format: 'cjs' },
  plugins: [
    viteSSR(),
    react(),
    {
      // Mock API during development
      configureServer({ middlewares }) {
        api.forEach(({ route, handler }) => middlewares.use(route, handler))
      },
    },
  ],
})
