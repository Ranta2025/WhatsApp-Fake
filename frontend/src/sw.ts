/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { LEGACY_CACHE_NAME, shouldClaimClients } from './sw/cache'
import { resolveNotificationClick } from './sw/click'
import { isSkipWaiting } from './sw/messages'
import { buildNotificationOptions, parseShowNotification } from './sw/notification'
import { NAVIGATION_DENYLIST, hasIndexHtml } from './sw/routes'

interface PrecacheEntry {
  url: string
  revision: string | null
}

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<PrecacheEntry | string> }

// App shell: everything static is precached from the list injected by vite-plugin-pwa.
// Not cached on purpose: /api/* (incl. the websocket) and /storage/* (user media); no route matches them.
// Google Fonts runtime caching is intentionally skipped in v1.
const manifest = self.__WB_MANIFEST
precacheAndRoute(manifest)
cleanupOutdatedCaches()

// Offline navigation: serve the precached index.html. Without it in the manifest, go network-first
// (never a blank response: a failed fetch yields a network error the browser can render).
const navigationHandler = hasIndexHtml(manifest)
  ? createHandlerBoundToURL('/index.html')
  : ({ request }: { request: Request }): Promise<Response> => fetch(request).catch(() => Response.error())
registerRoute(new NavigationRoute(navigationHandler, { denylist: [...NAVIGATION_DENYLIST] }))

// True when this worker is the first one ever installed (no previously active worker).
let isFirstInstall = false

self.addEventListener('install', () => {
  isFirstInstall = shouldClaimClients(self.registration.active)
  // No skipWaiting() here: an update waits until the user accepts it (SKIP_WAITING message).
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key === LEGACY_CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => (isFirstInstall ? self.clients.claim() : undefined)),
  )
})

self.addEventListener('message', (event) => {
  if (isSkipWaiting(event.data)) {
    void self.skipWaiting()
    return
  }
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
