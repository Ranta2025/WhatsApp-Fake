// Utilidad para manejar notificaciones nativas del sistema operativo
// Funciona fuera del navegador: esquina de Windows, centro de notificaciones en Android/iOS

let swRegistration = null;

/**
 * Registra el Service Worker y guarda la referencia
 */
export async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.warn('[Notif] Service Workers no soportados en este navegador');
        return null;
    }

    try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/'
        });
        swRegistration = registration;
        console.log('[Notif] Service Worker registrado con scope:', registration.scope);

        // Escuchar mensajes del SW (ej: click en notificación)
        navigator.serviceWorker.addEventListener('message', handleSWMessage);

        return registration;
    } catch (error) {
        console.error('[Notif] Error registrando Service Worker:', error);
        return null;
    }
}

/**
 * Solicita permiso para mostrar notificaciones
 * @returns {'granted' | 'denied' | 'default' | 'unsupported'}
 */
export async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.warn('[Notif] Notification API no soportada');
        return 'unsupported';
    }

    if (Notification.permission === 'granted') {
        return 'granted';
    }

    if (Notification.permission === 'denied') {
        return 'denied';
    }

    try {
        const permission = await Notification.requestPermission();
        return permission;
    } catch {
        return 'default';
    }
}

/**
 * Obtiene el estado actual del permiso
 */
export function getNotificationPermission() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
}

/**
 * Muestra una notificación nativa del sistema
 * @param {Object} options
 * @param {string} options.title - Título (nombre del contacto)
 * @param {string} options.body - Contenido del mensaje
 * @param {string} [options.icon] - URL del icono
 * @param {string} [options.tag] - Tag para agrupar (ej: telephon del contacto)
 * @param {Object} [options.data] - Datos extra (ej: { telephon })
 */
export function showNativeNotification({ title, body, icon, tag, data }) {
    if (!('Notification' in window)) return false;
    if (Notification.permission !== 'granted') return false;

    // Intentar vía Service Worker (funciona en background y en móvil)
    if (swRegistration?.active) {
        swRegistration.active.postMessage({
            type: 'SHOW_NOTIFICATION',
            payload: { title, body, icon, tag, data }
        });
        return true;
    }

    // Fallback: Notification API directa (funciona en desktop, NO en móvil background)
    try {
        const notif = new Notification(title, {
            body,
            icon: icon || '/vite.svg',
            tag: tag || 'chat-message',
            renotify: true,
            silent: false
        });

        notif.onclick = () => {
            window.focus();
            notif.close();
            // Disparar evento para que la app abra el chat
            if (data?.telephon) {
                window.dispatchEvent(new CustomEvent('notification-click', {
                    detail: { telephon: data.telephon }
                }));
            }
        };

        return true;
    } catch {
        return false;
    }
}

// Callbacks registrados para manejar clicks en notificaciones
const notificationClickHandlers = [];

/**
 * Registra un callback para cuando el usuario hace click en una notificación
 * @param {Function} handler - Recibe { telephon }
 */
export function onNotificationClick(handler) {
    notificationClickHandlers.push(handler);
}

/**
 * Desregistra un callback
 */
export function offNotificationClick(handler) {
    const idx = notificationClickHandlers.indexOf(handler);
    if (idx > -1) notificationClickHandlers.splice(idx, 1);
}

/**
 * Maneja mensajes del Service Worker
 */
function handleSWMessage(event) {
    const { type, telephon } = event.data || {};
    if (type === 'NOTIFICATION_CLICK' && telephon) {
        notificationClickHandlers.forEach(h => h({ telephon }));
    }
}
