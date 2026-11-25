import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import viteSSR from '@flowtools/vite-ssr/plugin'
import { Unhead } from '@unhead/vue/vite'
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
    Unhead(),
    vue(),
    {
      // Mock API during development
      configureServer({ middlewares }) {
        api.forEach(({ route, handler }) => middlewares.use(route, handler))
      },
    },
  ],
})
