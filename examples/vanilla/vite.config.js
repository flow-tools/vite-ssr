import { defineConfig } from 'vite'
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
    viteSSR(),
    {
      // Mock API during development
      configureServer({ middlewares }) {
        api.forEach(({ route, handler }) => middlewares.use(route, handler))
      },
    },
  ],
})
