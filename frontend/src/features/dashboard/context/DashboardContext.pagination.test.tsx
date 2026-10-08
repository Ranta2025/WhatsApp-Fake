// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DashboardProvider, useDashboard, type DashboardContextValue } from './DashboardContext';
import type { GroupMessageResponse, Message } from '../../../types/api';

// message-pagination (MP3): loadOlderMessages / loadOlderGroupMessages prepend older
// pages (dedupe + sort, per-chat hasMore/loadingOlder), and the re-sync / detail
// fetchers merge instead of wiping pages that were already loaded.

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

// Stable identities (see DashboardContext.fetchers.test.tsx for why).
const stableUser = { username: 'ana', telephon: '111', avatar: '' };
const stableLogout = vi.fn();
const stableWs = {
    isConnected: false,
    connectionState: 'disconnected' as const,
    on: vi.fn(), off: vi.fn(),
    sendMessage: vi.fn(), sendReadConfirmation: vi.fn(), sendTypingIndicator: vi.fn(),
    sendGroupMessage: vi.fn(), sendGroupTyping: vi.fn(), sendGroupEditMessage: vi.fn(),
    sendGroupDeleteMessage: vi.fn(), sendGroupJoin: vi.fn(),
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
const chatMsg = (id: number): Message => ({
    messageID: id, senderTelephon: 'B', receptor: '111', message: `m${id}`, status: 'visto', time: iso(id), edited: false,
});
const groupMsg = (id: number): GroupMessageResponse => ({
    MessageID: id, GroupID: 9, SenderTelephon: 'B', SenderUsername: 'bea', Message: `g${id}`, Time: iso(id), Edited: false,
});
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const ids = (list: ReadonlyArray<{ MessageID?: number | string; messageID?: number | string }> | undefined) => (list ?? []).map(m => m.messageID !== undefined ? m.messageID : m.MessageID);

describe('DashboardProvider message pagination', () => {
    let container: HTMLDivElement;
    let root: Root;
    let ctx: DashboardContextValue | undefined;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    // Route by URL: chat history, initial chats list, everything else -> null body.
    let chatHandler: (config?: { params?: Record<string, number> }) => { data: unknown; headers?: Record<string, string> };
    let chatsHandler: () => { data: unknown };

    beforeEach(() => {
        vi.clearAllMocks();
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        chatHandler = () => ({ data: [], headers: { 'x-has-more': 'false' } });
        chatsHandler = () => ({ data: null });
        mockGet.mockImplementation((url: string, config?: { params?: Record<string, number> }) => {
            if (url === '/api/v1/chat/B') return Promise.resolve(chatHandler(config));
            if (url === '/api/v1/chats') return Promise.resolve(chatsHandler());
            return Promise.resolve({ data: null });
        });
        mockGetUserGroups.mockResolvedValue({ data: null });
        mockGetGroupMessages.mockResolvedValue({ data: { messages: [], hasMore: false } });
        mockGetGroupDetail.mockResolvedValue({ data: null });
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        ctx = undefined;
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
        consoleErrorSpy.mockRestore();
    });

    const mount = async () => {
        await act(async () => {
            root.render(<DashboardProvider><Harness onReady={(v) => { ctx = v; }} /></DashboardProvider>);
        });
    };

    describe('1:1 chat', () => {
        it('fetchChatMessages records hasMore from the X-Has-More header', async () => {
            chatHandler = () => ({ data: range(51, 100).map(chatMsg), headers: { 'x-has-more': 'true' } });
            await mount();
            await act(async () => { await ctx!.fetchChatMessages('B'); });

            expect(ctx?.chatPaging['B']?.hasMore).toBe(true);
            expect(ids(ctx?.messagesByChat['B'])).toEqual(range(51, 100));
        });

        it('loadOlderMessages requests before=oldest id and prepends the page without duplicates', async () => {
            chatHandler = () => ({ data: range(51, 100).map(chatMsg), headers: { 'x-has-more': 'true' } });
            await mount();
            await act(async () => { await ctx!.fetchChatMessages('B'); });

            chatHandler = () => ({ data: range(1, 51).map(chatMsg), headers: { 'x-has-more': 'false' } });
            await act(async () => { await ctx!.loadOlderMessages('B'); });

            expect(mockGet).toHaveBeenLastCalledWith('/api/v1/chat/B', { params: { before: 51, limit: 50 } });
            expect(ids(ctx?.messagesByChat['B'])).toEqual(range(1, 100));
            expect(ctx?.chatPaging['B']).toMatchObject({ hasMore: false, loadingOlder: false });
        });

        it('does not request again when hasMore is false', async () => {
            chatHandler = () => ({ data: range(1, 10).map(chatMsg), headers: { 'x-has-more': 'false' } });
            await mount();
            await act(async () => { await ctx!.fetchChatMessages('B'); });
            mockGet.mockClear();

            await act(async () => { await ctx!.loadOlderMessages('B'); });

            expect(mockGet).not.toHaveBeenCalled();
        });

        it('coalesces concurrent loadOlder calls into one request and clears loadingOlder on failure', async () => {
            chatHandler = () => ({ data: range(51, 100).map(chatMsg), headers: { 'x-has-more': 'true' } });
            await mount();
            await act(async () => { await ctx!.fetchChatMessages('B'); });
            mockGet.mockClear();

            chatHandler = () => { throw new Error('boom'); };
            mockGet.mockImplementation(() => Promise.reject(new Error('boom')));
            await act(async () => {
                await Promise.all([ctx!.loadOlderMessages('B'), ctx!.loadOlderMessages('B')]);
            });

            expect(mockGet).toHaveBeenCalledTimes(1);
            expect(ctx?.chatPaging['B']).toMatchObject({ hasMore: true, loadingOlder: false });
            expect(ids(ctx?.messagesByChat['B'])).toEqual(range(51, 100));
        });

        it('a second loadOlder right after the first resolves (before the commit) does not repeat the same cursor', async () => {
            chatHandler = () => ({ data: range(51, 100).map(chatMsg), headers: { 'x-has-more': 'true' } });
            await mount();
            await act(async () => { await ctx!.fetchChatMessages('B'); });
            mockGet.mockClear();

            chatHandler = (config) => (config?.params?.before === 51
                ? { data: range(1, 50).map(chatMsg), headers: { 'x-has-more': 'false' } }
                : { data: [], headers: { 'x-has-more': 'false' } });
            await act(async () => {
                await ctx!.loadOlderMessages('B');
                await ctx!.loadOlderMessages('B');
            });

            const befores = mockGet.mock.calls.map(c => (c[1] as { params: { before: number } }).params.before);
            expect(befores.filter(b => b === 51)).toHaveLength(1);
        });

        it('an empty older page ends pagination even if the header says hasMore (no request loop)', async () => {
            chatHandler = () => ({ data: range(51, 100).map(chatMsg), headers: { 'x-has-more': 'true' } });
            await mount();
            await act(async () => { await ctx!.fetchChatMessages('B'); });

            chatHandler = () => ({ data: [], headers: { 'x-has-more': 'true' } });
            await act(async () => { await ctx!.loadOlderMessages('B'); });

            expect(ctx?.chatPaging['B']).toMatchObject({ hasMore: false, loadingOlder: false });
        });

        it('re-syncing the chats list keeps pages that were already loaded', async () => {
            chatHandler = () => ({ data: range(51, 100).map(chatMsg), headers: { 'x-has-more': 'true' } });
            await mount();
            await act(async () => { await ctx!.fetchChatMessages('B'); });
            chatHandler = () => ({ data: range(1, 51).map(chatMsg), headers: { 'x-has-more': 'false' } });
            await act(async () => { await ctx!.loadOlderMessages('B'); });

            chatsHandler = () => ({
                data: [{
                    contactTelephon: 'B', contactUsername: 'bea', contactName: 'Bea', contactAvatarUrl: '',
                    isContact: true, messages: range(51, 101).map(chatMsg),
                }],
            });
            await act(async () => { await ctx!.fetchAllChats(); });

            expect(ids(ctx?.messagesByChat['B'])).toEqual(range(1, 101));
            expect(ctx?.chatPaging['B']?.hasMore).toBe(false);
        });

        it('fetchAllChats derives hasMore from a full initial window (200)', async () => {
            chatsHandler = () => ({
                data: [{
                    contactTelephon: 'B', contactUsername: 'bea', contactName: 'Bea', contactAvatarUrl: '',
                    isContact: true, messages: range(1, 200).map(chatMsg),
                }],
            });
            await mount();

            expect(ctx?.chatPaging['B']?.hasMore).toBe(true);
        });

        it('fetchChatMessages re-fetch does not wipe older pages', async () => {
            chatHandler = () => ({ data: range(51, 100).map(chatMsg), headers: { 'x-has-more': 'true' } });
            await mount();
            await act(async () => { await ctx!.fetchChatMessages('B'); });
            chatHandler = () => ({ data: range(1, 50).map(chatMsg), headers: { 'x-has-more': 'false' } });
            await act(async () => { await ctx!.loadOlderMessages('B'); });

            chatHandler = () => ({ data: range(51, 100).map(chatMsg), headers: { 'x-has-more': 'true' } });
            await act(async () => { await ctx!.fetchChatMessages('B'); });

            expect(ids(ctx?.messagesByChat['B'])).toEqual(range(1, 100));
            expect(ctx?.chatPaging['B']?.hasMore).toBe(false);
        });

        it('a gapped fetchChatMessages re-sync drops the stale block and resumes paging from the fresh window', async () => {
            chatHandler = () => ({ data: range(51, 100).map(chatMsg), headers: { 'x-has-more': 'true' } });
            await mount();
            await act(async () => { await ctx!.fetchChatMessages('B'); });
            chatHandler = () => ({ data: range(1, 50).map(chatMsg), headers: { 'x-has-more': 'false' } });
            await act(async () => { await ctx!.loadOlderMessages('B'); });
            expect(ctx?.chatPaging['B']).toMatchObject({ olderLoaded: true, hasMore: false });

            // 300 messages arrived while away: fresh window 351..550 does not touch 1..100.
            chatHandler = () => ({ data: range(351, 550).map(chatMsg), headers: { 'x-has-more': 'true' } });
            await act(async () => { await ctx!.fetchChatMessages('B'); });
            expect(ids(ctx?.messagesByChat['B'])).toEqual(range(351, 550));
            expect(ctx?.chatPaging['B']).toMatchObject({ hasMore: true, olderLoaded: false });

            chatHandler = () => ({ data: range(301, 350).map(chatMsg), headers: { 'x-has-more': 'true' } });
            await act(async () => { await ctx!.loadOlderMessages('B'); });
            expect(mockGet).toHaveBeenLastCalledWith('/api/v1/chat/B', { params: { before: 351, limit: 50 } });
        });

        it('a gapped fetchAllChats re-sync resets paging to the fresh window', async () => {
            chatHandler = () => ({ data: range(51, 100).map(chatMsg), headers: { 'x-has-more': 'true' } });
            await mount();
            await act(async () => { await ctx!.fetchChatMessages('B'); });
            chatHandler = () => ({ data: range(1, 50).map(chatMsg), headers: { 'x-has-more': 'false' } });
            await act(async () => { await ctx!.loadOlderMessages('B'); });

            chatsHandler = () => ({
                data: [{
                    contactTelephon: 'B', contactUsername: 'bea', contactName: 'Bea', contactAvatarUrl: '',
                    isContact: true, messages: range(351, 550).map(chatMsg),
                }],
            });
            await act(async () => { await ctx!.fetchAllChats(); });

            expect(ids(ctx?.messagesByChat['B'])).toEqual(range(351, 550));
            expect(ctx?.chatPaging['B']).toMatchObject({ hasMore: true, olderLoaded: false });
        });
    });

    describe('group chat', () => {
        // The backend returns pages newest-first ({ messages: DESC, hasMore }).
        const desc = (from: number, to: number) => range(from, to).reverse().map(groupMsg);

        it('fetchGroupMessages stores the page sorted ascending and records hasMore', async () => {
            mockGetGroupMessages.mockResolvedValue({ data: { messages: desc(51, 100), hasMore: true } });
            await mount();
            await act(async () => { await ctx!.fetchGroupMessages(9); });

            expect(ids(ctx?.groupMessages[9])).toEqual(range(51, 100));
            expect(ctx?.groupPaging[9]?.hasMore).toBe(true);
        });

        it('loadOlderGroupMessages passes before=oldest real id, ignoring entries without a numeric id', async () => {
            mockGetGroupMessages.mockResolvedValue({ data: { messages: desc(51, 100), hasMore: true } });
            await mount();
            await act(async () => { await ctx!.fetchGroupMessages(9); });
            // Malformed/legacy entry (non-numeric id): never a pagination cursor.
            const malformed = { messageID: 'system_1', GroupID: 9, message: 'x', time: iso(1) } as unknown as GroupMessageResponse;
            await act(async () => {
                ctx!.setGroupMessages(prev => ({
                    ...prev,
                    [9]: [malformed, ...(prev[9] ?? [])],
                }));
            });

            mockGetGroupMessages.mockResolvedValue({ data: { messages: desc(1, 50), hasMore: false } });
            await act(async () => { await ctx!.loadOlderGroupMessages(9); });

            expect(mockGetGroupMessages).toHaveBeenLastCalledWith(9, 50, 0, 51);
            expect(ids(ctx?.groupMessages[9])).toEqual(['system_1', ...range(1, 100)]);
            expect(ctx?.groupPaging[9]).toMatchObject({ hasMore: false, loadingOlder: false });
        });

        it('fetchGroupDetail and fetchGroupMessages re-fetches keep loaded older pages', async () => {
            mockGetGroupMessages.mockResolvedValue({ data: { messages: desc(51, 100), hasMore: true } });
            await mount();
            await act(async () => { await ctx!.fetchGroupMessages(9); });
            mockGetGroupMessages.mockResolvedValue({ data: { messages: desc(1, 50), hasMore: false } });
            await act(async () => { await ctx!.loadOlderGroupMessages(9); });

            mockGetGroupDetail.mockResolvedValue({ data: { ID: 9, Members: [], Messages: desc(51, 101) } });
            await act(async () => { await ctx!.fetchGroupDetail(9); });
            expect(ids(ctx?.groupMessages[9])).toEqual(range(1, 101));

            mockGetGroupMessages.mockResolvedValue({ data: { messages: desc(52, 101), hasMore: true } });
            await act(async () => { await ctx!.fetchGroupMessages(9); });
            expect(ids(ctx?.groupMessages[9])).toEqual(range(1, 101));
            expect(ctx?.groupPaging[9]?.hasMore).toBe(false);
        });

        it('a gapped fetchGroupMessages / fetchGroupDetail re-sync resets group paging to the fresh window', async () => {
            mockGetGroupMessages.mockResolvedValue({ data: { messages: desc(51, 100), hasMore: true } });
            await mount();
            await act(async () => { await ctx!.fetchGroupMessages(9); });
            mockGetGroupMessages.mockResolvedValue({ data: { messages: desc(1, 50), hasMore: false } });
            await act(async () => { await ctx!.loadOlderGroupMessages(9); });

            mockGetGroupMessages.mockResolvedValue({ data: { messages: desc(201, 250), hasMore: true } });
            await act(async () => { await ctx!.fetchGroupMessages(9); });
            expect(ids(ctx?.groupMessages[9])).toEqual(range(201, 250));
            expect(ctx?.groupPaging[9]).toMatchObject({ hasMore: true, olderLoaded: false });

            mockGetGroupMessages.mockResolvedValue({ data: { messages: desc(151, 200), hasMore: true } });
            await act(async () => { await ctx!.loadOlderGroupMessages(9); });
            expect(mockGetGroupMessages).toHaveBeenLastCalledWith(9, 50, 0, 201);
            expect(ctx?.groupPaging[9]).toMatchObject({ olderLoaded: true });

            mockGetGroupDetail.mockResolvedValue({ data: { ID: 9, Members: [], Messages: desc(401, 450) } });
            await act(async () => { await ctx!.fetchGroupDetail(9); });
            expect(ids(ctx?.groupMessages[9])).toEqual(range(401, 450));
            expect(ctx?.groupPaging[9]).toMatchObject({ hasMore: true, olderLoaded: false });
        });

        it('a second loadOlderGroupMessages right after the first resolves does not repeat the same cursor', async () => {
            mockGetGroupMessages.mockResolvedValue({ data: { messages: range(51, 100).map(groupMsg), hasMore: true } });
            await mount();
            await act(async () => { await ctx!.fetchGroupMessages(9); });
            mockGetGroupMessages.mockClear();

            mockGetGroupMessages.mockImplementation((_id: number, _l: number, _o: number, before?: number) => Promise.resolve(
                before === 51 ? { data: { messages: range(1, 50).map(groupMsg), hasMore: false } } : { data: { messages: [], hasMore: false } },
            ));
            await act(async () => {
                await ctx!.loadOlderGroupMessages(9);
                await ctx!.loadOlderGroupMessages(9);
            });

            const befores = mockGetGroupMessages.mock.calls.map(c => c[3]);
            expect(befores.filter(x => x === 51)).toHaveLength(1);
        });

        it('an empty older group page ends pagination even if hasMore is true', async () => {
            mockGetGroupMessages.mockResolvedValue({ data: { messages: desc(51, 100), hasMore: true } });
            await mount();
            await act(async () => { await ctx!.fetchGroupMessages(9); });

            mockGetGroupMessages.mockResolvedValue({ data: { messages: [], hasMore: true } });
            await act(async () => { await ctx!.loadOlderGroupMessages(9); });

            expect(ctx?.groupPaging[9]).toMatchObject({ hasMore: false, loadingOlder: false });
        });

        it('a null/garbage older page is tolerated and stops further loading only via hasMore', async () => {
            mockGetGroupMessages.mockResolvedValue({ data: { messages: desc(51, 100), hasMore: true } });
            await mount();
            await act(async () => { await ctx!.fetchGroupMessages(9); });

            mockGetGroupMessages.mockResolvedValue({ data: null });
            await act(async () => { await ctx!.loadOlderGroupMessages(9); });

            expect(ids(ctx?.groupMessages[9])).toEqual(range(51, 100));
            expect(ctx?.groupPaging[9]?.loadingOlder).toBe(false);
            expect(consoleErrorSpy).not.toHaveBeenCalled();
        });
    });
});
