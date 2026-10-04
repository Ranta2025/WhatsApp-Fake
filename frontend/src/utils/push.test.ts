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
    getCurrentPushSubscription, syncPushSubscription,
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

const install = (permission: NotificationPermission) => {
    Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: { ready: Promise.resolve({ pushManager }) },
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
        expect(await syncPushSubscription()).toBe(true);
        expect(mockSubscribePush).toHaveBeenCalled();
    });

    it('syncPushSubscription skips the config request without permission and swallows errors', async () => {
        install('default');
        expect(await syncPushSubscription()).toBe(false);
        expect(mockGetPushConfig).not.toHaveBeenCalled();
        install('granted');
        mockGetPushConfig.mockRejectedValue(new Error('500'));
        expect(await syncPushSubscription()).toBe(false);
        mockGetPushConfig.mockResolvedValue(null);
        expect(await syncPushSubscription()).toBe(false);
    });
});
