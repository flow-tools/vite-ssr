import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import viteSSR from '@flowtools/vite-ssr/plugin'
import { api } from '../node-server/api.js'

export default defineConfig({
  server: {
    fs: {
      // The API logic is in outside of the project
      strict: false,
    },
  },
  plugins: [
    viteSSR({
      features: {
        // Manually disable features that are
        // detected because this is a mono repo
        reactApolloRenderer: false,
      },
    }),
    react(),
    {
      // Mock API during development
      configureServer({ middlewares }) {
        api.forEach(({ route, handler }) => middlewares.use(route, handler))
      },
    },
  ],
})
