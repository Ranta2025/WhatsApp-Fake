import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
vi.mock('./axios', () => ({ default: { get: (...args: unknown[]) => mockGet(...args) } }));

import { getReactions } from './reactionApi';

describe('getReactions', () => {
    beforeEach(() => { mockGet.mockReset(); });

    it('hits the 1:1 endpoint and returns the guarded shape', async () => {
        mockGet.mockResolvedValue({ data: { reactions: [{ emoji: '👍', users: [{ telephon: '1', username: 'ana', avatarUrl: 'a.png' }] }] } });
        const out = await getReactions('direct', 42);
        expect(mockGet).toHaveBeenCalledWith('/api/v1/chat/message/42/reactions');
        expect(out).toEqual({ reactions: [{ emoji: '👍', users: [{ telephon: '1', username: 'ana', avatarUrl: 'a.png' }] }] });
    });

    it('hits the group endpoint', async () => {
        mockGet.mockResolvedValue({ data: { reactions: [] } });
        await getReactions('group', 7, 3);
        expect(mockGet).toHaveBeenCalledWith('/api/v1/group/3/message/7/reactions');
    });

    it('drops malformed entries and tolerates an empty body', async () => {
        mockGet.mockResolvedValue({ data: { reactions: [{ emoji: '', users: [] }, 'x', { emoji: '❤️', users: [{ nope: 1 }, { telephon: '2' }] }] } });
        expect(await getReactions('direct', 1)).toEqual({ reactions: [{ emoji: '❤️', users: [{ telephon: '2', username: '2', avatarUrl: '' }] }] });
        mockGet.mockResolvedValue({ data: null });
        expect(await getReactions('direct', 1)).toEqual({ reactions: [] });
    });

    it('rejects a group request without groupID before calling the network', async () => {
        await expect(getReactions('group', 7)).rejects.toThrow(/groupID/);
        expect(mockGet).not.toHaveBeenCalled();
    });

    it('propagates network errors', async () => {
        mockGet.mockRejectedValue(new Error('boom'));
        await expect(getReactions('direct', 1)).rejects.toThrow('boom');
    });
});
