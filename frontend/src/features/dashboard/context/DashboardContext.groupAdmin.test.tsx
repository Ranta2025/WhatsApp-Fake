// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DashboardProvider, useDashboard, type DashboardContextValue, type SelectedGroup } from './DashboardContext';
import type { GroupDetail, GroupMessageResponse, GroupSystemEvent } from '../../../types/api';

// group-admin (GA6): WS handlers for the persisted admin events, per-viewer
// system messages, dedupe by server id and history reload.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockGet = vi.fn();
vi.mock('../../../api/axios', () => ({
    default: { get: (...args: unknown[]) => mockGet(...args) },
    SESSION_EXPIRED_EVENT: 'auth:session-expired',
}));

const mockGetUserGroups = vi.fn();
const mockGetGroupMessages = vi.fn();
const mockGetGroupDetail = vi.fn();
vi.mock('../../../api/groupApi', () => ({
    getUserGroups: (...args: unknown[]) => mockGetUserGroups(...args),
    getGroupMessages: (...args: unknown[]) => mockGetGroupMessages(...args),
    getGroupDetail: (...args: unknown[]) => mockGetGroupDetail(...args),
}));

const stableUser = { username: 'ana', telephon: '111', avatar: '' };
const stableLogout = vi.fn();
const stableWs = {
    isConnected: true,
    connectionState: 'connected' as const,
    on: vi.fn(), off: vi.fn(),
    sendMessage: vi.fn(), sendReadConfirmation: vi.fn(), sendTypingIndicator: vi.fn(),
    sendGroupMessage: vi.fn(), sendGroupTyping: vi.fn(), sendGroupEditMessage: vi.fn(),
    sendGroupDeleteMessage: vi.fn(), sendGroupJoin: vi.fn(),
    sendGroupDelivered: vi.fn(() => true), sendGroupRead: vi.fn(() => true),
};
vi.mock('../../../context/AuthContext', () => ({
    useAuth: () => ({ user: stableUser, logout: stableLogout }),
}));
vi.mock('../../../hooks/useWebSocket', () => ({
    useWebSocket: () => stableWs,
}));

function Harness({ onReady }: { onReady: (value: DashboardContextValue) => void }) {
    const dash = useDashboard();
    onReady(dash);
    return null;
}

const iso = (n: number) => new Date(Date.UTC(2024, 0, 1, 0, 0, n)).toISOString();
const groupMsg = (id: number, sender = '222'): GroupMessageResponse => ({
    messageID: id, groupID: 9, senderTelephon: sender, senderUsername: 'x', message: `g${id}`, time: iso(id), edited: false,
});
const sysMsg = (id: number, event: GroupSystemEvent, targets: string[] = [], sender = '222'): GroupMessageResponse => ({
    messageID: id, groupID: 9, senderTelephon: sender, senderUsername: sender === '111' ? 'ana' : 'luis',
    message: '', time: iso(id), edited: false, kind: 'system', systemEvent: event, systemTargets: targets,
});
const detail = (overrides: Partial<GroupDetail> = {}): GroupDetail => ({
    id: 9, name: 'Equipo', creatorTelephon: '111', memberCount: 3, userRole: 'member', createdAt: iso(0),
    onlyAdminsCanSend: false, onlyAdminsCanEditInfo: false, onlyAdminsCanAddMembers: false,
    members: [
        { telephon: '111', username: 'ana', role: 'admin' },
        { telephon: '222', username: 'luis', role: 'member', joinedMessageID: 0, lastDeliveredMessageID: 10, lastReadMessageID: 4 },
        { telephon: '333', username: 'marta', role: 'member', joinedMessageID: 6 },
    ],
    messages: [],
    ...overrides,
});
const selected = (): SelectedGroup => ({
    id: 9, name: 'Equipo', creatorTelephon: '111', memberCount: 3, userRole: 'member', createdAt: iso(0),
    onlyAdminsCanSend: false, onlyAdminsCanEditInfo: false, onlyAdminsCanAddMembers: false,
});

describe('DashboardProvider group admin events', () => {
    let container: HTMLDivElement;
    let root: Root;
    let ctx: DashboardContextValue | undefined;

    const handlerFor = <T,>(event: string): ((payload: T) => void) => {
        const call = [...stableWs.on.mock.calls].reverse().find(([name]) => name === event);
        if (!call) throw new Error(`no handler registered for ${event}`);
        return call[1] as (payload: T) => void;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        mockGet.mockResolvedValue({ data: null });
        mockGetUserGroups.mockResolvedValue({ data: null });
        mockGetGroupMessages.mockResolvedValue({ data: { messages: [], hasMore: false } });
        mockGetGroupDetail.mockResolvedValue({ data: detail() });
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        ctx = undefined;
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
        vi.restoreAllMocks();
    });

    const mount = async () => {
        await act(async () => {
            root.render(<DashboardProvider><Harness onReady={(v) => { ctx = v; }} /></DashboardProvider>);
        });
    };
    const asUser = async (telephon: string) => {
        await act(async () => { ctx!.setProfile({ username: 'me', telephon: telephon, email: '', avatarUrl: '', wallpaperUrl: '' }); });
    };
    const openGroup = async () => {
        await act(async () => { ctx!.setSelectedGroup(selected()); });
        await act(async () => { await ctx!.fetchGroupDetail(9); });
    };

    it('group_member_role updates the member role and my own userRole, and appends the notice once', async () => {
        await mount();
        await asUser('222'); // Luis recibe su propia designación
        await openGroup();
        const onRole = handlerFor<unknown>('group_member_role');

        act(() => {
            onRole({ groupID: 9, telephon: '222', role: 'admin', systemMessage: sysMsg(50, 'admin_granted', ['222'], '111') });
        });
        expect(ctx?.selectedGroup?.userRole).toBe('admin');
        expect(ctx?.selectedGroup?.members?.find(m => m.telephon === '222')?.role).toBe('admin');
        expect(ctx?.groupMessages[9]?.map(m => m.messageID)).toEqual([50]);

        // Same server id redelivered (other tab / event replay): no duplicate.
        act(() => {
            onRole({ groupID: 9, telephon: '222', role: 'admin', systemMessage: sysMsg(50, 'admin_granted', ['222'], '111') });
        });
        expect(ctx?.groupMessages[9]?.map(m => m.messageID)).toEqual([50]);
    });

    it('group_member_role ignores a malformed payload', async () => {
        await mount();
        await openGroup();
        const onRole = handlerFor<unknown>('group_member_role');

        act(() => { onRole({ groupID: 9, telephon: '222' }); }); // missing role
        act(() => { onRole(null); });

        expect(ctx?.selectedGroup?.members?.find(m => m.telephon === '222')?.role).toBe('member');
        expect(ctx?.groupMessages[9]).toBeUndefined();
    });

    it('group_member_removed (someone else) removes the member, drops the receipt mark, caches the name and appends the notice', async () => {
        await mount();
        await asUser('111');
        await openGroup();
        const onRemoved = handlerFor<unknown>('group_member_removed');

        act(() => {
            onRemoved({ groupID: 9, telephon: '333', username: 'marta', newMemberCount: 2, systemMessage: sysMsg(51, 'member_removed', ['333'], '111') });
        });

        expect(ctx?.selectedGroup?.members?.some(m => m.telephon === '333')).toBe(false);
        expect(ctx?.selectedGroup?.memberCount).toBe(2);
        expect(ctx?.groupReceipts[9]?.['333']).toBeUndefined();
        expect(ctx?.groupMemberNames[9]?.['333']).toBe('marta');
        expect(ctx?.groupMessages[9]?.map(m => m.messageID)).toEqual([51]);
    });

    it('group_member_removed for me flips my groups/selectedGroup role to left', async () => {
        await mount();
        await asUser('222');
        await openGroup();
        act(() => { ctx!.setGroups([{ ...selected(), userRole: 'member' }]); });
        const onRemoved = handlerFor<unknown>('group_member_removed');

        act(() => {
            onRemoved({ groupID: 9, telephon: '222', username: 'luis', newMemberCount: 2, systemMessage: sysMsg(52, 'member_removed', ['222'], '111') });
        });

        expect(ctx?.groups[0]?.userRole).toBe('left');
        expect(ctx?.selectedGroup?.userRole).toBe('left');
        expect(ctx?.selectedGroup?.RemovedByAdmin).toBe(true);
    });

    it('group_settings updates the settings on groups and selectedGroup and appends the notice', async () => {
        await mount();
        await openGroup();
        act(() => { ctx!.setGroups([selected()]); });
        const onSettings = handlerFor<unknown>('group_settings');

        act(() => {
            onSettings({ groupID: 9, onlyAdminsCanSend: true, onlyAdminsCanEditInfo: true, onlyAdminsCanAddMembers: false, systemMessage: sysMsg(53, 'settings_changed', [], '111') });
        });

        expect(ctx?.selectedGroup?.onlyAdminsCanSend).toBe(true);
        expect(ctx?.selectedGroup?.onlyAdminsCanEditInfo).toBe(true);
        expect(ctx?.selectedGroup?.onlyAdminsCanAddMembers).toBe(false);
        expect(ctx?.groups[0]?.onlyAdminsCanSend).toBe(true);
        expect(ctx?.groupMessages[9]?.map(m => m.messageID)).toEqual([53]);
    });

    it('group_info updates name/description and appends the notice', async () => {
        await mount();
        await openGroup();
        act(() => { ctx!.setGroups([selected()]); });
        const onInfo = handlerFor<unknown>('group_info');

        act(() => {
            onInfo({ groupID: 9, name: 'Nuevo nombre', description: 'nueva desc', systemMessage: sysMsg(54, 'info_changed', [], '111') });
        });

        expect(ctx?.selectedGroup?.name).toBe('Nuevo nombre');
        expect(ctx?.selectedGroup?.description).toBe('nueva desc');
        expect(ctx?.groups[0]?.name).toBe('Nuevo nombre');
        expect(ctx?.groupMessages[9]?.map(m => m.messageID)).toEqual([54]);
    });

    it('a reloaded history shows the persisted system message and a live replay does not duplicate it', async () => {
        await mount();
        await openGroup();
        mockGetGroupMessages.mockResolvedValue({ data: { messages: [groupMsg(61), sysMsg(60, 'member_added', ['333'], '111')], hasMore: false } });

        await act(async () => { await ctx!.fetchGroupMessages(9); });
        expect(ctx?.groupMessages[9]?.map(m => m.messageID)).toEqual([60, 61]);
        expect(ctx?.groupMessages[9]?.find(m => m.messageID === 60)?.kind).toBe('system');

        // The same event arriving live after the reload must not duplicate the row.
        act(() => {
            handlerFor<unknown>('group_member_added')({
                groupID: 9, addedByUsername: 'ana', addedMembers: [{ telephon: '333', username: 'marta' }], newMemberCount: 4,
                systemMessage: sysMsg(60, 'member_added', ['333'], '111'),
            });
        });
        expect(ctx?.groupMessages[9]?.filter(m => m.messageID === 60)).toHaveLength(1);
    });

    it('group_member_added with a persisted systemMessage keeps receipts and does not synthesize a second notice', async () => {
        await mount();
        await openGroup();
        act(() => { handlerFor<GroupMessageResponse>('group_chat')(groupMsg(30)); });

        act(() => {
            handlerFor<unknown>('group_member_added')({
                groupID: 9, addedByUsername: 'ana', addedMembers: [{ telephon: '444', username: 'nuevo' }], newMemberCount: 4,
                systemMessage: sysMsg(55, 'member_added', ['444'], '111'),
            });
        });

        expect(ctx?.groupReceipts[9]?.['444']).toEqual({ joined: 30, delivered: 0, read: 0 });
        expect(ctx?.groupMessages[9]?.map(m => m.messageID)).toEqual([30, 55]);
        expect(ctx?.groupMemberNames[9]?.['444']).toBe('nuevo');
    });
});
