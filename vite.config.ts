import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '刻度｜专注计划助手',
        short_name: '刻度',
        description: '把任务、专注、复盘与睡眠放在同一条时间刻度上。',
        theme_color: '#5b5ce2',
        background_color: '#f4f6fb',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        lang: 'zh-CN',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' },
})
