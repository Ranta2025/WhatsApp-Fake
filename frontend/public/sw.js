// Service Worker para notificaciones nativas
// Este archivo DEBE estar en /public para que tenga scope sobre toda la app

const CACHE_NAME = 'chat-app-v1';

// Instalación del Service Worker
self.addEventListener('install', (event) => {
    console.log('[SW] Service Worker instalado');
    self.skipWaiting();
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
    console.log('[SW] Service Worker activado');
    event.waitUntil(self.clients.claim());
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
