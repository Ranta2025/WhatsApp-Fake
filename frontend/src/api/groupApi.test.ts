import { describe, it, expect, vi } from 'vitest';

const mockApi = vi.hoisted(() => ({
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
}));

vi.mock('./axios', () => ({ default: mockApi }));

import { createGroup, getGroupMessages, editGroupMessage, deleteGroupMessage } from './groupApi';

describe('groupApi URL/method/body mapping', () => {
    it('createGroup POSTs name/description/members to /api/v1/group', async () => {
        await createGroup('Amigos', 'desc', ['111', '222']);

        expect(mockApi.post).toHaveBeenCalledWith('/api/v1/group', {
            name: 'Amigos',
            description: 'desc',
            members: ['111', '222'],
        });
    });

    it('getGroupMessages GETs with limit/offset query params (defaults 50/0)', async () => {
        await getGroupMessages(7);

        expect(mockApi.get).toHaveBeenCalledWith('/api/v1/group/7/message', {
            params: { limit: 50, offset: 0 },
        });
    });

    it('editGroupMessage PUTs only messageID/message (no groupID in body, per backend schema)', async () => {
        await editGroupMessage(7, 42, 'nuevo texto');

        expect(mockApi.put).toHaveBeenCalledWith('/api/v1/group/7/message', {
            messageID: 42,
            message: 'nuevo texto',
        });
    });

    it('deleteGroupMessage DELETEs with messageID in the request body', async () => {
        await deleteGroupMessage(7, 42);

        expect(mockApi.delete).toHaveBeenCalledWith('/api/v1/group/7/message', {
            data: { messageID: 42 },
        });
    });
});
