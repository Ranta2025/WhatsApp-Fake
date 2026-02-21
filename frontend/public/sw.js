// Service Worker para notificaciones nativas
// Este archivo DEBE estar en /public para que tenga scope sobre toda la app

const CACHE_NAME = 'chat-app-v1';

// Instalación del Service Worker
self.addEventListener('install', (event) => {
    console.log('[SW] Service Worker instalado');
    self.skipWaiting(); // Activar inmediatamente
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
    console.log('[SW] Service Worker activado');
    event.waitUntil(self.clients.claim()); // Tomar control de todas las páginas
});

// Escuchar mensajes desde la app principal
self.addEventListener('message', (event) => {
    const { type, payload } = event.data || {};

    if (type === 'SHOW_NOTIFICATION') {
        const { title, body, icon, tag, data } = payload;

        event.waitUntil(
            self.registration.showNotification(title, {
                body: body,
                icon: icon || '/vite.svg',
                badge: '/vite.svg',
                tag: tag || 'chat-message', // Agrupa notificaciones del mismo contacto
                renotify: true, // Vibra/suena aunque ya exista una con el mismo tag
                vibrate: [200, 100, 200], // Patrón de vibración para móviles
                requireInteraction: false, // Se cierra sola en PC
                data: data || {},
                actions: [
                    { action: 'open', title: 'Abrir chat' },
                    { action: 'close', title: 'Cerrar' }
                ]
            })
        );
    }
});

// Click en la notificación -> abrir/enfocar la app
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const notifData = event.notification.data || {};

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Si ya hay una ventana abierta, enfocarla y enviarle el dato
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.focus();
                    // Notificar a la app qué chat abrir
                    if (notifData.telephon) {
                        client.postMessage({
                            type: 'NOTIFICATION_CLICK',
                            telephon: notifData.telephon
                        });
                    }
                    return;
                }
            }
            // Si no hay ventana abierta, abrir una nueva
            if (self.clients.openWindow) {
                return self.clients.openWindow('/');
            }
        })
    );
});
