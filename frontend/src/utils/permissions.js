/**
 * Utilidad para verificar y solicitar todos los permisos del navegador de una vez.
 * Incluye: Notificaciones, Micrófono y Cámara.
 */

/**
 * Verifica el estado actual de un permiso sin solicitarlo.
 * @param {'notifications'|'microphone'|'camera'} name
 * @returns {Promise<'granted'|'denied'|'prompt'|'unsupported'>}
 */
export async function checkPermission(name) {
    if (!('permissions' in navigator)) return 'unsupported';
    try {
        const result = await navigator.permissions.query({ name });
        return result.state; // 'granted' | 'denied' | 'prompt'
    } catch {
        return 'unsupported';
    }
}

/**
 * Verifica si todos los permisos necesarios ya están concedidos.
 * @returns {Promise<boolean>}
 */
export async function allPermissionsGranted() {
    const [notif, mic, cam] = await Promise.all([
        checkPermission('notifications'),
        checkPermission('microphone'),
        checkPermission('camera'),
    ]);
    return notif === 'granted' && mic === 'granted' && cam === 'granted';
}

/**
 * Verifica si algún permiso aún no ha sido decidido (estado 'prompt').
 * Si todos están 'granted' o 'denied', no hay nada que pedir.
 * @returns {Promise<boolean>}
 */
export async function needsPermissionsPrompt() {
    const [notif, mic, cam] = await Promise.all([
        checkPermission('notifications'),
        checkPermission('microphone'),
        checkPermission('camera'),
    ]);
    // Mostrar el diálogo solo si al menos uno está en 'prompt'
    return notif === 'prompt' || mic === 'prompt' || cam === 'prompt';
}

/**
 * Solicita todos los permisos de una vez.
 * Retorna un objeto con el resultado de cada permiso.
 * @returns {Promise<{notifications: string, microphone: string, camera: string}>}
 */
export async function requestAllPermissions() {
    const results = {
        notifications: 'unsupported',
        microphone: 'unsupported',
        camera: 'unsupported',
    };

    // 1. Notificaciones
    if ('Notification' in window) {
        try {
            results.notifications = await Notification.requestPermission();
        } catch {
            results.notifications = 'denied';
        }
    }

    // 2. Micrófono + Cámara (una sola llamada para ambos, el browser hace un solo popup)
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        results.microphone = 'granted';
        results.camera = 'granted';
        // Liberar el stream inmediatamente, solo queríamos el permiso
        stream.getTracks().forEach(t => t.stop());
    } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            results.microphone = 'denied';
            results.camera = 'denied';
        } else if (err.name === 'NotFoundError') {
            // Sin cámara, intentar solo micrófono
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                results.microphone = 'granted';
                results.camera = 'unsupported';
                stream.getTracks().forEach(t => t.stop());
            } catch {
                results.microphone = 'denied';
                results.camera = 'unsupported';
            }
        }
    }

    return results;
}
