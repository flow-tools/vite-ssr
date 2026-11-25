import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import viteSSR from '@flowtools/vite-ssr/plugin'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [viteSSR(), vue()],
})
