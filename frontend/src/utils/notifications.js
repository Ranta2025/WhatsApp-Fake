// Utilidad para manejar notificaciones nativas del sistema operativo
// Genera iconos circulares dinámicos estilo Telegram/WhatsApp

let swRegistration = null;

// Cache de iconos generados para no regenerar cada vez
const iconCache = new Map();

// Paleta de colores estilo Telegram para avatars sin foto
const AVATAR_COLORS = [
    ['#FF6B6B', '#EE5A24'], // Rojo
    ['#7C5CFC', '#6C5CE7'], // Púrpura
    ['#00B894', '#00A381'], // Verde
    ['#FDCB6E', '#F39C12'], // Amarillo
    ['#74B9FF', '#0984E3'], // Azul
    ['#FD79A8', '#E84393'], // Rosa
    ['#00CEC9', '#01A3A4'], // Teal
    ['#E17055', '#D63031'], // Naranja
];

/**
 * Genera un icono circular con avatar o inicial del contacto
 * Usa OffscreenCanvas/Canvas para crear un PNG blob URL
 */
async function generateNotificationIcon(avatarUrl, name) {
    // Si tenemos avatar URL, intentar convertirlo a circular
    if (avatarUrl) {
        const cacheKey = `avatar_${avatarUrl}`;
        if (iconCache.has(cacheKey)) return iconCache.get(cacheKey);

        try {
            const icon = await createCircularAvatar(avatarUrl);
            if (icon) {
                iconCache.set(cacheKey, icon);
                return icon;
            }
        } catch {
            // Si falla, generar con inicial
        }
    }

    // Generar icono con inicial y color basado en el nombre
    const initial = (name || '?').charAt(0).toUpperCase();
    const cacheKey = `init_${initial}_${name}`;
    if (iconCache.has(cacheKey)) return iconCache.get(cacheKey);

    const icon = createInitialAvatar(initial, name || '');
    iconCache.set(cacheKey, icon);
    return icon;
}

/**
 * Crea un avatar circular a partir de una URL de imagen
 */
function createCircularAvatar(imageUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const size = 192;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');

                // Fondo
                ctx.fillStyle = '#0F172A';
                ctx.fillRect(0, 0, size, size);

                // Recorte circular
                ctx.beginPath();
                ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();

                // Dibujar imagen centrada y recortada
                const aspect = img.width / img.height;
                let sx = 0, sy = 0, sw = img.width, sh = img.height;
                if (aspect > 1) {
                    sx = (img.width - img.height) / 2;
                    sw = img.height;
                } else {
                    sy = (img.height - img.width) / 2;
                    sh = img.width;
                }
                ctx.drawImage(img, sx, sy, sw, sh, 4, 4, size - 8, size - 8);

                // Borde sutil
                ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
                ctx.stroke();

                resolve(canvas.toDataURL('image/png'));
            } catch {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        // Timeout para no bloquear
        setTimeout(() => resolve(null), 3000);
        img.src = imageUrl;
    });
}

/**
 * Crea un avatar con inicial estilo Telegram (gradiente + letra grande)
 */
function createInitialAvatar(initial, name) {
    const size = 192;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Color basado en hash del nombre
    const colorIdx = Math.abs(hashCode(name)) % AVATAR_COLORS.length;
    const [color1, color2] = AVATAR_COLORS[colorIdx];

    // Fondo
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, size, size);

    // Círculo con gradiente
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Inicial centrada
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 80px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, size / 2, size / 2 + 2);

    return canvas.toDataURL('image/png');
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

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
 * Muestra una notificación nativa con avatar circular generado dinámicamente.
 * Genera PNG en canvas para que se vea bonita en Windows/macOS/Android.
 */
export async function showNativeNotification({ title, body, icon, image, tag, data, contactName }) {
    if (!('Notification' in window)) return false;
    if (Notification.permission !== 'granted') return false;

    // Generar icono circular bonito (PNG)
    const generatedIcon = await generateNotificationIcon(icon, contactName || title);

    // Intentar vía Service Worker
    if (swRegistration?.active) {
        swRegistration.active.postMessage({
            type: 'SHOW_NOTIFICATION',
            payload: {
                title,
                body,
                icon: generatedIcon,
                image,
                tag,
                data,
            }
        });
        return true;
    }

    // Fallback: Notification API directa
    try {
        const notif = new Notification(title, {
            body,
            icon: generatedIcon,
            image: image || undefined,
            tag: tag || 'chat-message',
            renotify: true,
            silent: false,
        });

        notif.onclick = () => {
            window.focus();
            notif.close();
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
