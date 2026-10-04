// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSubscribePush = vi.fn();
const mockUnsubscribePush = vi.fn();
const mockGetPushConfig = vi.fn();
vi.mock('../api/pushApi', () => ({
    subscribePush: (...a: unknown[]) => mockSubscribePush(...a),
    unsubscribePush: (...a: unknown[]) => mockUnsubscribePush(...a),
    getPushConfig: (...a: unknown[]) => mockGetPushConfig(...a),
}));

import {
    urlBase64ToUint8Array, isPushSupported, ensurePushSubscription, removePushSubscription,
    getCurrentPushSubscription, syncPushSubscription, clearLocalPushSubscription,
    isPushOptedOut, setPushOptedOut, SW_READY_TIMEOUT_MS,
} from './push';
import type { PushConfig } from '../types/api';

// "BAEC_w" = bytes [4, 1, 2, 255] in base64url.
const KEY = 'BAEC_w';
const KEY_BYTES = [4, 1, 2, 255];
const CONFIG: PushConfig = { enabled: true, publicKey: KEY, preview: true };

interface FakeSub {
    endpoint: string;
    options: { applicationServerKey: ArrayBuffer | null };
    toJSON: () => unknown;
    unsubscribe: ReturnType<typeof vi.fn>;
}

const makeSub = (endpoint: string, keyBytes: number[] | null): FakeSub => ({
    endpoint,
    options: { applicationServerKey: keyBytes ? new Uint8Array(keyBytes).buffer : null },
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
});

let current: FakeSub | null;
const pushManager = {
    getSubscription: vi.fn(() => Promise.resolve(current)),
    subscribe: vi.fn((_opts: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }) => {
        current = makeSub('https://push/new', KEY_BYTES);
        return Promise.resolve(current);
    }),
};

const registration = { pushManager };
const never = <T,>(): Promise<T> => new Promise<T>(() => undefined);

interface SwOverrides {
    ready?: Promise<unknown>;
    getRegistration?: () => Promise<unknown>;
}

const install = (permission: NotificationPermission, sw: SwOverrides = {}) => {
    Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
            ready: sw.ready ?? Promise.resolve(registration),
            getRegistration: sw.getRegistration ?? (() => Promise.resolve(registration)),
        },
    });
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
    Object.defineProperty(window, 'Notification', { configurable: true, value: { permission } });
};

const uninstall = () => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    Reflect.deleteProperty(window, 'PushManager');
    Reflect.deleteProperty(window, 'Notification');
};

describe('urlBase64ToUint8Array', () => {
    it('decodes base64url (with -, _ and no padding) into bytes', () => {
        expect(Array.from(urlBase64ToUint8Array(KEY))).toEqual(KEY_BYTES);
        expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255]);
        expect(Array.from(urlBase64ToUint8Array('aGVsbG8'))).toEqual([104, 101, 108, 108, 111]);
    });
});

describe('push subscription lifecycle', () => {
    beforeEach(() => {
        current = null;
        localStorage.clear();
        vi.clearAllMocks();
        mockSubscribePush.mockResolvedValue(undefined);
        mockUnsubscribePush.mockResolvedValue(undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        install('granted');
    });

    afterEach(() => {
        uninstall();
        vi.restoreAllMocks();
    });

    it('isPushSupported needs serviceWorker, PushManager and Notification', () => {
        expect(isPushSupported()).toBe(true);
        Reflect.deleteProperty(window, 'PushManager');
        expect(isPushSupported()).toBe(false);
    });

    it('subscribes with the server key and POSTs the subscription', async () => {
        expect(await ensurePushSubscription(CONFIG)).toBe(true);
        expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
        const opts = pushManager.subscribe.mock.calls[0]![0];
        expect(opts.userVisibleOnly).toBe(true);
        expect(Array.from(opts.applicationServerKey)).toEqual(KEY_BYTES);
        expect(mockSubscribePush).toHaveBeenCalledWith({
            endpoint: 'https://push/new', expirationTime: null, keys: { p256dh: 'p', auth: 'a' },
        });
    });

    it('reuses an existing subscription with the same key (still re-POSTs it)', async () => {
        const existing = makeSub('https://push/old', KEY_BYTES);
        current = existing;
        expect(await ensurePushSubscription(CONFIG)).toBe(true);
        expect(pushManager.subscribe).not.toHaveBeenCalled();
        expect(existing.unsubscribe).not.toHaveBeenCalled();
        expect(mockSubscribePush).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://push/old' }));
    });

    it('unsubscribes and resubscribes when the existing key does not match', async () => {
        const stale = makeSub('https://push/stale', [9, 9, 9]);
        current = stale;
        expect(await ensurePushSubscription(CONFIG)).toBe(true);
        expect(stale.unsubscribe).toHaveBeenCalled();
        expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
        expect(mockSubscribePush).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://push/new' }));
    });

    it('on key rotation DELETEs the stale endpoint on the server before unsubscribing it', async () => {
        const stale = makeSub('https://push/stale', [9, 9, 9]);
        current = stale;
        const order: string[] = [];
        mockUnsubscribePush.mockImplementation(() => { order.push('api'); return Promise.resolve(); });
        stale.unsubscribe.mockImplementation(() => { order.push('browser'); return Promise.resolve(true); });
        expect(await ensurePushSubscription(CONFIG)).toBe(true);
        expect(mockUnsubscribePush).toHaveBeenCalledWith('https://push/stale');
        expect(order).toEqual(['api', 'browser']);
    });

    it('on key rotation ignores a failed DELETE of the stale endpoint', async () => {
        const stale = makeSub('https://push/stale', [9, 9, 9]);
        current = stale;
        mockUnsubscribePush.mockRejectedValue(new Error('Network Error'));
        expect(await ensurePushSubscription(CONFIG)).toBe(true);
        expect(stale.unsubscribe).toHaveBeenCalled();
        expect(mockSubscribePush).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://push/new' }));
    });

    it('concurrent ensure calls share one run (one subscribe, one POST)', async () => {
        const [a, b] = await Promise.all([ensurePushSubscription(CONFIG), ensurePushSubscription(CONFIG)]);
        expect(a).toBe(true);
        expect(b).toBe(true);
        expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
        expect(mockSubscribePush).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when push is disabled', async () => {
        expect(await ensurePushSubscription({ enabled: false, publicKey: '', preview: true })).toBe(false);
        expect(pushManager.subscribe).not.toHaveBeenCalled();
        expect(mockSubscribePush).not.toHaveBeenCalled();
    });

    it('is a no-op when permission is not granted', async () => {
        install('denied');
        expect(await ensurePushSubscription(CONFIG)).toBe(false);
        install('default');
        expect(await ensurePushSubscription(CONFIG)).toBe(false);
        expect(pushManager.subscribe).not.toHaveBeenCalled();
        expect(mockSubscribePush).not.toHaveBeenCalled();
    });

    it('is a no-op when unsupported', async () => {
        uninstall();
        expect(await ensurePushSubscription(CONFIG)).toBe(false);
        await expect(removePushSubscription()).resolves.toBeUndefined();
        expect(await getCurrentPushSubscription()).toBeNull();
        expect(mockSubscribePush).not.toHaveBeenCalled();
        expect(mockUnsubscribePush).not.toHaveBeenCalled();
    });

    it('never throws: a failed subscribe or POST resolves false', async () => {
        pushManager.subscribe.mockRejectedValueOnce(new Error('AbortError'));
        expect(await ensurePushSubscription(CONFIG)).toBe(false);
        mockSubscribePush.mockRejectedValueOnce(new Error('409'));
        expect(await ensurePushSubscription(CONFIG)).toBe(false);
    });

    it('remove DELETEs the endpoint, then unsubscribes the browser', async () => {
        const sub = makeSub('https://push/mine', KEY_BYTES);
        current = sub;
        const order: string[] = [];
        mockUnsubscribePush.mockImplementation(() => { order.push('api'); return Promise.resolve(); });
        sub.unsubscribe.mockImplementation(() => { order.push('browser'); return Promise.resolve(true); });
        await removePushSubscription();
        expect(mockUnsubscribePush).toHaveBeenCalledWith('https://push/mine');
        expect(order).toEqual(['api', 'browser']);
    });

    it('remove still unsubscribes the browser when the API call fails', async () => {
        const sub = makeSub('https://push/mine', KEY_BYTES);
        current = sub;
        mockUnsubscribePush.mockRejectedValue(new Error('Network Error'));
        await expect(removePushSubscription()).resolves.toBeUndefined();
        expect(sub.unsubscribe).toHaveBeenCalled();
    });

    it('remove is a no-op without a subscription', async () => {
        await removePushSubscription();
        expect(mockUnsubscribePush).not.toHaveBeenCalled();
    });

    it('syncPushSubscription fetches the config and ensures when enabled + granted', async () => {
        mockGetPushConfig.mockResolvedValue(CONFIG);
        expect(await syncPushSubscription('111')).toBe(true);
        expect(mockSubscribePush).toHaveBeenCalled();
    });

    it('syncPushSubscription skips the config request without permission and swallows errors', async () => {
        install('default');
        expect(await syncPushSubscription('111')).toBe(false);
        expect(mockGetPushConfig).not.toHaveBeenCalled();
        install('granted');
        mockGetPushConfig.mockRejectedValue(new Error('500'));
        expect(await syncPushSubscription('111')).toBe(false);
        mockGetPushConfig.mockResolvedValue(null);
        expect(await syncPushSubscription('111')).toBe(false);
    });

    it('syncPushSubscription respects the per-user opt-out', async () => {
        mockGetPushConfig.mockResolvedValue(CONFIG);
        setPushOptedOut('111', true);
        expect(await syncPushSubscription('111')).toBe(false);
        expect(mockGetPushConfig).not.toHaveBeenCalled();
        expect(pushManager.subscribe).not.toHaveBeenCalled();
        // Another user on the same browser is not affected.
        expect(await syncPushSubscription('222')).toBe(true);
        setPushOptedOut('111', false);
        expect(await syncPushSubscription('111')).toBe(true);
    });
});

// Without a registered Service Worker (vite dev, registerSW failure)
// `navigator.serviceWorker.ready` never settles: nothing may wait on it forever.
describe('push without a registered Service Worker', () => {
    beforeEach(() => {
        current = null;
        vi.clearAllMocks();
        mockSubscribePush.mockResolvedValue(undefined);
        mockUnsubscribePush.mockResolvedValue(undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        install('granted', { ready: never(), getRegistration: () => Promise.resolve(undefined) });
    });

    afterEach(() => {
        vi.useRealTimers();
        uninstall();
        vi.restoreAllMocks();
    });

    it('getCurrentPushSubscription resolves null', async () => {
        expect(await getCurrentPushSubscription()).toBeNull();
    });

    it('removePushSubscription resolves without calling the server', async () => {
        await expect(removePushSubscription()).resolves.toBeUndefined();
        expect(mockUnsubscribePush).not.toHaveBeenCalled();
    });

    it('clearLocalPushSubscription resolves', async () => {
        await expect(clearLocalPushSubscription()).resolves.toBeUndefined();
    });

    it('ensurePushSubscription gives up after a bounded wait', async () => {
        vi.useFakeTimers();
        const result = ensurePushSubscription(CONFIG);
        await vi.advanceTimersByTimeAsync(SW_READY_TIMEOUT_MS);
        expect(await result).toBe(false);
        expect(mockSubscribePush).not.toHaveBeenCalled();
    });
});

describe('clearLocalPushSubscription (session ended without logout)', () => {
    beforeEach(() => {
        current = null;
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        install('granted');
    });

    afterEach(() => {
        uninstall();
        vi.restoreAllMocks();
    });

    it('unsubscribes the browser without calling the server', async () => {
        const sub = makeSub('https://push/mine', KEY_BYTES);
        current = sub;
        await clearLocalPushSubscription();
        expect(sub.unsubscribe).toHaveBeenCalled();
        expect(mockUnsubscribePush).not.toHaveBeenCalled();
    });

    it('never throws', async () => {
        const sub = makeSub('https://push/mine', KEY_BYTES);
        sub.unsubscribe.mockRejectedValue(new Error('boom'));
        current = sub;
        await expect(clearLocalPushSubscription()).resolves.toBeUndefined();
        uninstall();
        await expect(clearLocalPushSubscription()).resolves.toBeUndefined();
    });
});

describe('per-user push opt-out flag', () => {
    beforeEach(() => { localStorage.clear(); });
    afterEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('is stored per user and can be cleared', () => {
        expect(isPushOptedOut('111')).toBe(false);
        setPushOptedOut('111', true);
        expect(isPushOptedOut('111')).toBe(true);
        expect(isPushOptedOut('222')).toBe(false);
        expect(localStorage.getItem('push-opt-out:111')).not.toBeNull();
        setPushOptedOut('111', false);
        expect(isPushOptedOut('111')).toBe(false);
        expect(localStorage.getItem('push-opt-out:111')).toBeNull();
    });

    it('tolerates an unavailable localStorage', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('SecurityError'); });
        expect(() => setPushOptedOut('111', true)).not.toThrow();
        expect(() => setPushOptedOut('111', false)).not.toThrow();
        expect(isPushOptedOut('111')).toBe(false);
    });
});
