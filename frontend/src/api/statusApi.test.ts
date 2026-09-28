import { describe, it, expect, vi } from 'vitest';

const mockApi = vi.hoisted(() => ({
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
}));

vi.mock('./axios', () => ({ default: mockApi }));

import { createStatus, getStatusFeed, markStatusViewed, deleteStatus } from './statusApi';

describe('statusApi URL/method/body mapping', () => {
    it('createStatus POSTs the body as-is to /api/v1/status', async () => {
        const body = { type: 'text' as const, text: 'hola', backgroundColor: '#FF0000' };

        await createStatus(body);

        expect(mockApi.post).toHaveBeenCalledWith('/api/v1/status', body);
    });

    it('getStatusFeed GETs /api/v1/status with no params', async () => {
        await getStatusFeed();

        expect(mockApi.get).toHaveBeenCalledWith('/api/v1/status');
    });

    it('markStatusViewed POSTs to the per-status view endpoint', async () => {
        await markStatusViewed(9);

        expect(mockApi.post).toHaveBeenCalledWith('/api/v1/status/9/view');
    });

    it('deleteStatus DELETEs the per-status endpoint', async () => {
        await deleteStatus(9);

        expect(mockApi.delete).toHaveBeenCalledWith('/api/v1/status/9');
    });
});
