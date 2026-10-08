import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockApi = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../api/axios', () => ({ default: mockApi }));

import {
    getChatWindowAround, getChatAfter, getChatBefore,
    getGroupWindowAround, getGroupAfter, getGroupBefore,
} from './historyApi';

const chat = (id: number) => ({ messageID: id, senderTelephon: 'B', receptor: 'A', message: `m${id}`, status: 'visto', time: '2026-01-01T00:00:00Z', edited: false });
const grp = (id: number) => ({ MessageID: id, GroupID: 7, SenderTelephon: 'B', SenderUsername: 'b', Message: `g${id}`, Time: '2026-01-01T00:00:00Z', Edited: false });

beforeEach(() => { mockApi.get.mockReset(); });

describe('1:1 windows', () => {
    it('around: GET ?around&limit, reads the older/newer headers and drops malformed items', async () => {
        mockApi.get.mockResolvedValue({
            data: [chat(4), { nope: true }, chat(5)],
            headers: { 'x-has-more-older': 'false', 'x-has-more-newer': 'true' },
        });
        const out = await getChatWindowAround('B', 5, 30);
        expect(mockApi.get).toHaveBeenCalledWith('/api/v1/chat/B', { params: { around: 5, limit: 30 } });
        expect(out.messages.map(m => m.messageID)).toEqual([4, 5]);
        expect(out.hasMoreOlder).toBe(false);
        expect(out.hasMoreNewer).toBe(true);
    });

    it('around: missing headers assume more on both sides (self-corrects on the next empty page)', async () => {
        mockApi.get.mockResolvedValue({ data: [chat(5)], headers: {} });
        const out = await getChatWindowAround('B', 5);
        expect(out.hasMoreOlder).toBe(true);
        expect(out.hasMoreNewer).toBe(true);
        expect(mockApi.get).toHaveBeenCalledWith('/api/v1/chat/B', { params: { around: 5, limit: 50 } });
    });

    it('after: GET ?after&limit with the newer flag', async () => {
        mockApi.get.mockResolvedValue({ data: [chat(6)], headers: { 'x-has-more-newer': 'false' } });
        const out = await getChatAfter('B', 5, 25);
        expect(mockApi.get).toHaveBeenCalledWith('/api/v1/chat/B', { params: { after: 5, limit: 25 } });
        expect(out).toEqual({ messages: [expect.objectContaining({ messageID: 6 })], hasMoreNewer: false });
    });

    it('before: GET ?before&limit with X-Has-More', async () => {
        mockApi.get.mockResolvedValue({ data: [chat(1)], headers: { 'x-has-more': 'true' } });
        const out = await getChatBefore('B', 5, 50);
        expect(mockApi.get).toHaveBeenCalledWith('/api/v1/chat/B', { params: { before: 5, limit: 50 } });
        expect(out.hasMore).toBe(true);
    });

    it('a non-array body yields an empty window', async () => {
        mockApi.get.mockResolvedValue({ data: null, headers: {} });
        expect((await getChatWindowAround('B', 5)).messages).toEqual([]);
    });
});

describe('group windows', () => {
    it('around: reads hasMoreOlder / hasMoreNewer from the body', async () => {
        mockApi.get.mockResolvedValue({ data: { messages: [grp(3), grp(4)], hasMoreOlder: false, hasMoreNewer: true } });
        const out = await getGroupWindowAround(7, 4, 30);
        expect(mockApi.get).toHaveBeenCalledWith('/api/v1/group/7/message', { params: { around: 4, limit: 30 } });
        expect(out.messages.map(m => m.MessageID)).toEqual([3, 4]);
        expect(out.hasMoreOlder).toBe(false);
        expect(out.hasMoreNewer).toBe(true);
    });

    it('around: falls back to hasMore for the older side and true for missing flags', async () => {
        mockApi.get.mockResolvedValue({ data: { messages: [grp(3)], hasMore: false } });
        const out = await getGroupWindowAround(7, 3);
        expect(out.hasMoreOlder).toBe(false);
        expect(out.hasMoreNewer).toBe(true);
    });

    it('after / before hit the same endpoint with their cursor', async () => {
        mockApi.get.mockResolvedValue({ data: { messages: [grp(9)], hasMoreNewer: false, hasMore: true } });
        expect((await getGroupAfter(7, 8, 20)).hasMoreNewer).toBe(false);
        expect(mockApi.get).toHaveBeenLastCalledWith('/api/v1/group/7/message', { params: { after: 8, limit: 20 } });
        expect((await getGroupBefore(7, 8, 20)).hasMore).toBe(true);
        expect(mockApi.get).toHaveBeenLastCalledWith('/api/v1/group/7/message', { params: { before: 8, limit: 20, offset: 0 } });
    });

    it('a malformed body yields an empty window', async () => {
        mockApi.get.mockResolvedValue({ data: 'x' });
        expect((await getGroupWindowAround(7, 3)).messages).toEqual([]);
    });
});
