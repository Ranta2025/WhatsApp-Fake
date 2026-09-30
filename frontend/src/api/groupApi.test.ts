import { describe, it, expect, vi } from 'vitest';

const mockApi = vi.hoisted(() => ({
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
}));

vi.mock('./axios', () => ({ default: mockApi }));

import {
    createGroup, getGroupMessages, editGroupMessage, deleteGroupMessage,
    changeGroupMemberRole, removeGroupMember, updateGroupSettings, updateGroupInfo,
} from './groupApi';

describe('groupApi URL/method/body mapping', () => {
    it('createGroup POSTs name/description/members to /api/v1/group', async () => {
        await createGroup('Amigos', 'desc', ['111', '222']);

        expect(mockApi.post).toHaveBeenCalledWith('/api/v1/group', {
            name: 'Amigos',
            description: 'desc',
            members: ['111', '222'],
        });
    });

    it('createGroup forwards optional create-time settings (CUSTOM plumbing)', async () => {
        mockApi.post.mockClear();
        await createGroup('Amigos', undefined, ['111'], { onlyAdminsCanSend: true });

        expect(mockApi.post).toHaveBeenCalledWith('/api/v1/group', {
            name: 'Amigos',
            description: undefined,
            members: ['111'],
            onlyAdminsCanSend: true,
        });
    });

    it('getGroupMessages GETs with limit/offset query params (defaults 50/0)', async () => {
        await getGroupMessages(7);

        expect(mockApi.get).toHaveBeenCalledWith('/api/v1/group/7/message', {
            params: { limit: 50, offset: 0 },
        });
    });

    it('getGroupMessages adds the `before` cursor only when given', async () => {
        mockApi.get.mockClear();
        await getGroupMessages(7, 30, 0, 90);

        expect(mockApi.get).toHaveBeenCalledWith('/api/v1/group/7/message', {
            params: { limit: 30, offset: 0, before: 90 },
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

describe('getGroupMessageReceipts', () => {
    it('GETs /api/v1/group/:groupID/message/:messageID/receipts', async () => {
        const { getGroupMessageReceipts } = await import('./groupApi');
        mockApi.get.mockClear();

        await getGroupMessageReceipts(7, 42);

        expect(mockApi.get).toHaveBeenCalledWith('/api/v1/group/7/message/42/receipts');
    });
});

describe('group admin mutations', () => {
    it('changeGroupMemberRole PUTs { role } to .../members/:telephon/role (telephon URL-encoded)', async () => {
        mockApi.put.mockClear();
        await changeGroupMemberRole(7, '+54 9 11', 'admin');

        expect(mockApi.put).toHaveBeenCalledWith(
            '/api/v1/group/7/members/%2B54%209%2011/role',
            { role: 'admin' },
        );
    });

    it('removeGroupMember DELETEs .../members/:telephon', async () => {
        mockApi.delete.mockClear();
        await removeGroupMember(7, '549111');

        expect(mockApi.delete).toHaveBeenCalledWith('/api/v1/group/7/members/549111');
    });

    it('updateGroupSettings PATCHes the settings body to .../settings', async () => {
        mockApi.patch.mockClear();
        await updateGroupSettings(7, { onlyAdminsCanSend: false, onlyAdminsCanAddMembers: true });

        expect(mockApi.patch).toHaveBeenCalledWith('/api/v1/group/7/settings', {
            onlyAdminsCanSend: false,
            onlyAdminsCanAddMembers: true,
        });
    });

    it('updateGroupInfo PATCHes name/description to .../:groupID', async () => {
        mockApi.patch.mockClear();
        await updateGroupInfo(7, { name: 'Nuevo', description: 'desc' });

        expect(mockApi.patch).toHaveBeenCalledWith('/api/v1/group/7', {
            name: 'Nuevo',
            description: 'desc',
        });
    });
});
