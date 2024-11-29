import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import viteSSR from '@flowtools/plugin'

// https://vitejs.dev/config/
export default defineConfig({
  ssr: { format: 'cjs' },
  plugins: [viteSSR(), vue()],
})
