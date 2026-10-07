import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  worker: {
    format: 'es',
  },
  plugins: [
    react(),
    VitePWA({
      // Updates wait for the user: reloading mid-test would throw the run away.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Uplink Speed Test',
        short_name: 'Uplink',
        description: 'Measure latency, jitter, download and upload speed between this device and your server.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0c0d0f',
        theme_color: '#0c0d0f',
        categories: ['utilities'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            name: 'Run speed test',
            short_name: 'Run test',
            url: '/?start=1',
            icons: [{ src: '/icons/icon-96.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'History',
            url: '/history',
            icons: [{ src: '/icons/icon-96.png', sizes: '96x96', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        globIgnores: ['screenshots/**'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/ws\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Lets the installed app show the last known history while the server is unreachable.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && /^\/api\/(tests|devices|info)(\/|$|\?)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'uplink-api',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 60, maxAgeSeconds: 14 * 24 * 60 * 60 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
