// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DashboardProvider, useDashboard, type DashboardContextValue, type SelectedGroup } from './DashboardContext';
import type { ChatGroup, ContactChat, GroupMessageResponse, Message } from '../../../types/api';
import type { DisappearingChangedPayload, MessagesExpiredPayload } from '../../../types/ws';

// disappearing-messages (DE5): `disappearing_changed` updates the per-chat / per-group timer and
// appends the system message once (WS echo + REST result share one path); `messages_expired`
// removes ids from messagesByChat, groupMessages and the detached windows; a single local timer
// removes messages whose ExpiresAt passed; system messages never count as unread.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type GetConfig = { params?: Record<string, number> } | undefined;
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

const mockSetChat = vi.fn();
const mockGetChatSettings = vi.fn();
const mockSetGroup = vi.fn();
vi.mock('../../../api/disappearingApi', () => ({
    setChatDisappearing: (...args: unknown[]) => mockSetChat(...args),
    getChatDisappearing: (...args: unknown[]) => mockGetChatSettings(...args),
    setGroupDisappearing: (...args: unknown[]) => mockSetGroup(...args),
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

const T0 = Date.parse('2026-01-01T12:00:00Z');
const at = (ms: number) => new Date(T0 + ms).toISOString();
const iso = (n: number) => new Date(Date.UTC(2024, 0, 1, 0, 0, n)).toISOString();
const chatMsg = (id: number, over: Partial<Message> = {}): Message => ({
    MessageID: id, SenderTelephon: 'B', Receptor: '111', Message: `m${id}`, Status: 'visto', Time: iso(id), Edited: false, ...over,
});
const groupMsg = (id: number, over: Partial<GroupMessageResponse> = {}): GroupMessageResponse => ({
    MessageID: id, GroupID: 9, SenderTelephon: 'B', SenderUsername: 'bea', Message: `g${id}`, Time: iso(id), Edited: false, ...over,
});
const directSys = (id: number, seconds: number, sender = '111'): Message => chatMsg(id, {
    SenderTelephon: sender, Receptor: sender === '111' ? 'B' : '111', Message: String(seconds), Kind: 'system', SystemEvent: 'disappearing_changed',
});
const groupSys = (id: number, seconds: number): GroupMessageResponse => groupMsg(id, {
    SenderTelephon: '111', SenderUsername: 'ana', Message: String(seconds), Kind: 'system', SystemEvent: 'disappearing_changed',
});
const ids = (list: ReadonlyArray<{ MessageID: number | string }> | undefined) => (list ?? []).map(m => m.MessageID);
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const contact = (n: string): ContactChat => ({ Number: n, ContactName: n, Username: n } as ContactChat);
const group = (over: Partial<SelectedGroup> = {}): SelectedGroup => ({
    ID: 9, Name: 'Equipo', CreatorTelephon: '111', MemberCount: 3, UserRole: 'member', CreatedAt: iso(0),
    OnlyAdminsCanSend: false, OnlyAdminsCanEditInfo: false, OnlyAdminsCanAddMembers: false, ...over,
});
const directEvent = (seconds: number, systemMessage?: Message | null): DisappearingChangedPayload => ({
    kind: 'direct', key: 'B', seconds, byTelephon: '111', ...(systemMessage !== undefined ? { systemMessage } : {}),
});
const groupEvent = (seconds: number, systemMessage?: GroupMessageResponse | null): DisappearingChangedPayload => ({
    kind: 'group', key: 9, seconds, byTelephon: '111', ...(systemMessage !== undefined ? { systemMessage } : {}),
});

describe('DashboardProvider disappearing messages', () => {
    let container: HTMLDivElement;
    let root: Root;
    let ctx: DashboardContextValue | undefined;
    let chatsPayload: ChatGroup[];

    const handlerFor = <T,>(event: string): ((payload: T) => void) => {
        const call = [...stableWs.on.mock.calls].reverse().find(([name]) => name === event);
        if (!call) throw new Error(`no handler registered for ${event}`);
        return call[1] as (payload: T) => void;
    };
    const emitChanged = (payload: unknown) => act(() => { handlerFor<unknown>('disappearing_changed')(payload); });
    const emitExpired = (payload: unknown) => act(() => { handlerFor<unknown>('messages_expired')(payload); });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        chatsPayload = [];
        mockGet.mockImplementation((url: string, config?: GetConfig) => {
            if (url === '/api/v1/user') return Promise.resolve({ data: { Telephon: '111' } });
            if (url === '/api/v1/chats') return Promise.resolve({ data: chatsPayload });
            if (url === '/api/v1/chat/B') {
                return Promise.resolve(config?.params?.around
                    ? { data: range(40, 60).map(id => chatMsg(id)), headers: { 'x-has-more-older': 'true', 'x-has-more-newer': 'true' } }
                    : { data: [], headers: {} });
            }
            return Promise.resolve({ data: null });
        });
        mockGetUserGroups.mockResolvedValue({ data: null });
        mockGetGroupMessages.mockResolvedValue({ data: { messages: [], hasMore: false } });
        mockGetGroupDetail.mockResolvedValue({ data: null });
        mockGetChatSettings.mockResolvedValue(null);
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
    const seed = async () => {
        await mount();
        await act(async () => {
            ctx!.setContacts([contact('B')]);
            ctx!.setMessagesByChat({ B: [chatMsg(5), chatMsg(6), chatMsg(7)] });
            ctx!.setGroups([group()]);
            ctx!.setGroupMessages({ 9: [groupMsg(15), groupMsg(16), groupMsg(17)] });
        });
    };

    describe('chat timer state', () => {
        it('seeds the per-chat timer from the chats list (absent = 0) and exposes it for the selected chat', async () => {
            chatsPayload = [
                { ContactTelephon: 'B', ContactUsername: 'bea', ContactName: 'Bea', ContactAvatarUrl: '', IsContact: true, Messages: [], DisappearSeconds: 604800 },
                { ContactTelephon: 'C', ContactUsername: 'carl', ContactName: 'Carl', ContactAvatarUrl: '', IsContact: true, Messages: [] },
            ];
            await mount();
            expect(ctx!.chatDisappear).toEqual({ B: 604800, C: 0 });
            await act(async () => { ctx!.setSelected({ Number: 'B', Username: 'bea' }); });
            expect(ctx!.selectedDisappearSeconds).toBe(604800);
            await act(async () => { ctx!.setSelected({ Number: 'C', Username: 'carl' }); });
            expect(ctx!.selectedDisappearSeconds).toBe(0);
        });

        it('GETs the settings when a chat with an unknown timer opens, and not when it is already known', async () => {
            mockGetChatSettings.mockResolvedValue(86400);
            await mount();
            await act(async () => { ctx!.setSelected({ Number: 'B', Username: 'bea' }); });
            expect(mockGetChatSettings).toHaveBeenCalledWith('B');
            expect(ctx!.chatDisappear['B']).toBe(86400);
            mockGetChatSettings.mockClear();
            await act(async () => { ctx!.setSelected({ Number: 'C', Username: 'carl' }); });
            await act(async () => { ctx!.setSelected({ Number: 'B', Username: 'bea' }); });
            expect(mockGetChatSettings).toHaveBeenCalledTimes(1);
            expect(mockGetChatSettings).toHaveBeenCalledWith('C');
        });

        it('ignores a failed or malformed settings GET', async () => {
            mockGetChatSettings.mockRejectedValue(new Error('boom'));
            await mount();
            await act(async () => { ctx!.setSelected({ Number: 'B', Username: 'bea' }); });
            expect(ctx!.chatDisappear['B']).toBeUndefined();
            expect(ctx!.selectedDisappearSeconds).toBe(0);
        });
    });

    describe('disappearing_changed', () => {
        it('direct: updates the timer and appends the system message once (WS twice + REST echo)', async () => {
            await seed();
            const sys = directSys(8, 86400);
            emitChanged(directEvent(86400, sys));
            expect(ctx!.chatDisappear['B']).toBe(86400);
            expect(ids(ctx!.messagesByChat['B'])).toEqual([5, 6, 7, 8]);
            emitChanged(directEvent(86400, sys));
            mockSetChat.mockResolvedValue({ kind: 'direct', key: 'B', seconds: 86400, byTelephon: '111', systemMessage: sys });
            let ok = false;
            await act(async () => { ok = await ctx!.setChatDisappearing('B', 86400); });
            expect(ok).toBe(true);
            expect(mockSetChat).toHaveBeenCalledWith('B', 86400);
            expect(ids(ctx!.messagesByChat['B'])).toEqual([5, 6, 7, 8]);
        });

        it('direct: REST result arriving before the WS echo is also deduped', async () => {
            await seed();
            const sys = directSys(8, 604800);
            mockSetChat.mockResolvedValue({ kind: 'direct', key: 'B', seconds: 604800, byTelephon: '111', systemMessage: sys });
            await act(async () => { await ctx!.setChatDisappearing('B', 604800); });
            emitChanged(directEvent(604800, sys));
            expect(ids(ctx!.messagesByChat['B'])).toEqual([5, 6, 7, 8]);
            expect(ctx!.chatDisappear['B']).toBe(604800);
        });

        it('direct: an unchanged event (null/absent systemMessage) only syncs the timer', async () => {
            await seed();
            emitChanged(directEvent(0, null));
            emitChanged(directEvent(0));
            expect(ctx!.chatDisappear['B']).toBe(0);
            expect(ids(ctx!.messagesByChat['B'])).toEqual([5, 6, 7]);
        });

        it('direct: creates the chat entry when the first event is a system message of a new chat', async () => {
            await mount();
            emitChanged(directEvent(86400, directSys(1, 86400)));
            expect(ids(ctx!.messagesByChat['B'])).toEqual([1]);
            expect(ctx!.allChatGroups['B']).toBeDefined();
        });

        it('group: updates DisappearSeconds on the list and the selected group and appends the notice once', async () => {
            await seed();
            await act(async () => { ctx!.setSelectedGroup(group()); });
            const sys = groupSys(18, 7776000);
            emitChanged(groupEvent(7776000, sys));
            emitChanged(groupEvent(7776000, sys));
            expect(ctx!.groups[0]!.DisappearSeconds).toBe(7776000);
            expect(ctx!.selectedGroup!.DisappearSeconds).toBe(7776000);
            expect(ctx!.selectedDisappearSeconds).toBe(7776000);
            expect(ids(ctx!.groupMessages[9])).toEqual([15, 16, 17, 18]);
            mockSetGroup.mockResolvedValue({ kind: 'group', key: 9, seconds: 7776000, byTelephon: '111', systemMessage: sys });
            await act(async () => { await ctx!.setGroupDisappearing(9, 7776000); });
            expect(mockSetGroup).toHaveBeenCalledWith(9, 7776000);
            expect(ids(ctx!.groupMessages[9])).toEqual([15, 16, 17, 18]);
        });

        it('ignores malformed payloads', async () => {
            await seed();
            emitChanged(null);
            emitChanged({ kind: 'direct', key: 'B', seconds: 3600, byTelephon: '111' });
            emitChanged({ kind: 'group', key: 'B', seconds: 0, byTelephon: '111' });
            expect(ctx!.chatDisappear['B']).toBeUndefined();
            expect(ids(ctx!.messagesByChat['B'])).toEqual([5, 6, 7]);
        });

        it('a failed setter toasts and reports false without touching state', async () => {
            await seed();
            mockSetChat.mockRejectedValue(new Error('403'));
            let ok = true;
            await act(async () => { ok = await ctx!.setChatDisappearing('B', 86400); });
            expect(ok).toBe(false);
            expect(ctx!.toasts.map(t => t.type)).toEqual(['error']);
            expect(ctx!.chatDisappear['B']).toBeUndefined();
            mockSetGroup.mockResolvedValue(null);
            await act(async () => { ok = await ctx!.setGroupDisappearing(9, 86400); });
            expect(ok).toBe(false);
        });
    });

    describe('messages_expired', () => {
        const openWindows = async () => {
            await act(async () => { await ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 50); });
            mockGetGroupMessages.mockResolvedValue({ data: { messages: range(40, 60).map(id => groupMsg(id)), hasMoreOlder: true, hasMoreNewer: true } });
        };

        it('direct: removes the ids from messagesByChat and the detached chat window, keeping paging', async () => {
            await seed();
            await openWindows();
            const pagingBefore = ctx!.chatPaging;
            const win = ctx!.focusedChat['B']!;
            emitExpired({ kind: 'direct', key: 'B', messageIDs: [6, 50, 51, 999] } satisfies MessagesExpiredPayload);
            expect(ids(ctx!.messagesByChat['B'])).toEqual([5, 7]);
            expect(ids(ctx!.focusedChat['B']!.messages)).toEqual(range(40, 60).filter(n => n !== 50 && n !== 51));
            expect(ctx!.focusedChat['B']!.hasMoreOlder).toBe(win.hasMoreOlder);
            expect(ctx!.focusedChat['B']!.hasMoreNewer).toBe(win.hasMoreNewer);
            expect(ctx!.chatPaging).toBe(pagingBefore);
        });

        it('group: removes the ids from groupMessages (and a detached group window)', async () => {
            await seed();
            emitExpired({ kind: 'group', key: 9, messageIDs: [16] });
            expect(ids(ctx!.groupMessages[9])).toEqual([15, 17]);
        });

        it('scrubs the quote of a reply to an expired message', async () => {
            await seed();
            await act(async () => {
                ctx!.setMessagesByChat({ B: [chatMsg(5), chatMsg(6, { ReplyToMessageID: 5, ReplyToTelephon: 'B', ReplyToMessage: 'm5' })] });
            });
            emitExpired({ kind: 'direct', key: 'B', messageIDs: [5] });
            expect(ctx!.messagesByChat['B']).toHaveLength(1);
            expect(ctx!.messagesByChat['B']![0]!.ReplyToMessage).toBeUndefined();
            expect(ctx!.messagesByChat['B']![0]!.ReplyToMessageID).toBeUndefined();
        });

        it('ignores malformed payloads and unknown chats', async () => {
            await seed();
            emitExpired(null);
            emitExpired({ kind: 'direct', key: 'B', messageIDs: [] });
            emitExpired({ kind: 'direct', key: 'ZZ', messageIDs: [5] });
            expect(ids(ctx!.messagesByChat['B'])).toEqual([5, 6, 7]);
        });
    });

    describe('local expiry timer', () => {
        const mountFake = async () => {
            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
            vi.setSystemTime(T0);
            await mount();
        };

        it('removes a message at its ExpiresAt from every list, only then, and re-arms for the next one', async () => {
            await mountFake();
            await act(async () => {
                ctx!.setMessagesByChat({ B: [chatMsg(5), chatMsg(6, { ExpiresAt: at(5000) }), chatMsg(7, { ExpiresAt: at(60_000) })] });
                ctx!.setGroupMessages({ 9: [groupMsg(15, { ExpiresAt: at(5000) }), groupMsg(16)] });
            });
            act(() => { vi.advanceTimersByTime(4999); });
            expect(ids(ctx!.messagesByChat['B'])).toEqual([5, 6, 7]);
            act(() => { vi.advanceTimersByTime(1); });
            expect(ids(ctx!.messagesByChat['B'])).toEqual([5, 7]);
            expect(ids(ctx!.groupMessages[9])).toEqual([16]);
            // re-armed for the next expiry
            act(() => { vi.advanceTimersByTime(55_000); });
            expect(ids(ctx!.messagesByChat['B'])).toEqual([5]);
        });

        it('also expires messages held only by a detached window', async () => {
            await mountFake();
            mockGet.mockImplementation((url: string, config?: GetConfig) => {
                if (url === '/api/v1/chat/B' && config?.params?.around) {
                    return Promise.resolve({
                        data: [chatMsg(40), chatMsg(41, { ExpiresAt: at(3000) })],
                        headers: { 'x-has-more-older': 'false', 'x-has-more-newer': 'false' },
                    });
                }
                if (url === '/api/v1/user') return Promise.resolve({ data: { Telephon: '111' } });
                return Promise.resolve({ data: url === '/api/v1/chats' ? [] : null });
            });
            await act(async () => { await ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 40); });
            expect(ids(ctx!.focusedChat['B']!.messages)).toEqual([40, 41]);
            act(() => { vi.advanceTimersByTime(3000); });
            expect(ids(ctx!.focusedChat['B']!.messages)).toEqual([40]);
        });

        it('keeps far-future and invalid-ExpiresAt messages, and re-arms after the capped delay', async () => {
            await mountFake();
            const threeHours = 3 * 60 * 60 * 1000;
            await act(async () => {
                ctx!.setMessagesByChat({ B: [chatMsg(5, { ExpiresAt: at(threeHours) }), chatMsg(6, { ExpiresAt: 'garbage' }), chatMsg(7)] });
            });
            act(() => { vi.advanceTimersByTime(60 * 60 * 1000); });
            expect(ids(ctx!.messagesByChat['B'])).toEqual([5, 6, 7]);
            // each capped fire re-arms through a React effect, so advance one cap at a time
            act(() => { vi.advanceTimersByTime(60 * 60 * 1000); });
            expect(ids(ctx!.messagesByChat['B'])).toEqual([5, 6, 7]);
            act(() => { vi.advanceTimersByTime(60 * 60 * 1000); });
            expect(ids(ctx!.messagesByChat['B'])).toEqual([6, 7]);
        });

        it('a message that arrives later with a nearer expiry re-arms the single timer', async () => {
            await mountFake();
            await act(async () => { ctx!.setMessagesByChat({ B: [chatMsg(5, { ExpiresAt: at(100_000) })] }); });
            await act(async () => { ctx!.setMessagesByChat({ B: [chatMsg(5, { ExpiresAt: at(100_000) }), chatMsg(6, { ExpiresAt: at(2000) })] }); });
            act(() => { vi.advanceTimersByTime(2000); });
            expect(ids(ctx!.messagesByChat['B'])).toEqual([5]);
        });

        it('never expires system messages', async () => {
            await mountFake();
            await act(async () => { ctx!.setMessagesByChat({ B: [directSys(8, 86400)] }); });
            act(() => { vi.advanceTimersByTime(24 * 60 * 60 * 1000); });
            expect(ids(ctx!.messagesByChat['B'])).toEqual([8]);
        });
    });

    describe('system messages and unread', () => {
        it('markAsRead does not treat an unseen system message as unread', async () => {
            await seed();
            await act(async () => {
                ctx!.setMessagesByChat({ B: [chatMsg(5), directSys(8, 86400, 'B')] });
                ctx!.setMessagesByChat(prev => ({ ...prev, B: prev['B']!.map(m => (m.Kind === 'system' ? { ...m, Status: 'enviado' as const } : m)) }));
            });
            act(() => { ctx!.markAsRead('B'); });
            expect(ctx!.messagesByChat['B']!.find(m => m.Kind === 'system')!.Status).toBe('enviado');
        });
    });
});
