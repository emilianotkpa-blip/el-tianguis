import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'El Tianguis · Panel Administrativo',
        short_name: 'El Tianguis',
        description: 'Sistema de punto de venta — bolsas, desechables e insumos',
        theme_color: '#a02340',
        background_color: '#f8f5f2',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/logo.jpeg', sizes: '192x192', type: 'image/jpeg' },
          { src: '/logo.jpeg', sizes: '512x512', type: 'image/jpeg', purpose: 'any maskable' },
        ],
      },
      devOptions: { enabled: true },
      workbox: {
        navigateFallback: null,
        globPatterns: ['**/*.{js,css,html,jpeg,jpg,png,svg,ico,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', expiration: { maxEntries: 60, maxAgeSeconds: 300 } },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": "http://localhost:3002",
    },
  },
})
