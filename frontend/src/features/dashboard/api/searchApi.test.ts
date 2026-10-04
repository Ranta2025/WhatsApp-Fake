import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockApi = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../api/axios', () => ({ default: mockApi }));

import { searchChat, searchGroup, searchAll } from './searchApi';

const page = { results: [{ messageID: 3, time: '2026-01-01T00:00:00Z', snippet: 'hola', highlights: [[0, 4]] }], hasMore: true };

beforeEach(() => { mockApi.get.mockReset(); });

describe('searchChat', () => {
    it('GETs /chat/:contact/search with q and only the paging params given, and normalizes the body', async () => {
        mockApi.get.mockResolvedValue({ data: page });
        const out = await searchChat('+58412', 'hola', { before: 40, limit: 20 });
        expect(mockApi.get).toHaveBeenCalledWith('/api/v1/chat/+58412/search', { params: { q: 'hola', before: 40, limit: 20 }, signal: undefined });
        expect(out.hasMore).toBe(true);
        expect(out.results[0]?.messageID).toBe(3);
    });

    it('omits undefined params and forwards the abort signal', async () => {
        mockApi.get.mockResolvedValue({ data: page });
        const controller = new AbortController();
        await searchChat('B', 'ab', { signal: controller.signal });
        expect(mockApi.get).toHaveBeenCalledWith('/api/v1/chat/B/search', { params: { q: 'ab' }, signal: controller.signal });
    });

    it('a malformed body degrades to an empty page instead of throwing', async () => {
        mockApi.get.mockResolvedValue({ data: 'oops' });
        expect(await searchChat('B', 'ab')).toEqual({ results: [], hasMore: false });
    });

    it('propagates request errors (e.g. abort) to the caller', async () => {
        mockApi.get.mockRejectedValue(new Error('canceled'));
        await expect(searchChat('B', 'ab')).rejects.toThrow('canceled');
    });
});

describe('searchGroup', () => {
    it('GETs /group/:id/message/search', async () => {
        mockApi.get.mockResolvedValue({ data: page });
        const out = await searchGroup(7, 'hola', { before: 9 });
        expect(mockApi.get).toHaveBeenCalledWith('/api/v1/group/7/message/search', { params: { q: 'hola', before: 9 }, signal: undefined });
        expect(out.results).toHaveLength(1);
    });
});

describe('searchAll', () => {
    it('GETs /search with q, limit and perChat', async () => {
        mockApi.get.mockResolvedValue({ data: { chats: [{ kind: 'group', key: '7', name: 'Eq', avatarUrl: '', results: page.results, total: 1 }] } });
        const out = await searchAll('hola', { limit: 20, perChat: 3 });
        expect(mockApi.get).toHaveBeenCalledWith('/api/v1/search', { params: { q: 'hola', limit: 20, perChat: 3 }, signal: undefined });
        expect(out.chats).toHaveLength(1);
    });

    it('a null body degrades to no chats', async () => {
        mockApi.get.mockResolvedValue({ data: null });
        expect(await searchAll('hola')).toEqual({ chats: [] });
    });
});
