import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockPut = vi.fn();
vi.mock('./axios', () => ({ default: { get: (...a: unknown[]) => mockGet(...a), put: (...a: unknown[]) => mockPut(...a) } }));

import { setChatDisappearing, getChatDisappearing, setGroupDisappearing } from './disappearingApi';

describe('disappearingApi', () => {
    beforeEach(() => { mockGet.mockReset(); mockPut.mockReset(); });

    it('PUTs the 1:1 timer and returns the guarded WS-shaped envelope', async () => {
        mockPut.mockResolvedValue({ data: { kind: 'direct', key: 'B', seconds: 86400, byTelephon: '111', systemMessage: null } });
        const out = await setChatDisappearing('B', 86400);
        expect(mockPut).toHaveBeenCalledWith('/api/v1/chat/B/disappearing', { seconds: 86400 });
        expect(out).toEqual({ kind: 'direct', key: 'B', seconds: 86400, byTelephon: '111' });
    });

    it('PUTs the group timer', async () => {
        mockPut.mockResolvedValue({ data: { kind: 'group', key: 9, seconds: 0, byTelephon: '111' } });
        const out = await setGroupDisappearing(9, 0);
        expect(mockPut).toHaveBeenCalledWith('/api/v1/group/9/disappearing', { seconds: 0 });
        expect(out).toMatchObject({ kind: 'group', key: 9, seconds: 0 });
    });

    it('returns null for an invalid body and propagates network errors', async () => {
        mockPut.mockResolvedValue({ data: { nope: true } });
        expect(await setChatDisappearing('B', 0)).toBeNull();
        mockPut.mockRejectedValue(new Error('403'));
        await expect(setGroupDisappearing(9, 0)).rejects.toThrow('403');
    });

    it('rejects a disallowed value before calling the network', async () => {
        await expect(setChatDisappearing('B', 3600)).rejects.toThrow(/seconds/);
        await expect(setGroupDisappearing(9, -1)).rejects.toThrow(/seconds/);
        expect(mockPut).not.toHaveBeenCalled();
    });

    it('GET settings returns disappearSeconds, or null when malformed', async () => {
        mockGet.mockResolvedValue({ data: { disappearSeconds: 604800 } });
        expect(await getChatDisappearing('B')).toBe(604800);
        expect(mockGet).toHaveBeenCalledWith('/api/v1/chat/B/settings');
        mockGet.mockResolvedValue({ data: { disappearSeconds: 'x' } });
        expect(await getChatDisappearing('B')).toBeNull();
        mockGet.mockResolvedValue({ data: null });
        expect(await getChatDisappearing('B')).toBeNull();
    });
});
