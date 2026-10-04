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

/** Espera máxima a `serviceWorker.ready` al suscribir (sin SW registrado nunca resuelve). */
export const SW_READY_TIMEOUT_MS = 5000;

/**
 * PushManager del SW activo para suscribir. `serviceWorker.ready` no se resuelve
 * nunca si no hay SW registrado (vite dev, fallo de registerSW): se acota con un
 * timeout. Resuelve null si el SW no llega a estar listo a tiempo.
 */
const getReadyPushManager = async (): Promise<PushManager | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS); });
    try {
        const registration = await Promise.race([navigator.serviceWorker.ready, timeout]);
        return registration ? registration.pushManager : null;
    } finally {
        clearTimeout(timer);
    }
};

/**
 * PushManager para leer / dar de baja: usa `getRegistration()`, que resuelve
 * de inmediato (undefined sin SW registrado => no puede haber suscripción).
 */
const getRegisteredPushManager = async (): Promise<PushManager | null> => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration ? registration.pushManager : null;
};

/** Suscripción push actual de este navegador, o null (también si no hay soporte o falla). */
export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
    if (!isPushSupported()) return null;
    try {
        const manager = await getRegisteredPushManager();
        if (!manager) return null;
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
        const manager = await getReadyPushManager();
        if (!manager) {
            console.warn('[Push] El Service Worker no está listo: no se puede suscribir');
            return false;
        }
        let subscription = await manager.getSubscription();
        if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
            // Clave VAPID rotada en el servidor: la suscripción vieja ya no sirve.
            // Se borra también su fila en el servidor (errores ignorados) para no dejarla huérfana.
            try {
                await unsubscribePush(subscription.endpoint);
            } catch (err) {
                console.warn('[Push] No se pudo eliminar la suscripción antigua en el servidor:', err);
            }
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
 * Baja solo en el navegador, para cuando la sesión termina sin `logout()`
 * (sesión caducada / rechazada): el DELETE del servidor devolvería 401, así que
 * no se intenta. Nunca lanza.
 */
export async function clearLocalPushSubscription(): Promise<void> {
    const subscription = await getCurrentPushSubscription();
    if (!subscription) return;
    try {
        await subscription.unsubscribe();
    } catch (err) {
        console.error('[Push] Error cancelando la suscripción del navegador:', err);
    }
}

const optOutKey = (userKey: string): string => `push-opt-out:${userKey}`;

/** El usuario desactivó push explícitamente en este navegador (no se re-suscribe solo). */
export function isPushOptedOut(userKey: string): boolean {
    try {
        return localStorage.getItem(optOutKey(userKey)) !== null;
    } catch {
        return false;
    }
}

/** Marca (true) o borra (false) la baja voluntaria de push de este usuario en este navegador. */
export function setPushOptedOut(userKey: string, optedOut: boolean): void {
    try {
        if (optedOut) localStorage.setItem(optOutKey(userKey), '1');
        else localStorage.removeItem(optOutKey(userKey));
    } catch (err) {
        console.warn('[Push] No se pudo guardar la preferencia push:', err);
    }
}

/**
 * Re-sincroniza la suscripción tras el login / al conceder permiso: pide la
 * configuración y, si push está habilitado, hay permiso y el usuario no se dio
 * de baja voluntariamente, llama a `ensurePushSubscription`. Nunca lanza.
 */
export async function syncPushSubscription(userKey: string): Promise<boolean> {
    if (!isPushSupported() || !isPermissionGranted() || isPushOptedOut(userKey)) return false;
    try {
        const config = await getPushConfig();
        if (!config?.enabled) return false;
        return await ensurePushSubscription(config);
    } catch (err) {
        console.error('[Push] Error obteniendo la configuración push:', err);
        return false;
    }
}
