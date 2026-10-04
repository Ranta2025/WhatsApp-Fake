import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();
vi.mock('./axios', () => ({
    default: {
        get: (...a: unknown[]) => mockGet(...a),
        post: (...a: unknown[]) => mockPost(...a),
        put: (...a: unknown[]) => mockPut(...a),
        delete: (...a: unknown[]) => mockDelete(...a),
    },
}));

import { getPushConfig, parsePushConfig, subscribePush, unsubscribePush, setPushPreview } from './pushApi';

describe('pushApi', () => {
    beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); mockPut.mockReset(); mockDelete.mockReset(); });

    it('parsePushConfig accepts the documented shape and rejects anything else', () => {
        expect(parsePushConfig({ enabled: true, publicKey: 'BKey', preview: false }))
            .toEqual({ enabled: true, publicKey: 'BKey', preview: false });
        expect(parsePushConfig({ enabled: false, publicKey: '', preview: true }))
            .toEqual({ enabled: false, publicKey: '', preview: true });
        expect(parsePushConfig(null)).toBeNull();
        expect(parsePushConfig('x')).toBeNull();
        expect(parsePushConfig({ enabled: 'yes', publicKey: 'k', preview: true })).toBeNull();
        expect(parsePushConfig({ enabled: true, publicKey: 3, preview: true })).toBeNull();
        expect(parsePushConfig({ enabled: true, publicKey: 'k' })).toBeNull();
        // Enabled without a key is unusable: treat as malformed.
        expect(parsePushConfig({ enabled: true, publicKey: '', preview: true })).toBeNull();
    });

    it('GET push/config returns the guarded config, null when malformed', async () => {
        mockGet.mockResolvedValue({ data: { enabled: true, publicKey: 'BKey', preview: true } });
        expect(await getPushConfig()).toEqual({ enabled: true, publicKey: 'BKey', preview: true });
        expect(mockGet).toHaveBeenCalledWith('/api/v1/push/config');
        mockGet.mockResolvedValue({ data: { nope: 1 } });
        expect(await getPushConfig()).toBeNull();
    });

    it('POST push/subscribe sends exactly the subscription JSON', async () => {
        mockPost.mockResolvedValue({ status: 201, data: {} });
        const body = { endpoint: 'https://push/1', expirationTime: null, keys: { p256dh: 'p', auth: 'a' } };
        await subscribePush(body);
        expect(mockPost).toHaveBeenCalledWith('/api/v1/push/subscribe', body);
    });

    it('DELETE push/subscribe sends the endpoint in the body', async () => {
        mockDelete.mockResolvedValue({ status: 204 });
        await unsubscribePush('https://push/1');
        expect(mockDelete).toHaveBeenCalledWith('/api/v1/push/subscribe', { data: { endpoint: 'https://push/1' } });
    });

    it('PUT push/preview sends the flag and propagates errors', async () => {
        mockPut.mockResolvedValue({ status: 204 });
        await setPushPreview(false);
        expect(mockPut).toHaveBeenCalledWith('/api/v1/push/preview', { preview: false });
        mockPut.mockRejectedValue(new Error('404'));
        await expect(setPushPreview(true)).rejects.toThrow('404');
    });
});
