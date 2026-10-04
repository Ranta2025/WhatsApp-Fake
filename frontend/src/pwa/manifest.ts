import type { ManifestOptions } from 'vite-plugin-pwa'

/** Single source of truth for the web app manifest (consumed by vite.config.ts via vite-plugin-pwa). */
export const manifest: Partial<ManifestOptions> = {
  id: '/',
  scope: '/',
  lang: 'es',
  name: 'todos - Chat',
  short_name: 'todos',
  description: 'Chat en tiempo real',
  start_url: '/',
  display: 'standalone',
  orientation: 'any',
  background_color: '#0a1015',
  theme_color: '#0a1015',
  categories: [
    'social',
    'communication'
  ],
  icons: [
    {
      src: '/icons/icon-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any'
    },
    {
      src: '/icons/icon-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any'
    },
    {
      src: '/icons/maskable-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable'
    },
    {
      src: '/icons/icon-512x512.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any'
    }
  ]
}
