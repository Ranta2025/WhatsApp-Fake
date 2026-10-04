// Suscripción Web Push del cliente (lado página). El Service Worker que recibe
// los `push` vive en src/sw.ts; aquí solo se gestiona la suscripción y su
// registro en el servidor. Ninguna función lanza: registran el error y siguen.

import { getPushConfig, subscribePush, unsubscribePush } from '../api/pushApi';
import type { PushConfig } from '../types/api';

/** Decodifica una clave VAPID base64url (sin padding) a bytes. */
export function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
    const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

/** El navegador soporta Web Push (Service Worker + PushManager + Notification). */
export function isPushSupported(): boolean {
    return typeof navigator !== 'undefined'
        && 'serviceWorker' in navigator
        && typeof window !== 'undefined'
        && 'PushManager' in window
        && 'Notification' in window;
}

const isPermissionGranted = (): boolean => Notification.permission === 'granted';

const sameKey = (current: ArrayBuffer | null, expected: Uint8Array): boolean => {
    if (!current || current.byteLength !== expected.length) return false;
    const bytes = new Uint8Array(current);
    return bytes.every((b, i) => b === expected[i]);
};

const getPushManager = async (): Promise<PushManager> => {
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager;
};

/** Suscripción push actual de este navegador, o null (también si no hay soporte o falla). */
export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
    if (!isPushSupported()) return null;
    try {
        const manager = await getPushManager();
        return await manager.getSubscription();
    } catch (err) {
        console.error('[Push] Error leyendo la suscripción:', err);
        return null;
    }
}

let inflight: Promise<boolean> | null = null;

const doEnsure = async (config: PushConfig): Promise<boolean> => {
    try {
        const key = urlBase64ToUint8Array(config.publicKey);
        const manager = await getPushManager();
        let subscription = await manager.getSubscription();
        if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
            // Clave VAPID rotada en el servidor: la suscripción vieja ya no sirve.
            await subscription.unsubscribe();
            subscription = null;
        }
        subscription ??= await manager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        // Siempre se registra (idempotente): los endpoints pueden rotar y es el re-sync tras login.
        await subscribePush(subscription.toJSON());
        return true;
    } catch (err) {
        console.error('[Push] Error suscribiendo:', err);
        return false;
    }
};

/**
 * Garantiza que este navegador está suscrito con la clave del servidor y
 * registrado en `push/subscribe`. Solo actúa con soporte, permiso concedido y
 * push habilitado. Resuelve true si la suscripción quedó registrada.
 * Llamadas concurrentes comparten la misma operación.
 */
export function ensurePushSubscription(config: PushConfig): Promise<boolean> {
    if (!isPushSupported() || !isPermissionGranted() || !config.enabled) return Promise.resolve(false);
    inflight ??= doEnsure(config).finally(() => { inflight = null; });
    return inflight;
}

/**
 * Da de baja la suscripción de este navegador: primero en el servidor (los
 * errores de red se ignoran) y luego en el navegador. Nunca lanza.
 */
export async function removePushSubscription(): Promise<void> {
    const subscription = await getCurrentPushSubscription();
    if (!subscription) return;
    try {
        await unsubscribePush(subscription.endpoint);
    } catch (err) {
        console.warn('[Push] No se pudo eliminar la suscripción en el servidor:', err);
    }
    try {
        await subscription.unsubscribe();
    } catch (err) {
        console.error('[Push] Error cancelando la suscripción del navegador:', err);
    }
}

/**
 * Re-sincroniza la suscripción tras el login / al conceder permiso: pide la
 * configuración y, si push está habilitado y hay permiso, llama a
 * `ensurePushSubscription`. Nunca lanza.
 */
export async function syncPushSubscription(): Promise<boolean> {
    if (!isPushSupported() || !isPermissionGranted()) return false;
    try {
        const config = await getPushConfig();
        if (!config?.enabled) return false;
        return await ensurePushSubscription(config);
    } catch (err) {
        console.error('[Push] Error obteniendo la configuración push:', err);
        return false;
    }
}
