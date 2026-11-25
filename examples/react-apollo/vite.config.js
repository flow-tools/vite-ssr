import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import viteSSR from '@flowtools/vite-ssr/plugin'
import { api } from '../node-server/api.js'

export default defineConfig({
  ssr: {
    // styled-components only gives Node its CommonJS build, where the
    // default import isn't the `styled` function. Bundle its ESM build.
    noExternal: ['styled-components'],
  },
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
