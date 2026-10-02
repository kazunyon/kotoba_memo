import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command, mode }) => ({
  // Cloud Run serves the application at the root; API traffic is never cached.
  base: command === 'build' ? (loadEnv(mode, '.', '').VITE_BASE_PATH || '/') : '/',
  server: { proxy: { '/api': 'http://localhost:8080', '/auth': 'http://localhost:8080' } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { navigateFallbackDenylist: [/^\/api\//, /^\/auth\//] },
      manifest: {
        name: 'ことばメモ',
        short_name: 'ことばメモ',
        description: 'すぐに開いて思い出せる、個人用のことばメモ',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        lang: 'ja',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
        ]
      }
    })
  ]
}))
