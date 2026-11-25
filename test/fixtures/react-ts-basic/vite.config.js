import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import viteSSR from '@flowtools/vite-ssr/plugin'

export default defineConfig({
  plugins: [
    viteSSR({
      features: {
        // Manually disable features that are
        // detected because this is a mono repo
        reactStyledComponents: false,
        reactApolloRenderer: false,
      },
    }),
    react(),
  ],
})
