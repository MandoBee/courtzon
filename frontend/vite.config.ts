import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const backend = process.env.BACKEND_URL || 'http://127.0.0.1:3000'

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // Service worker auto-update reloads the page during `npm run dev` and causes visible flicker.
    ...(command === 'build'
      ? [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'images/favicon-light.svg', 'images/favicon-dark.svg', 'icons.svg', 'icon-192.png', 'icon-512.png', 'screenshot-phone.png', 'apple-splash-*.png'],
      manifest: {
        id: '/',
        name: 'CourtZon - Sports Facility Booking',
        short_name: 'CourtZon',
        description: 'Book sports facilities, join tournaments, shop marketplace & connect with coaches',
        theme_color: '#059669',
        background_color: '#fafafa',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'portrait-primary',
        categories: ['sports', 'lifestyle', 'health'],
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        screenshots: [
          { src: '/screenshot-phone.png', sizes: '390x844', type: 'image/png', form_factor: 'narrow', label: 'CourtZon home' },
        ],
        shortcuts: [
          { name: 'Book a Court', url: '/app', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
          { name: 'My Bookings', url: '/bookings', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
          { name: 'Marketplace', url: '/marketplace', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
        ],
        prefer_related_applications: false,
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Fresh-first for user-specific data; fall back to cache when offline.
            urlPattern: ({ url, request }: { url: URL; request: Request }) =>
              request.method === 'GET' && /^\/(notifications|my\/bookings|my\/notifications|my\/orders)(\/|\?|$)/.test(url.pathname + url.search),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'cz-user-cache-v3',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Public read-heavy catalog data — serve stale while revalidating.
            // Geo detection is excluded (always fetch fresh) to avoid stale location data.
            urlPattern: ({ url, request }: { url: URL; request: Request }) => {
              if (request.method !== 'GET') return false;
              const path = url.pathname + url.search;
              if (path.startsWith('/public/geo')) return false;
              return /^\/(branches|marketplace\/products|coaches|academies|tournaments|sports|organisations|public)(\/|\?|$)/.test(path);
            },
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'cz-read-cache-v3',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Same-origin uploaded images only — cache-first.
            urlPattern: ({ url, request }: { url: URL; request: Request }) =>
              request.method === 'GET' &&
              request.destination === 'image' &&
              url.pathname.startsWith('/uploads/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'cz-image-cache-v3',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 3 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // IMPORTANT: No runtime caching rule for cross-origin images.
          // Third-party CDN (e.g., Shopify) images must pass through the SW
          // without interception. A NetworkOnly rule causes net::ERR_FAILED
          // for cross-origin no-cors image fetches in Chrome.
        ],
      },
    }),
      ]
      : []),
    {
      name: 'spa-fallback',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const url = req.url || '';
          if (url === '/favicon.ico' || url.startsWith('/favicon.ico?')) {
            req.url = '/favicon.svg';
          }
          next();
        });
        server.middlewares.use((req, _res, next) => {
          const accept = req.headers.accept || '';
          const url = req.url || '';
          if (accept.includes('text/html') && !url.startsWith('/api') && !url.startsWith('/uploads') && !url.startsWith('/upload')) {
            req.url = '/index.html';
          }
          next();
        });
      },
    },
  ],
  server: {
    port: Number(process.env.VITE_DEV_PORT) || 5173,
    strictPort: false,
    headers: {
      'Permissions-Policy': 'payment=(self "https://accept.paymob.com" "https://accept.paymobsandbox.com")',
    },
    proxy: {
      '/auth': backend,
      '/organisations': backend,
      '/organisation-types': backend,
      '/branches': backend,
      '/resources': backend,
      '/sports': backend,
      '/resource-types': backend,
      '/amenities': backend,
      '/banks': backend,
      '/bank-branches': backend,
      '/subscription-plans': backend,
  '/subscription-features': backend,
      '/bookings': backend,
      '/marketplace': backend,
      '/wallets': backend,
      '/payments': backend,
      '/settlements': backend,
      '/rbac': backend,
      '/roles': backend,
      '/permissions': backend,
      '/permission-modules': backend,
      '/admin': backend,
      '/feature-flags': backend,
      '/user-roles': backend,
      '/users': backend,
      '/my': backend,
      '/settings': backend,
      '/countries': backend,
      '/provinces': backend,
      '/cities': backend,
      '/currencies': backend,
      '/languages': backend,
      '/translations': backend,
      '/player-levels': backend,
      '/ads': backend,
      '/upload': backend,
      '/uploads': backend,
      '/activities': backend,
      '/community': backend,
      '/cms': backend,
      '/coaches': backend,
      '/public': backend,
      '/health': backend,
      '/sidebar': backend,
      '/ui-permissions': backend,
      '/notifications': backend,
      '/notification-preferences': backend,
      '/booking-invitations': backend,
      '/cancellation-policies': backend,
      '/matches': backend,
      '/academies': backend,
      '/tournaments': backend,
      '/sessions': backend,
      '/org': backend,
      '/design-tokens': backend,
      '/reports': backend,
    },
  },
}))
