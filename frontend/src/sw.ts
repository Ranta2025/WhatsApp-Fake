/// <reference lib="webworker" />
import { CACHE_NAME, STATIC_ASSETS, decideFetch, outdatedCacheKeys } from './sw/cache'
import { resolveNotificationClick } from './sw/click'
import { buildNotificationOptions, parseShowNotification } from './sw/notification'

interface PrecacheEntry {
  url: string
  revision: string | null
}

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<PrecacheEntry | string> }

// Required by vite-plugin-pwa (injectManifest). The list is injected at build time.
// precacheAndRoute() is intentionally NOT called yet: its fetch route would take over
// navigations to "/" (cache-first) and change the network-first behavior ported below.
// The strategy switch to Workbox precaching belongs to PW3.
const precacheManifest = self.__WB_MANIFEST

self.addEventListener('install', (event) => {
  console.log('[SW] Instalando...', precacheManifest.length, 'entradas de build')
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([...STATIC_ASSETS]).catch(() => {
        // Si algún asset falla, no bloquear la instalación
        console.warn('[SW] Algunos assets no pudieron cachearse')
      }),
    ),
  )
  void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  console.log('[SW] Activado')
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(outdatedCacheKeys(keys).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  const decision = decideFetch(url.pathname, event.request.mode)

  if (decision === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/').then((cached) => cached ?? Response.error())))
  } else if (decision === 'cache-first') {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)))
  }
})

self.addEventListener('message', (event) => {
  const payload = parseShowNotification(event.data)
  if (!payload) return
  event.waitUntil(self.registration.showNotification(payload.title, buildNotificationOptions(payload, Date.now())))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const decision = resolveNotificationClick(event.action, event.notification.data, clientList, self.location.origin)
      if (decision.kind === 'focus') {
        const client = clientList[decision.clientIndex]
        if (!client) return
        void client.focus()
        if (decision.telephon) {
          client.postMessage({ type: 'NOTIFICATION_CLICK', telephon: decision.telephon })
        }
      } else if (decision.kind === 'open') {
        return self.clients.openWindow(decision.url)
      }
    }),
  )
})
