// Service Worker para PWA + Notificaciones nativas
// Este archivo DEBE estar en /public para que tenga scope sobre toda la app

const CACHE_NAME = 'todos-chat-v2';
const STATIC_ASSETS = [
    '/',
    '/todos.svg',
    '/icons/icon-192x192.svg',
    '/icons/icon-512x512.svg',
    '/manifest.json',
];

// Instalación: pre-cachear assets esenciales
self.addEventListener('install', (event) => {
    console.log('[SW] Instalando...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch(() => {
                // Si algún asset falla, no bloquear la instalación
                console.warn('[SW] Algunos assets no pudieron cachearse');
            });
        })
    );
    self.skipWaiting();
});

// Activación: limpiar caches antiguos
self.addEventListener('activate', (event) => {
    console.log('[SW] Activado');
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch: network-first para API, cache-first para assets estáticos
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // No interceptar WebSocket ni API calls
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return;

    // Para navegación (HTML), siempre ir a red primero
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => caches.match('/'))
        );
        return;
    }

    // Para assets estáticos: cache-first
    if (STATIC_ASSETS.includes(url.pathname) || url.pathname.startsWith('/icons/')) {
        event.respondWith(
            caches.match(event.request).then((cached) => cached || fetch(event.request))
        );
    }
});

// Escuchar mensajes desde la app principal
self.addEventListener('message', (event) => {
    const { type, payload } = event.data || {};

    if (type === 'SHOW_NOTIFICATION') {
        const { title, body, icon, image, tag, data } = payload;

        const options = {
            body: body,
            icon: icon || '/todos.svg',
            badge: icon || '/todos.svg',
            tag: tag || 'chat-message',
            renotify: true,
            vibrate: [100, 50, 100],
            requireInteraction: false,
            timestamp: Date.now(),
            data: data || {},
            actions: [
                { action: 'open', title: 'Abrir' },
                { action: 'close', title: 'Cerrar' }
            ]
        };

        if (image) {
            options.image = image;
        }

        event.waitUntil(
            self.registration.showNotification(title, options)
        );
    }
});

// Click en la notificación -> abrir/enfocar la app
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    // Si clickeó "Cerrar", simplemente cerrar
    if (event.action === 'close') return;

    const notifData = event.notification.data || {};

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.focus();
                    if (notifData.telephon) {
                        client.postMessage({
                            type: 'NOTIFICATION_CLICK',
                            telephon: notifData.telephon
                        });
                    }
                    return;
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow('/');
            }
        })
    );
});
