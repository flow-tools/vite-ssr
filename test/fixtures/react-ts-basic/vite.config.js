import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import viteSSR from 'vite-ssr/plugin'

export default defineConfig({
  ssr: { format: 'cjs' },
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
