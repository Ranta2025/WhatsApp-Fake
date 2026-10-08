// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DashboardProvider, useDashboard, type DashboardContextValue, type SelectedGroup } from './DashboardContext';
import { DELIVERED_DEBOUNCE_MS } from '../hooks/useGroupReceiptAcks';
import type { GroupDetail, GroupMessageResponse } from '../../../types/api';

// group-read-receipts (RR4): receipt state fed from the group detail snapshot and
// `group_receipt` pushes, plus the client acks (`group_delivered`, throttled `group_read`).

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
const sendGroupDelivered = vi.fn(() => true);
const sendGroupRead = vi.fn(() => true);
const stableWs = {
    isConnected: true,
    connectionState: 'connected' as const,
    on: vi.fn(), off: vi.fn(),
    sendMessage: vi.fn(), sendReadConfirmation: vi.fn(), sendTypingIndicator: vi.fn(),
    sendGroupMessage: vi.fn(), sendGroupTyping: vi.fn(), sendGroupEditMessage: vi.fn(),
    sendGroupDeleteMessage: vi.fn(), sendGroupJoin: vi.fn(),
    sendGroupDelivered, sendGroupRead,
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

describe('DashboardProvider group receipts', () => {
    let container: HTMLDivElement;
    let root: Root;
    let ctx: DashboardContextValue | undefined;

    /** Handler registered through `on(event, handler)` by the provider's WS effect. */
    const handlerFor = <T,>(event: string): ((payload: T) => void) => {
        const call = [...stableWs.on.mock.calls].reverse().find(([name]) => name === event);
        if (!call) throw new Error(`no handler registered for ${event}`);
        return call[1] as (payload: T) => void;
    };

    beforeEach(() => {
        vi.useFakeTimers();
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
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const mount = async () => {
        await act(async () => {
            root.render(<DashboardProvider><Harness onReady={(v) => { ctx = v; }} /></DashboardProvider>);
        });
    };
    const openGroup = async () => {
        await act(async () => { ctx!.setSelectedGroup(selected()); });
        await act(async () => { await ctx!.fetchGroupDetail(9); });
    };

    it('fills groupReceipts[groupID][telephon] from the group detail members', async () => {
        await mount();
        await openGroup();

        expect(ctx?.groupReceipts[9]).toEqual({
            '111': { joined: 0, delivered: 0, read: 0 },
            '222': { joined: 0, delivered: 10, read: 4 },
            '333': { joined: 6, delivered: 0, read: 0 },
        });
    });

    it('keeps the group marks when a later detail response carries no members array', async () => {
        await mount();
        await openGroup();
        const before = ctx?.groupReceipts[9];
        expect(before?.['222']).toEqual({ joined: 0, delivered: 10, read: 4 });

        mockGetGroupDetail.mockResolvedValue({ data: { ...detail(), members: null } });
        await act(async () => { await ctx!.fetchGroupDetail(9); });
        expect(ctx?.groupReceipts[9]).toEqual(before);

        mockGetGroupDetail.mockResolvedValue({ data: { id: 9, name: 'Equipo' } });
        await act(async () => { await ctx!.fetchGroupDetail(9); });
        expect(ctx?.groupReceipts[9]).toEqual(before);
    });

    it('advances marks on group_receipt and ignores malformed or stale payloads', async () => {
        await mount();
        await openGroup();
        const onReceipt = handlerFor<unknown>('group_receipt');

        act(() => { onReceipt({ groupID: 9, telephon: '333', deliveredUpTo: 12, readUpTo: 8 }); });
        expect(ctx?.groupReceipts[9]?.['333']).toEqual({ joined: 6, delivered: 12, read: 8 });

        act(() => {
            onReceipt(null);
            onReceipt({ groupID: 9, telephon: '333', deliveredUpTo: 'x' });
            onReceipt({ groupID: 9, telephon: '333', deliveredUpTo: 1, readUpTo: 1 }); // stale
            onReceipt({ groupID: 77, telephon: '333', deliveredUpTo: 99, readUpTo: 99 }); // unknown group
        });
        expect(ctx?.groupReceipts[9]?.['333']).toEqual({ joined: 6, delivered: 12, read: 8 });
        expect(ctx?.groupReceipts[77]).toBeUndefined();
    });

    it('a re-fetched detail never lowers marks already advanced by a push', async () => {
        await mount();
        await openGroup();
        act(() => { handlerFor<unknown>('group_receipt')({ groupID: 9, telephon: '222', deliveredUpTo: 20, readUpTo: 15 }); });

        await act(async () => { await ctx!.fetchGroupDetail(9); }); // server snapshot still says 10/4

        expect(ctx?.groupReceipts[9]?.['222']).toEqual({ joined: 0, delivered: 20, read: 15 });
    });

    it('tracks members added (joined at the latest known message) and left', async () => {
        await mount();
        await openGroup();
        act(() => { handlerFor<GroupMessageResponse>('group_chat')(groupMsg(30)); });

        act(() => {
            handlerFor<unknown>('group_member_added')({
                groupID: 9, addedByUsername: 'ana', addedMembers: [{ telephon: '444', username: 'nuevo' }], newMemberCount: 4,
            });
        });
        expect(ctx?.groupReceipts[9]?.['444']).toEqual({ joined: 30, delivered: 0, read: 0 });

        act(() => { handlerFor<unknown>('group_member_left')({ groupID: 9, telephon: '222', username: 'luis' }); });
        expect(ctx?.groupReceipts[9]?.['222']).toBeUndefined();
    });

    it('acks delivered (coalesced) for incoming group messages from others, not for own', async () => {
        await mount();
        const onChat = handlerFor<GroupMessageResponse>('group_chat');

        act(() => {
            onChat(groupMsg(21, '222'));
            onChat(groupMsg(22, '333'));
            onChat(groupMsg(23, '111')); // own echo
        });
        await act(async () => { await vi.advanceTimersByTimeAsync(DELIVERED_DEBOUNCE_MS); });

        expect(sendGroupDelivered.mock.calls).toEqual([[9, 22]]);
    });

    it('acks read up to the latest message only while the group is open and not left', async () => {
        await mount();
        act(() => { ctx!.setGroupMessages({ 9: [groupMsg(5), groupMsg(8)] }); });
        expect(sendGroupRead).not.toHaveBeenCalled();

        await act(async () => { ctx!.setSelectedGroup(selected()); });
        expect(sendGroupRead.mock.calls).toEqual([[9, 8]]);
    });

    it('does not ack read for a group the user left', async () => {
        await mount();
        act(() => { ctx!.setGroupMessages({ 9: [groupMsg(5)] }); });
        await act(async () => { ctx!.setSelectedGroup({ ...selected(), userRole: 'left' }); });
        expect(sendGroupRead).not.toHaveBeenCalled();
    });
});
