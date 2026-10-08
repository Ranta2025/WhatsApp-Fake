// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DashboardProvider, useDashboard, type DashboardContextValue } from './DashboardContext';
import type { ContactChat, GroupMessageResponse, Message } from '../../../types/api';

// message-search (MS4): detached windows (`focusedChat` / `focusedGroup`) opened by
// `openMessageAt` live OUTSIDE messagesByChat / groupMessages, so a window taken from the
// middle of the history can never corrupt the normal (latest-anchored) list or its paging.

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
const chatMsg = (id: number): Message => ({
    messageID: id, senderTelephon: 'B', receptor: '111', message: `m${id}`, status: 'visto', time: iso(id), edited: false,
});
const groupMsg = (id: number): GroupMessageResponse => ({
    MessageID: id, GroupID: 9, SenderTelephon: 'B', SenderUsername: 'bea', Message: `g${id}`, Time: iso(id), Edited: false,
});
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const ids = (list: ReadonlyArray<{ MessageID?: number | string; messageID?: number | string }> | undefined) => (list ?? []).map(m => m.messageID !== undefined ? m.messageID : m.MessageID);
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, response: { status } });
const contact = (n: string): ContactChat => ({ telephon: n, contactName: n, username: n } as ContactChat);

type GetConfig = { params?: Record<string, number> } | undefined;

describe('DashboardProvider detached windows', () => {
    let container: HTMLDivElement;
    let root: Root;
    let ctx: DashboardContextValue | undefined;
    let chatHandler: (url: string, config: GetConfig) => unknown;
    let groupHandler: (config: GetConfig) => unknown;

    const handlerFor = <T,>(event: string): ((payload: T) => void) => {
        const call = [...stableWs.on.mock.calls].reverse().find(([name]) => name === event);
        if (!call) throw new Error(`no handler registered for ${event}`);
        return call[1] as (payload: T) => void;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        chatHandler = () => ({ data: [], headers: {} });
        groupHandler = () => ({ data: { messages: [] } });
        mockGet.mockImplementation((url: string, config?: GetConfig) => {
            if (url === '/api/v1/user') return Promise.resolve({ data: { telephon: '111' } });
            if (url.startsWith('/api/v1/chat/')) return Promise.resolve(chatHandler(url, config));
            if (url === '/api/v1/group/9/message') return Promise.resolve(groupHandler(config));
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
        vi.restoreAllMocks();
    });

    const fc = () => {
        const win = ctx?.focusedChat['B'];
        if (!win) throw new Error('no focused chat window for B');
        return win;
    };
    const fg = () => {
        const win = ctx?.focusedGroup[9];
        if (!win) throw new Error('no focused group window for 9');
        return win;
    };

    const mount = async () => {
        await act(async () => {
            root.render(<DashboardProvider><Harness onReady={(v) => { ctx = v; }} /></DashboardProvider>);
        });
    };

    const around = (from: number, to: number, flags: { older?: boolean; newer?: boolean } = {}) => (
        { data: range(from, to).map(chatMsg), headers: { 'x-has-more-older': String(flags.older ?? true), 'x-has-more-newer': String(flags.newer ?? true) } }
    );

    describe('1:1 chat', () => {
        it('openMessageAt loads the around window into focusedChat and leaves the normal list alone', async () => {
            await mount();
            await act(async () => { await ctx!.fetchChatMessages('B'); });
            const normalBefore = ctx!.messagesByChat['B'];
            chatHandler = (_url, config) => (config?.params?.around ? around(40, 60) : { data: [], headers: {} });

            let ok = false;
            await act(async () => { ok = await ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 50); });

            expect(ok).toBe(true);
            expect(mockGet).toHaveBeenCalledWith('/api/v1/chat/B', { params: { around: 50, limit: 50 } });
            const win = fc();
            expect(ids(win.messages)).toEqual(range(40, 60));
            expect(win).toMatchObject({ targetId: 50, hasMoreOlder: true, hasMoreNewer: true, loadingOlder: false, loadingNewer: false });
            expect(ctx!.messagesByChat['B']).toBe(normalBefore);
            expect(ctx!.chatPaging['B']?.hasMore ?? false).toBe(false);
        });

        it('opening a message already inside the window does not refetch: it only re-targets (seq bumps)', async () => {
            chatHandler = () => around(40, 60);
            await mount();
            await act(async () => { await ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 50); });
            const seq = fc().seq;
            mockGet.mockClear();

            await act(async () => { await ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 45); });

            expect(mockGet).not.toHaveBeenCalled();
            expect(ctx!.focusedChat['B']).toMatchObject({ targetId: 45 });
            expect(fc().seq).toBe(seq + 1);
        });

        it('opening a message outside the window replaces it with a new around window', async () => {
            chatHandler = (_u, config) => (config?.params?.around === 5 ? around(1, 10, { older: false }) : around(40, 60));
            await mount();
            await act(async () => { await ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 50); });
            await act(async () => { await ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 5); });

            expect(ids(fc().messages)).toEqual(range(1, 10));
            expect(ctx!.focusedChat['B']).toMatchObject({ targetId: 5, hasMoreOlder: false });
        });

        it('a server window that does not contain the target is rejected (toast, no window)', async () => {
            chatHandler = () => around(40, 45);
            await mount();
            let ok = true;
            await act(async () => { ok = await ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 999); });

            expect(ok).toBe(false);
            expect(ctx!.focusedChat['B']).toBeUndefined();
            expect(ctx!.toasts.at(-1)?.type).toBe('error');
        });

        it('404 (message no longer visible) toasts and opens nothing', async () => {
            mockGet.mockImplementation((url: string) => (
                url.startsWith('/api/v1/chat/') ? Promise.reject(httpError(404)) : Promise.resolve({ data: null })
            ));
            await mount();
            let ok = true;
            await act(async () => { ok = await ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 5); });

            expect(ok).toBe(false);
            expect(ctx!.focusedChat['B']).toBeUndefined();
            expect(ctx!.toasts.at(-1)?.message).toMatch(/ya no está disponible/i);
        });

        it('other failures toast a generic error', async () => {
            mockGet.mockImplementation((url: string) => (
                url.startsWith('/api/v1/chat/') ? Promise.reject(httpError(500)) : Promise.resolve({ data: null })
            ));
            await mount();
            await act(async () => { await ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 5); });

            expect(ctx!.toasts.at(-1)?.message).toMatch(/no se pudo abrir/i);
        });

        it('loadOlderFocused requests before=oldest, prepends and updates the flag', async () => {
            chatHandler = (_u, config) => (config?.params?.before
                ? { data: range(30, 39).map(chatMsg), headers: { 'x-has-more': 'false' } }
                : around(40, 60));
            await mount();
            await act(async () => { await ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 50); });

            await act(async () => { await ctx!.loadOlderFocused({ kind: 'chat', key: 'B' }); });

            expect(mockGet).toHaveBeenLastCalledWith('/api/v1/chat/B', { params: { before: 40, limit: 50 } });
            expect(ids(fc().messages)).toEqual(range(30, 60));
            expect(ctx!.focusedChat['B']).toMatchObject({ hasMoreOlder: false, loadingOlder: false });
        });

        it('loadOlderFocused does nothing without hasMoreOlder and coalesces concurrent calls', async () => {
            let resolveBefore: (v: unknown) => void = () => {};
            chatHandler = (_u, config) => (config?.params?.before ? new Promise(r => { resolveBefore = r; }) : around(40, 60));
            mockGet.mockImplementation((url: string, config?: GetConfig) => {
                if (url === '/api/v1/user') return Promise.resolve({ data: { telephon: '111' } });
                if (url.startsWith('/api/v1/chat/')) return Promise.resolve(chatHandler(url, config));
                return Promise.resolve({ data: null });
            });
            await mount();
            await act(async () => { await ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 50); });
            mockGet.mockClear();

            let first: Promise<void> = Promise.resolve();
            await act(async () => {
                first = ctx!.loadOlderFocused({ kind: 'chat', key: 'B' });
                void ctx!.loadOlderFocused({ kind: 'chat', key: 'B' });
            });
            expect(mockGet).toHaveBeenCalledTimes(1);
            expect(fc().loadingOlder).toBe(true);
            await act(async () => { resolveBefore({ data: [], headers: {} }); await first; });
            expect(ctx!.focusedChat['B']).toMatchObject({ loadingOlder: false, hasMoreOlder: false });

            mockGet.mockClear();
            await act(async () => { await ctx!.loadOlderFocused({ kind: 'chat', key: 'B' }); });
            expect(mockGet).not.toHaveBeenCalled();
        });

        it('loadNewerFocused requests after=newest and appends', async () => {
            chatHandler = (_u, config) => (config?.params?.after
                ? { data: range(61, 70).map(chatMsg), headers: { 'x-has-more-newer': 'false' } }
                : around(40, 60));
            await mount();
            await act(async () => { await ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 50); });

            await act(async () => { await ctx!.loadNewerFocused({ kind: 'chat', key: 'B' }); });

            expect(mockGet).toHaveBeenLastCalledWith('/api/v1/chat/B', { params: { after: 60, limit: 50 } });
            expect(ids(fc().messages)).toEqual(range(40, 70));
            expect(ctx!.focusedChat['B']).toMatchObject({ hasMoreNewer: false, loadingNewer: false });
        });

        it('a failed loadOlderFocused clears loading and keeps the window', async () => {
            chatHandler = (_u, config) => {
                if (config?.params?.before) throw new Error('boom');
                return around(40, 60);
            };
            mockGet.mockImplementation((url: string, config?: GetConfig) => {
                if (url === '/api/v1/user') return Promise.resolve({ data: { telephon: '111' } });
                if (!url.startsWith('/api/v1/chat/')) return Promise.resolve({ data: null });
                try { return Promise.resolve(chatHandler(url, config)); } catch (e) { return Promise.reject(e); }
            });
            await mount();
            await act(async () => { await ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 50); });
            await act(async () => { await ctx!.loadOlderFocused({ kind: 'chat', key: 'B' }); });

            expect(ctx!.focusedChat['B']).toMatchObject({ loadingOlder: false, hasMoreOlder: true });
            expect(ids(fc().messages)).toEqual(range(40, 60));
        });

        it('returnToLatest drops the window and discards an in-flight open', async () => {
            let resolveAround: (v: unknown) => void = () => {};
            mockGet.mockImplementation((url: string) => {
                if (url === '/api/v1/user') return Promise.resolve({ data: { telephon: '111' } });
                if (url.startsWith('/api/v1/chat/')) return new Promise(r => { resolveAround = r; });
                return Promise.resolve({ data: null });
            });
            await mount();
            let pending: Promise<boolean> = Promise.resolve(false);
            await act(async () => { pending = ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 50); });
            act(() => { ctx!.returnToLatest({ kind: 'chat', key: 'B' }); });
            await act(async () => { resolveAround(around(40, 60)); await pending; });

            expect(ctx!.focusedChat['B']).toBeUndefined();
        });

        it('the latest openMessageAt wins over an older, slower one', async () => {
            const resolvers: Array<(v: unknown) => void> = [];
            mockGet.mockImplementation((url: string) => {
                if (url === '/api/v1/user') return Promise.resolve({ data: { telephon: '111' } });
                if (url.startsWith('/api/v1/chat/')) return new Promise(r => { resolvers.push(r); });
                return Promise.resolve({ data: null });
            });
            await mount();
            let first: Promise<boolean> = Promise.resolve(false);
            let second: Promise<boolean> = Promise.resolve(false);
            await act(async () => {
                first = ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 50);
                second = ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 5);
            });
            await act(async () => { resolvers[1]?.(around(1, 10)); await second; });
            await act(async () => { resolvers[0]?.(around(40, 60)); await first; });

            expect(fc().targetId).toBe(5);
            expect(ids(fc().messages)).toEqual(range(1, 10));
        });

        it('live messages go to the normal list only; the detached window is not touched', async () => {
            chatHandler = (url, config) => (config?.params?.around ? around(40, 60) : { data: [chatMsg(100)], headers: { 'x-has-more': 'false' } });
            await mount();
            await act(async () => { await ctx!.fetchChatMessages('B'); });
            await act(async () => { await ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 50); });
            const windowBefore = ctx!.focusedChat['B'];

            act(() => { handlerFor<Message>('message')(chatMsg(101)); });

            expect(ids(ctx!.messagesByChat['B'])).toEqual([100, 101]);
            expect(ctx!.focusedChat['B']).toBe(windowBefore);
        });

        it('sending a message while detached returns to the latest so the user sees it', async () => {
            chatHandler = () => around(40, 60);
            await mount();
            await act(async () => { await ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 50); });

            act(() => { handlerFor<Message>('message')({ ...chatMsg(500), senderTelephon: 'B' }); });
            expect(ctx!.focusedChat['B']).toBeDefined();

            act(() => { handlerFor<Message>('message')({ ...chatMsg(501), senderTelephon: '111', receptor: 'B' }); });
            expect(ctx!.focusedChat['B']).toBeUndefined();
            expect(ids(ctx!.messagesByChat['B'])).toContain(501);
        });

        it('edits, deletions and status changes reach the detached window too', async () => {
            const mine = (id: number, status: Message['status']): Message => ({ ...chatMsg(id), senderTelephon: '111', receptor: 'B', status: status });
            chatHandler = () => ({ data: [chatMsg(41), mine(42, 'enviado'), mine(43, 'entregado')], headers: {} });
            await mount();
            await act(async () => { await ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 41); });

            act(() => { handlerFor<Message>('edit_message')({ ...chatMsg(41), message: 'editado' }); });
            expect(fc().messages[0]).toMatchObject({ message: 'editado', edited: true });

            act(() => { handlerFor<{ from: string }>('read')({ from: 'B' }); });
            expect(fc().messages.filter(m => m.receptor === 'B').map(m => m.status)).toEqual(['visto', 'visto']);

            act(() => { handlerFor<Message>('delete_message')(chatMsg(43)); });
            expect(ids(fc().messages)).toEqual([41, 42]);
        });

        it('leaving the chat drops its detached window', async () => {
            chatHandler = () => around(40, 60);
            await mount();
            act(() => { ctx!.setSelected({ ...contact('B'), telephon: 'B' } as never); });
            await act(async () => { await ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 50); });
            expect(ctx!.focusedChat['B']).toBeDefined();

            act(() => { ctx!.setSelected({ ...contact('C'), telephon: 'C' } as never); });

            expect(ctx!.focusedChat['B']).toBeUndefined();
        });
    });

    describe('1:1 chat: window races (controllable promises)', () => {
        type Held = { params: Record<string, number>; resolve: (v: unknown) => void; reject: (e: unknown) => void };
        let holding: boolean;
        let held: Held[];
        const heldFor = (key: 'around' | 'before' | 'after'): Held => {
            const h = held.find(x => x.params[key] !== undefined);
            if (!h) throw new Error(`no held ${key} request`);
            return h;
        };

        beforeEach(() => {
            holding = false;
            held = [];
            mockGet.mockImplementation((url: string, config?: GetConfig) => {
                if (url === '/api/v1/user') return Promise.resolve({ data: { telephon: '111' } });
                if (!url.startsWith('/api/v1/chat/')) return Promise.resolve({ data: null });
                if (!holding) return Promise.resolve(around(40, 60));
                return new Promise((resolve, reject) => { held.push({ params: config?.params ?? {}, resolve, reject }); });
            });
        });

        const openInitial = async () => {
            await mount();
            await act(async () => { await ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 50); });
            holding = true;
        };
        const B = { kind: 'chat', key: 'B' } as const;
        const older = { data: range(30, 39).map(chatMsg), headers: { 'x-has-more': 'true' } };
        const newer = { data: range(61, 70).map(chatMsg), headers: { 'x-has-more-newer': 'true' } };

        it('a loadOlder started while a replacing open is in flight cannot merge into the replacement window', async () => {
            await openInitial();
            let open: Promise<boolean> = Promise.resolve(false);
            let load: Promise<void> = Promise.resolve();
            await act(async () => {
                open = ctx!.openMessageAt(B, 5);
                load = ctx!.loadOlderFocused(B);
            });
            await act(async () => { heldFor('around').resolve(around(1, 10, { older: false })); await open; });
            await act(async () => { heldFor('before').resolve(older); await load; });

            expect(ids(fc().messages)).toEqual(range(1, 10));
            expect(ctx!.focusedChat['B']).toMatchObject({ targetId: 5, hasMoreOlder: false, loadingOlder: false });
        });

        it('a loadNewer started while a replacing open is in flight cannot merge into the replacement window', async () => {
            await openInitial();
            let open: Promise<boolean> = Promise.resolve(false);
            let load: Promise<void> = Promise.resolve();
            await act(async () => {
                open = ctx!.openMessageAt(B, 5);
                load = ctx!.loadNewerFocused(B);
            });
            await act(async () => { heldFor('around').resolve(around(1, 10)); await open; });
            await act(async () => { heldFor('after').resolve(newer); await load; });

            expect(ids(fc().messages)).toEqual(range(1, 10));
            expect(ctx!.focusedChat['B']).toMatchObject({ hasMoreNewer: true, loadingNewer: false });
        });

        it('a failed open (404) leaves the original window usable and its in-flight loadOlder still clears loading', async () => {
            await openInitial();
            let open: Promise<boolean> = Promise.resolve(true);
            let load: Promise<void> = Promise.resolve();
            await act(async () => {
                load = ctx!.loadOlderFocused(B);
                open = ctx!.openMessageAt(B, 5);
            });
            await act(async () => { heldFor('around').reject(httpError(404)); await open; });
            await act(async () => { heldFor('before').resolve(older); await load; });

            expect(ids(fc().messages)).toEqual(range(30, 60));
            expect(ctx!.focusedChat['B']).toMatchObject({ loadingOlder: false, targetId: 50 });
        });

        it('a failed open (500) with a failing in-flight loadNewer does not leave loadingNewer stuck', async () => {
            await openInitial();
            let open: Promise<boolean> = Promise.resolve(true);
            let load: Promise<void> = Promise.resolve();
            await act(async () => {
                load = ctx!.loadNewerFocused(B);
                open = ctx!.openMessageAt(B, 5);
            });
            await act(async () => { heldFor('around').reject(httpError(500)); await open; });
            await act(async () => { heldFor('after').reject(new Error('boom')); await load; });

            expect(ctx!.focusedChat['B']).toMatchObject({ loadingNewer: false });
            expect(ids(fc().messages)).toEqual(range(40, 60));
        });

        it('a target missing from the server window keeps the original window and clears its loading flags', async () => {
            await openInitial();
            let open: Promise<boolean> = Promise.resolve(true);
            let load: Promise<void> = Promise.resolve();
            await act(async () => {
                load = ctx!.loadOlderFocused(B);
                open = ctx!.openMessageAt(B, 999);
            });
            await act(async () => { heldFor('around').resolve(around(1, 10)); await open; });
            await act(async () => { heldFor('before').resolve(older); await load; });

            expect(ids(fc().messages)).toEqual(range(30, 60));
            expect(ctx!.focusedChat['B']).toMatchObject({ loadingOlder: false });
        });

        it('refocusing inside the window supersedes a pending out-of-window open', async () => {
            await openInitial();
            let open: Promise<boolean> = Promise.resolve(true);
            await act(async () => { open = ctx!.openMessageAt(B, 5); });
            await act(async () => { await ctx!.openMessageAt(B, 45); });
            expect(ctx!.focusedChat['B']).toMatchObject({ targetId: 45 });

            let landed = true;
            await act(async () => { heldFor('around').resolve(around(1, 10)); landed = await open; });

            expect(landed).toBe(false);
            expect(ctx!.focusedChat['B']).toMatchObject({ targetId: 45 });
            expect(ids(fc().messages)).toEqual(range(40, 60));
        });
    });

    describe('group', () => {
        const groupAround = (from: number, to: number, flags: { older?: boolean; newer?: boolean } = {}) => ({
            data: { messages: range(from, to).map(groupMsg), hasMoreOlder: flags.older ?? true, hasMoreNewer: flags.newer ?? true },
        });

        it('openMessageAt loads focusedGroup and leaves groupMessages alone', async () => {
            groupHandler = () => groupAround(40, 60);
            await mount();
            await act(async () => { await ctx!.fetchGroupMessages(9); });
            const before = ctx!.groupMessages[9];

            let ok = false;
            await act(async () => { ok = await ctx!.openMessageAt({ kind: 'group', id: 9 }, 50); });

            expect(ok).toBe(true);
            expect(mockGet).toHaveBeenCalledWith('/api/v1/group/9/message', { params: { around: 50, limit: 50 } });
            expect(ids(fg().messages)).toEqual(range(40, 60));
            expect(ctx!.focusedGroup[9]).toMatchObject({ targetId: 50, hasMoreOlder: true, hasMoreNewer: true });
            expect(ctx!.groupMessages[9]).toBe(before);
        });

        it('loadOlderFocused / loadNewerFocused page through the group endpoint', async () => {
            groupHandler = (config) => {
                if (config?.params?.before) return { data: { messages: range(30, 39).reverse().map(groupMsg), hasMore: false } };
                if (config?.params?.after) return { data: { messages: range(61, 65).map(groupMsg), hasMoreNewer: false } };
                return groupAround(40, 60);
            };
            await mount();
            await act(async () => { await ctx!.openMessageAt({ kind: 'group', id: 9 }, 50); });

            await act(async () => { await ctx!.loadOlderFocused({ kind: 'group', id: 9 }); });
            expect(mockGet).toHaveBeenLastCalledWith('/api/v1/group/9/message', { params: { before: 40, limit: 50, offset: 0 } });
            await act(async () => { await ctx!.loadNewerFocused({ kind: 'group', id: 9 }); });
            expect(mockGet).toHaveBeenLastCalledWith('/api/v1/group/9/message', { params: { after: 60, limit: 50 } });

            expect(ids(fg().messages)).toEqual(range(30, 65));
            expect(ctx!.focusedGroup[9]).toMatchObject({ hasMoreOlder: false, hasMoreNewer: false });
        });

        it('races: an old-window page cannot merge into a replacement; a failed open keeps loading flags clean; refocus supersedes a pending open', async () => {
            type Held = { params: Record<string, number>; resolve: (v: unknown) => void; reject: (e: unknown) => void };
            const held: Held[] = [];
            let holding = false;
            mockGet.mockImplementation((url: string, config?: GetConfig) => {
                if (url === '/api/v1/user') return Promise.resolve({ data: { telephon: '111' } });
                if (url !== '/api/v1/group/9/message') return Promise.resolve({ data: null });
                if (!holding) return Promise.resolve(groupAround(40, 60));
                return new Promise((resolve, reject) => { held.push({ params: config?.params ?? {}, resolve, reject }); });
            });
            const heldFor = (key: string): Held => {
                const h = held.find(x => x.params[key] !== undefined);
                if (!h) throw new Error(`no held ${key} request`);
                return h;
            };
            const G = { kind: 'group', id: 9 } as const;
            await mount();
            await act(async () => { await ctx!.openMessageAt(G, 50); });
            holding = true;

            // (a) replacement wins over an old-window page
            let open: Promise<boolean> = Promise.resolve(false);
            let load: Promise<void> = Promise.resolve();
            await act(async () => { open = ctx!.openMessageAt(G, 5); load = ctx!.loadOlderFocused(G); });
            await act(async () => { heldFor('around').resolve(groupAround(1, 10, { older: false })); await open; });
            await act(async () => { heldFor('before').resolve({ data: { messages: range(30, 39).reverse().map(groupMsg), hasMore: true } }); await load; });
            expect(ids(fg().messages)).toEqual(range(1, 10));
            expect(ctx!.focusedGroup[9]).toMatchObject({ loadingOlder: false, hasMoreOlder: false });

            // (b) a failed open keeps the window and its loading flags clean
            held.length = 0;
            await act(async () => { load = ctx!.loadNewerFocused(G); open = ctx!.openMessageAt(G, 999); });
            await act(async () => { heldFor('around').reject(httpError(404)); await open; });
            await act(async () => { heldFor('after').reject(new Error('boom')); await load; });
            expect(ctx!.focusedGroup[9]).toMatchObject({ loadingNewer: false });
            expect(ids(fg().messages)).toEqual(range(1, 10));

            // (c) refocusing inside the window supersedes a pending open
            held.length = 0;
            await act(async () => { open = ctx!.openMessageAt(G, 500); });
            await act(async () => { await ctx!.openMessageAt(G, 3); });
            await act(async () => { heldFor('around').resolve(groupAround(490, 510)); await open; });
            expect(ctx!.focusedGroup[9]).toMatchObject({ targetId: 3 });
            expect(ids(fg().messages)).toEqual(range(1, 10));
        });

        it('403 / 404 toast and open nothing; returnToLatest clears', async () => {
            mockGet.mockImplementation((url: string) => (
                url === '/api/v1/group/9/message' ? Promise.reject(httpError(403)) : Promise.resolve({ data: null })
            ));
            await mount();
            let ok = true;
            await act(async () => { ok = await ctx!.openMessageAt({ kind: 'group', id: 9 }, 5); });
            expect(ok).toBe(false);
            expect(ctx!.focusedGroup[9]).toBeUndefined();

            mockGet.mockImplementation(() => Promise.resolve({ data: null }));
            groupHandler = () => groupAround(1, 10);
            mockGet.mockImplementation((url: string, config?: GetConfig) => (
                url === '/api/v1/group/9/message' ? Promise.resolve(groupHandler(config)) : Promise.resolve({ data: null })
            ));
            await act(async () => { await ctx!.openMessageAt({ kind: 'group', id: 9 }, 5); });
            expect(ctx!.focusedGroup[9]).toBeDefined();
            act(() => { ctx!.returnToLatest({ kind: 'group', id: 9 }); });
            expect(ctx!.focusedGroup[9]).toBeUndefined();
        });

        it('sending a group message while detached returns to the latest', async () => {
            groupHandler = () => groupAround(40, 60);
            await mount();
            await act(async () => { await ctx!.openMessageAt({ kind: 'group', id: 9 }, 50); });

            act(() => { handlerFor<GroupMessageResponse>('group_chat')(groupMsg(500)); });
            expect(ctx!.focusedGroup[9]).toBeDefined();

            act(() => { handlerFor<GroupMessageResponse>('group_chat')({ ...groupMsg(501), SenderTelephon: '111' }); });
            expect(ctx!.focusedGroup[9]).toBeUndefined();
        });

        it('group edits and deletions reach the detached window', async () => {
            groupHandler = () => groupAround(40, 42);
            await mount();
            await act(async () => { await ctx!.openMessageAt({ kind: 'group', id: 9 }, 41); });

            act(() => { handlerFor<GroupMessageResponse>('group_edit_message')({ ...groupMsg(41), Message: 'editado' }); });
            expect(fg().messages[1]).toMatchObject({ Message: 'editado', Edited: true });

            act(() => { handlerFor<GroupMessageResponse>('group_delete_message')(groupMsg(42)); });
            expect(ids(fg().messages)).toEqual([40, 41]);
        });
    });
});
