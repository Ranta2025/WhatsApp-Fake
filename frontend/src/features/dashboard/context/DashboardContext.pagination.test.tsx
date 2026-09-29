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
    MessageID: id, SenderTelephon: 'B', Receptor: '111', Message: `m${id}`, Status: 'visto', Time: iso(id), Edited: false,
});
const groupMsg = (id: number): GroupMessageResponse => ({
    MessageID: id, GroupID: 9, SenderTelephon: 'B', SenderUsername: 'bea', Message: `g${id}`, Time: iso(id), Edited: false,
});
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const ids = (list: ReadonlyArray<{ MessageID: number | string }> | undefined) => (list ?? []).map(m => m.MessageID);

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

        it('re-syncing the chats list keeps pages that were already loaded', async () => {
            chatHandler = () => ({ data: range(51, 100).map(chatMsg), headers: { 'x-has-more': 'true' } });
            await mount();
            await act(async () => { await ctx!.fetchChatMessages('B'); });
            chatHandler = () => ({ data: range(1, 51).map(chatMsg), headers: { 'x-has-more': 'false' } });
            await act(async () => { await ctx!.loadOlderMessages('B'); });

            chatsHandler = () => ({
                data: [{
                    ContactTelephon: 'B', ContactUsername: 'bea', ContactName: 'Bea', ContactAvatarUrl: '',
                    IsContact: true, Messages: range(51, 101).map(chatMsg),
                }],
            });
            await act(async () => { await ctx!.fetchAllChats(); });

            expect(ids(ctx?.messagesByChat['B'])).toEqual(range(1, 101));
            expect(ctx?.chatPaging['B']?.hasMore).toBe(false);
        });

        it('fetchAllChats derives hasMore from a full initial window (200)', async () => {
            chatsHandler = () => ({
                data: [{
                    ContactTelephon: 'B', ContactUsername: 'bea', ContactName: 'Bea', ContactAvatarUrl: '',
                    IsContact: true, Messages: range(1, 200).map(chatMsg),
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

        it('loadOlderGroupMessages passes before=oldest real id, ignoring synthetic entries', async () => {
            mockGetGroupMessages.mockResolvedValue({ data: { messages: desc(51, 100), hasMore: true } });
            await mount();
            await act(async () => { await ctx!.fetchGroupMessages(9); });
            await act(async () => {
                ctx!.setGroupMessages(prev => ({
                    ...prev,
                    [9]: [{ MessageID: 'system_1', GroupID: 9, IsSystem: true, Message: 'x', Time: iso(1) }, ...(prev[9] ?? [])],
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
