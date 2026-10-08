// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DashboardProvider, useDashboard, type DashboardContextValue } from './DashboardContext';
import { countUnreadFrom } from '../lib/disappearing';
import type { ChatGroup, ContactChat, GroupResponse, Message } from '../../../types/api';
import type { ReactionEventPayload } from '../../../types/ws';

// Per-chat mute (WP9): the lists' Muted/MutedUntil feed `isMuted`; setMute/clearMute go through
// the REST client and update the local state from its answer; a message for a muted chat
// skips the native notification (the in-app sound is that notification) but still counts as
// unread exactly like an unmuted one.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockGet = vi.fn();
vi.mock('../../../api/axios', () => ({
    default: { get: (...args: unknown[]) => mockGet(...args) },
    SESSION_EXPIRED_EVENT: 'auth:session-expired',
}));

const mockGetUserGroups = vi.fn();
vi.mock('../../../api/groupApi', () => ({
    getUserGroups: (...args: unknown[]) => mockGetUserGroups(...args),
    getGroupMessages: vi.fn(() => Promise.resolve({ data: { messages: [], hasMore: false } })),
    getGroupDetail: vi.fn(() => Promise.resolve({ data: null })),
}));

const mockSetChatMute = vi.fn();
const mockClearChatMute = vi.fn();
const mockSetGroupMute = vi.fn();
const mockClearGroupMute = vi.fn();
vi.mock('../../../api/muteApi', () => ({
    setChatMute: (...args: unknown[]) => mockSetChatMute(...args),
    clearChatMute: (...args: unknown[]) => mockClearChatMute(...args),
    setGroupMute: (...args: unknown[]) => mockSetGroupMute(...args),
    clearGroupMute: (...args: unknown[]) => mockClearGroupMute(...args),
}));

const mockNotify = vi.fn();
vi.mock('../../../utils/notifications', () => ({
    showNativeNotification: (...args: unknown[]) => mockNotify(...args),
    onNotificationClick: vi.fn(),
    offNotificationClick: vi.fn(),
}));

const stableUser = { username: 'ana', telephon: '111', avatar: '' };
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
    useAuth: () => ({ user: stableUser, logout: vi.fn() }),
}));
vi.mock('../../../hooks/useWebSocket', () => ({
    useWebSocket: () => stableWs,
}));

function Harness({ onReady }: { onReady: (value: DashboardContextValue) => void }) {
    const dash = useDashboard();
    onReady(dash);
    return null;
}

const HOUR = 3_600_000;
const inFuture = () => new Date(Date.now() + HOUR).toISOString();
const inPast = () => new Date(Date.now() - HOUR).toISOString();
const contact = (n: string, over: Partial<ContactChat> = {}): ContactChat => ({
    username: n, telephon: n, status: 'accepted', contactName: n, lastSeen: null, avatarUrl: '', wallpaperUrl: '', ...over,
});
const chat = (n: string, over: Partial<ChatGroup> = {}): ChatGroup => ({
    contactTelephon: n, contactUsername: n, contactName: n, contactAvatarUrl: '', isContact: false, messages: [], ...over,
});
const groupRow = (id: number, over: Partial<GroupResponse> = {}): GroupResponse => ({
    ID: id, Name: `G${id}`, CreatorTelephon: '111', MemberCount: 2, UserRole: 'member', CreatedAt: '2026-01-01T00:00:00Z',
    OnlyAdminsCanSend: false, OnlyAdminsCanEditInfo: false, OnlyAdminsCanAddMembers: false, ...over,
});
const putResult = (mutedUntil: string | null, serverDate: number | null = null) => ({
    response: { muted: true as const, mutedUntil }, serverDate,
});
/** A promise the test resolves by hand (an in-flight list response). */
const deferred = <T,>() => {
    let resolve: (value: T) => void = () => {};
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
};
const incoming = (id: number, from: string): Message => ({
    messageID: id, senderTelephon: from, receptor: '111', message: `hola ${id}`, status: 'entregado',
    time: new Date().toISOString(), edited: false,
});

describe('DashboardProvider per-chat mute', () => {
    let container: HTMLDivElement;
    let root: Root;
    let ctx: DashboardContextValue | undefined;
    let contactsPayload: unknown;
    let chatsPayload: unknown;
    let groupsPayload: unknown;

    const handlerFor = <T,>(event: string): ((payload: T) => void) => {
        const call = [...stableWs.on.mock.calls].reverse().find(([name]) => name === event);
        if (!call) throw new Error(`no handler registered for ${event}`);
        return call[1] as (payload: T) => void;
    };
    const emitMessage = (msg: Message) => act(() => { handlerFor<Message>('message')(msg); });
    const emitReaction = (payload: ReactionEventPayload) => act(() => { handlerFor<ReactionEventPayload>('reaction')(payload); });
    const unread = (key: string) => countUnreadFrom(ctx!.messagesByChat[key] ?? [], key);

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        contactsPayload = [];
        chatsPayload = [];
        groupsPayload = { groups: [] };
        mockGet.mockImplementation((url: string) => {
            if (url === '/api/v1/user') return Promise.resolve({ data: { telephon: '111' } });
            if (url === '/api/v1/contact') return Promise.resolve({ data: contactsPayload });
            if (url === '/api/v1/chats') return Promise.resolve({ data: chatsPayload });
            if (url.startsWith('/api/v1/chat/')) return Promise.resolve({ data: [], headers: {} });
            return Promise.resolve({ data: null });
        });
        mockGetUserGroups.mockImplementation(() => Promise.resolve({ data: groupsPayload }));
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

    describe('state from the lists', () => {
        it('reads Muted/MutedUntil from /contact, /chats and /group, treating a past MutedUntil as not muted', async () => {
            contactsPayload = [contact('B', { muted: true }), contact('E')];
            chatsPayload = [
                chat('C', { muted: true, mutedUntil: inFuture() }),
                chat('D', { muted: true, mutedUntil: inPast() }),
            ];
            groupsPayload = { groups: [groupRow(9, { Muted: true }), groupRow(10), groupRow(11, { Muted: true, MutedUntil: inPast() })] };
            await mount();

            expect(ctx!.isMuted({ kind: 'direct', key: 'B' })).toBe(true);
            expect(ctx!.isMuted({ kind: 'direct', key: 'C' })).toBe(true);
            expect(ctx!.isMuted({ kind: 'direct', key: 'D' })).toBe(false);
            expect(ctx!.isMuted({ kind: 'direct', key: 'E' })).toBe(false);
            expect(ctx!.isMuted({ kind: 'direct', key: 'nobody' })).toBe(false);
            expect(ctx!.isMuted({ kind: 'group', id: 9 })).toBe(true);
            expect(ctx!.isMuted({ kind: 'group', id: 10 })).toBe(false);
            expect(ctx!.isMuted({ kind: 'group', id: 11 })).toBe(false);
        });

        it('ignores malformed mute fields', async () => {
            chatsPayload = [{ ...chat('C'), muted: 'yes' }];
            groupsPayload = { groups: [{ ...groupRow(9), muted: 1 }] };
            await mount();
            expect(ctx!.isMuted({ kind: 'direct', key: 'C' })).toBe(false);
            expect(ctx!.isMuted({ kind: 'group', id: 9 })).toBe(false);
        });

        it('muted:true with a malformed MutedUntil is not muted and warns', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            chatsPayload = [{ ...chat('C'), muted: true, MutedUntil: 'mañana' }];
            groupsPayload = { groups: [{ ...groupRow(9), muted: true, MutedUntil: 'mañana' }] };
            await mount();
            expect(ctx!.isMuted({ kind: 'direct', key: 'C' })).toBe(false);
            expect(ctx!.isMuted({ kind: 'group', id: 9 })).toBe(false);
            expect(warn).toHaveBeenCalled();
        });
    });

    describe('expiry', () => {
        afterEach(() => { vi.useRealTimers(); });

        it('a MutedUntil 1 s ahead flips isMuted to false once it passes, without a reload', async () => {
            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
            chatsPayload = [chat('C', { muted: true, mutedUntil: new Date(Date.now() + 1000).toISOString() })];
            groupsPayload = { groups: [groupRow(9, { Muted: true, MutedUntil: new Date(Date.now() + 1000).toISOString() })] };
            await mount();
            expect(ctx!.isMuted({ kind: 'direct', key: 'C' })).toBe(true);
            expect(ctx!.isMuted({ kind: 'group', id: 9 })).toBe(true);

            act(() => { vi.advanceTimersByTime(999); });
            expect(ctx!.isMuted({ kind: 'direct', key: 'C' })).toBe(true);
            act(() => { vi.advanceTimersByTime(2); });
            expect(ctx!.isMuted({ kind: 'direct', key: 'C' })).toBe(false);
            expect(ctx!.isMuted({ kind: 'group', id: 9 })).toBe(false);
        });

        it('the PUT answer is re-based on the client clock with the server Date (clock skew)', async () => {
            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
            await mount();
            // Server clock one hour ahead: its MutedUntil (server time) is 1 s after its own now.
            const serverNow = Date.now() + HOUR;
            mockSetChatMute.mockResolvedValue(putResult(new Date(serverNow + 1000).toISOString(), serverNow));
            await act(async () => { await ctx!.setMute({ kind: 'direct', key: 'B' }, '8h'); });
            expect(ctx!.isMuted({ kind: 'direct', key: 'B' })).toBe(true);
            act(() => { vi.advanceTimersByTime(1001); });
            expect(ctx!.isMuted({ kind: 'direct', key: 'B' })).toBe(false);
        });
    });

    describe('list refreshes vs. a local change', () => {
        it('a group_added refresh after setMute keeps the mute the server now reports', async () => {
            groupsPayload = { groups: [groupRow(9)] };
            await mount();
            mockSetGroupMute.mockResolvedValue(putResult(null));
            await act(async () => { await ctx!.setMute({ kind: 'group', id: 9 }, 'always'); });
            groupsPayload = { groups: [groupRow(9, { Muted: true }), groupRow(12)] };
            await act(async () => { handlerFor<GroupResponse>('group_added')(groupRow(12)); });
            expect(mockGetUserGroups).toHaveBeenCalledTimes(2);
            expect(ctx!.isMuted({ kind: 'group', id: 9 })).toBe(true);
            expect(ctx!.isMuted({ kind: 'group', id: 12 })).toBe(false);
        });

        it('group patch events (avatar / info) leave the mute intact', async () => {
            groupsPayload = { groups: [groupRow(9, { Muted: true })] };
            await mount();
            act(() => { handlerFor<{ groupID: number; avatarUrl: string }>('group_avatar_update')({ groupID: 9, avatarUrl: '/a.png' }); });
            act(() => {
                handlerFor<unknown>('group_info')({
                    groupID: 9, name: 'Nuevo', description: 'd',
                    systemMessage: { ID: 50, GroupID: 9, senderTelephon: '', message: 'x', time: new Date().toISOString(), Type: 'system' },
                });
            });
            expect(ctx!.groups.find(g => g.ID === 9)?.AvatarUrl).toBe('/a.png');
            expect(ctx!.isMuted({ kind: 'group', id: 9 })).toBe(true);
        });

        it('a stale in-flight group list (started before the PUT) does not clear the new mute', async () => {
            groupsPayload = { groups: [groupRow(9), groupRow(10, { Muted: true })] };
            await mount();
            const pending = deferred<{ data: unknown }>();
            mockGetUserGroups.mockImplementationOnce(() => pending.promise);
            let refresh: Promise<void> | undefined;
            act(() => { refresh = ctx!.fetchUserGroups(); });

            mockSetGroupMute.mockResolvedValue(putResult(null));
            await act(async () => { await ctx!.setMute({ kind: 'group', id: 9 }, 'always'); });
            mockClearGroupMute.mockResolvedValue(undefined);
            await act(async () => { await ctx!.clearMute({ kind: 'group', id: 10 }); });

            // The list was read before both changes: 9 unmuted, 10 still muted.
            await act(async () => {
                pending.resolve({ data: { groups: [groupRow(9), groupRow(10, { Muted: true }), groupRow(11, { Muted: true })] } });
                await refresh;
            });
            expect(ctx!.isMuted({ kind: 'group', id: 9 })).toBe(true);
            expect(ctx!.isMuted({ kind: 'group', id: 10 })).toBe(false);
            // Targets not changed locally still follow the list.
            expect(ctx!.isMuted({ kind: 'group', id: 11 })).toBe(true);

            // A list that starts after the change is authoritative again.
            groupsPayload = { groups: [groupRow(9), groupRow(10, { Muted: true })] };
            await act(async () => { await ctx!.fetchUserGroups(); });
            expect(ctx!.isMuted({ kind: 'group', id: 9 })).toBe(false);
            expect(ctx!.isMuted({ kind: 'group', id: 10 })).toBe(true);
        });

        it('stale in-flight /contact and /chats responses do not overwrite a newer 1:1 mute/unmute', async () => {
            const contactsReq = deferred<{ data: unknown }>();
            const chatsReq = deferred<{ data: unknown }>();
            mockGet.mockImplementation((url: string) => {
                if (url === '/api/v1/contact') return contactsReq.promise;
                if (url === '/api/v1/chats') return chatsReq.promise;
                if (url.startsWith('/api/v1/chat/')) return Promise.resolve({ data: [], headers: {} });
                return Promise.resolve({ data: null });
            });
            await mount();

            mockSetChatMute.mockResolvedValue(putResult(inFuture()));
            await act(async () => { await ctx!.setMute({ kind: 'direct', key: 'B' }, '8h'); });
            await act(async () => {
                contactsReq.resolve({ data: [contact('B'), contact('E', { muted: true })] });
                chatsReq.resolve({ data: [chat('B'), chat('F', { muted: true })] });
            });
            expect(ctx!.isMuted({ kind: 'direct', key: 'B' })).toBe(true);
            expect(ctx!.isMuted({ kind: 'direct', key: 'E' })).toBe(true);
            expect(ctx!.isMuted({ kind: 'direct', key: 'F' })).toBe(true);
        });
    });

    describe('setMute / clearMute', () => {
        it('1:1: PUT with the duration, then muted from the response; DELETE unmutes', async () => {
            await mount();
            mockSetChatMute.mockResolvedValue(putResult(inFuture()));
            let ok: boolean | undefined;
            await act(async () => { ok = await ctx!.setMute({ kind: 'direct', key: 'B' }, '8h'); });
            expect(ok).toBe(true);
            expect(mockSetChatMute).toHaveBeenCalledWith('B', '8h');
            expect(ctx!.isMuted({ kind: 'direct', key: 'B' })).toBe(true);

            mockClearChatMute.mockResolvedValue(undefined);
            await act(async () => { ok = await ctx!.clearMute({ kind: 'direct', key: 'B' }); });
            expect(ok).toBe(true);
            expect(mockClearChatMute).toHaveBeenCalledWith('B');
            expect(ctx!.isMuted({ kind: 'direct', key: 'B' })).toBe(false);
        });

        it('group: PUT/DELETE on the group endpoints', async () => {
            groupsPayload = { groups: [groupRow(9)] };
            await mount();
            mockSetGroupMute.mockResolvedValue(putResult(null));
            await act(async () => { await ctx!.setMute({ kind: 'group', id: 9 }, 'always'); });
            expect(mockSetGroupMute).toHaveBeenCalledWith(9, 'always');
            expect(ctx!.isMuted({ kind: 'group', id: 9 })).toBe(true);

            mockClearGroupMute.mockResolvedValue(undefined);
            await act(async () => { await ctx!.clearMute({ kind: 'group', id: 9 }); });
            expect(mockClearGroupMute).toHaveBeenCalledWith(9);
            expect(ctx!.isMuted({ kind: 'group', id: 9 })).toBe(false);
        });

        it('a failed or malformed answer toasts an error and leaves the state as it was', async () => {
            contactsPayload = [contact('B', { muted: true })];
            await mount();
            mockSetChatMute.mockRejectedValue(new Error('500'));
            let ok: boolean | undefined;
            await act(async () => { ok = await ctx!.setMute({ kind: 'direct', key: 'C' }, '1w'); });
            expect(ok).toBe(false);
            expect(ctx!.isMuted({ kind: 'direct', key: 'C' })).toBe(false);

            mockSetChatMute.mockResolvedValue(null);
            await act(async () => { ok = await ctx!.setMute({ kind: 'direct', key: 'C' }, '1w'); });
            expect(ok).toBe(false);

            mockClearChatMute.mockRejectedValue(new Error('500'));
            await act(async () => { ok = await ctx!.clearMute({ kind: 'direct', key: 'B' }); });
            expect(ok).toBe(false);
            expect(ctx!.isMuted({ kind: 'direct', key: 'B' })).toBe(true);

            expect(ctx!.toasts.map(t => [t.type, t.message])).toEqual([
                ['error', 'No se pudo silenciar el chat'],
                ['error', 'No se pudo silenciar el chat'],
                ['error', 'No se pudieron activar las notificaciones'],
            ]);
        });
    });

    describe('in-app suppression', () => {
        it('a muted chat gets no notification but its unread counter still increments', async () => {
            contactsPayload = [contact('B', { muted: true, mutedUntil: inFuture() }), contact('E')];
            await mount();

            emitMessage(incoming(1, 'B'));
            emitMessage(incoming(2, 'B'));
            expect(mockNotify).not.toHaveBeenCalled();
            expect(unread('B')).toBe(2);

            emitMessage(incoming(3, 'E'));
            expect(mockNotify).toHaveBeenCalledTimes(1);
            expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ tag: 'E', body: 'hola 3' }));
            expect(unread('E')).toBe(1);
        });

        it('notifies again once the chat is unmuted, and a mute set from the menu suppresses at once', async () => {
            contactsPayload = [contact('B')];
            await mount();
            mockSetChatMute.mockResolvedValue(putResult(null));
            await act(async () => { await ctx!.setMute({ kind: 'direct', key: 'B' }, 'always'); });
            emitMessage(incoming(1, 'B'));
            expect(mockNotify).not.toHaveBeenCalled();

            mockClearChatMute.mockResolvedValue(undefined);
            await act(async () => { await ctx!.clearMute({ kind: 'direct', key: 'B' }); });
            emitMessage(incoming(2, 'B'));
            expect(mockNotify).toHaveBeenCalledTimes(1);
            expect(unread('B')).toBe(2);
        });

        it('an expired mute (stale list) notifies', async () => {
            chatsPayload = [chat('D', { muted: true, mutedUntil: inPast() })];
            await mount();
            emitMessage(incoming(1, 'D'));
            expect(mockNotify).toHaveBeenCalledTimes(1);
        });

        it('reaction toasts are suppressed for a muted chat or group', async () => {
            contactsPayload = [contact('B', { muted: true })];
            groupsPayload = { groups: [groupRow(9, { Muted: true })] };
            await mount();
            emitReaction({
                kind: 'direct', messageID: 5, telephon: 'B', username: 'b', emoji: '👍', previousEmoji: '', authorTelephon: '111', preview: 'x',
            });
            emitReaction({
                kind: 'group', messageID: 7, groupID: 9, telephon: 'C', username: 'c', emoji: '👍', previousEmoji: '', authorTelephon: '111', preview: 'x',
            });
            expect(ctx!.toasts).toEqual([]);
            emitReaction({
                kind: 'group', messageID: 8, groupID: 10, telephon: 'C', username: 'c', emoji: '👍', previousEmoji: '', authorTelephon: '111', preview: 'y',
            });
            expect(ctx!.toasts.map(t => t.message)).toEqual(['c reaccionó 👍 a: y']);
        });
    });
});
