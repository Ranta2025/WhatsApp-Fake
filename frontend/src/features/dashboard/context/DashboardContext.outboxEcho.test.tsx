// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DashboardProvider, useDashboard, type DashboardContextValue } from './DashboardContext';
import { createOutboxStore } from '../../outbox/outboxStore';
import type { Message } from '../../../types/api';

// fix/outbox-sender-echo RED reproduction (context level):
// A live sender echo (messageID 101) inserted by the WS `message` handler is
// dropped when a stale /api/v1/chats refetch resolves afterwards with a short
// window (90..100). `fetchAllChats` derives hasMore from `fresh.length >= 200`,
// so an 11-message window is treated as the complete history and
// `mergeLatestWindow(prev, fresh, false)` keeps only ids older than 90 — wiping
// the newer live echo. The UI then shows the sent text nowhere until a reload.

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

type Handler = (payload: unknown) => void;
const handlers = new Map<string, Handler>();
const stableUser = { username: 'ana', telephon: '111', avatar: '' };
const stableLogout = vi.fn(() => Promise.resolve());
const stableWs = {
    isConnected: false,
    connectionState: 'disconnected' as const,
    on: vi.fn((event: string, handler: Handler) => { handlers.set(event, handler); }),
    off: vi.fn((event: string, handler: Handler) => { if (handlers.get(event) === handler) handlers.delete(event); }),
    sendMessage: vi.fn(), sendReadConfirmation: vi.fn(), sendTypingIndicator: vi.fn(),
    sendGroupMessage: vi.fn(), sendGroupTyping: vi.fn(), sendGroupEditMessage: vi.fn(),
    sendGroupDeleteMessage: vi.fn(), sendGroupJoin: vi.fn(),
    sendGroupDelivered: vi.fn(() => true), sendGroupRead: vi.fn(() => true),
};
vi.mock('../../../context/AuthContext', () => ({
    useAuth: () => ({ user: stableUser, logout: stableLogout }),
}));
vi.mock('../../../hooks/useWebSocket', () => ({
    useWebSocket: () => ({ ...stableWs }),
}));

let latest: DashboardContextValue;
const capture = (value: DashboardContextValue) => { latest = value; };
function Harness({ onReady }: { onReady: (value: DashboardContextValue) => void }) {
    const dash = useDashboard();
    onReady(dash);
    return null;
}

const iso = (n: number) => new Date(Date.UTC(2024, 0, 1, 0, 1, n)).toISOString();
const CID = '0b7f3c1e-2d4a-4f6b-9c8d-1a2b3c4d5e6f';
const chatMsg = (id: number): Message => ({
    messageID: id, senderTelephon: 'B', receptor: '111', message: `m${id}`, status: 'visto', time: iso(id), edited: false,
});
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const ids = (list: ReadonlyArray<{ messageID?: number | string }> | undefined) => (list ?? []).map(m => m.messageID);

let container: HTMLDivElement;
let root: Root;
let releaseChats: (() => void) | undefined;

const render = async () => {
    await act(async () => {
        root.render(<DashboardProvider><Harness onReady={capture} /></DashboardProvider>);
    });
    // Let fetchProfile (owner telephon) settle while /api/v1/chats stays pending.
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
};
const emit = async (event: string, payload: unknown) => {
    const handler = handlers.get(event);
    if (!handler) throw new Error(`no handler registered for ${event}`);
    await act(async () => { handler(payload); });
};

beforeEach(async () => {
    mockGet.mockImplementation((url: string) => {
        if (url === '/api/v1/user') return Promise.resolve({ data: { telephon: '111', username: 'ana' } });
        if (url === '/api/v1/chats') {
            // Held pending: released with a stale, short window (11 msgs => hasMore=false).
            return new Promise((resolve) => {
                releaseChats = () => resolve({
                    data: [{
                        contactTelephon: '222', contactUsername: 'bea', contactName: 'Bea', contactAvatarUrl: '',
                        isContact: true, messages: range(90, 100).map(chatMsg),
                    }],
                });
            });
        }
        if (url === '/api/v1/contact') return Promise.resolve({ data: [] });
        return Promise.resolve({ data: null, headers: {} });
    });
    mockGetUserGroups.mockResolvedValue({ data: [] });
    mockGetGroupMessages.mockResolvedValue({ data: [] });
    mockGetGroupDetail.mockResolvedValue({ data: null });
    stableWs.isConnected = false;
    handlers.clear();
    releaseChats = undefined;
    const store = createOutboxStore();
    await store.clear('111');
    store.close();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
});

describe('DashboardContext sender echo vs stale full-history window', () => {
    it('keeps the live sender echo 101 when a stale short /api/v1/chats window resolves', async () => {
        stableWs.isConnected = true;
        await render();

        // The sender's own echo (111 -> 222) arrives live and is inserted.
        await emit('message', {
            messageID: 101, senderTelephon: '111', receptor: '222', message: 'echo', status: 'enviado', time: iso(101), edited: false,
        });
        expect(ids(latest.messagesByChat['222'])).toContain(101);

        // Stale refetch resolves afterwards without 101 (ids 90..100).
        await act(async () => {
            releaseChats?.();
            await new Promise(r => setTimeout(r, 0));
        });

        // RED: the live echo must survive the stale window; current code drops it.
        expect(ids(latest.messagesByChat['222'])).toContain(101);
    });

    it('replayed ack appends the echoed frame (pending clears) even when the history reload fails', async () => {
        const store = createOutboxStore();
        // Rehydrated-after-reload entry: attempts already >= 1, so the ack of the
        // resend is classified `replayed` (may be a server replay, reload history).
        await store.put('111', { clientID: CID, kind: 'direct', target: '222', text: 'eco', replyTo: null, createdAt: 1, attempts: 2 });
        store.close();

        // The history reload for the replayed ack fails: only the echoed frame
        // itself can put 101 on screen.
        mockGet.mockImplementation((url: string) => {
            if (url === '/api/v1/user') return Promise.resolve({ data: { telephon: '111', username: 'ana' } });
            if (url === '/api/v1/chats') return Promise.resolve({ data: [], headers: {} });
            if (url === '/api/v1/chat/222') return Promise.reject(new Error('history down'));
            if (url === '/api/v1/contact') return Promise.resolve({ data: [] });
            return Promise.resolve({ data: null, headers: {} });
        });

        stableWs.isConnected = true;
        await render();
        await act(async () => { await vi.waitFor(() => expect(latest.outboxItems.map(i => i.entry.clientID)).toEqual([CID])); });

        await emit('message', {
            messageID: 101, senderTelephon: '111', receptor: '222', message: 'eco', status: 'enviado', time: iso(101), edited: false, clientID: CID,
        });

        // RED: the replayed branch only reloaded; the echo was never appended.
        expect(ids(latest.messagesByChat['222'])).toContain(101);
        expect(latest.outboxItems).toEqual([]);
        // Server truth is still requested.
        expect(mockGet).toHaveBeenCalledWith('/api/v1/chat/222');
    });
});
