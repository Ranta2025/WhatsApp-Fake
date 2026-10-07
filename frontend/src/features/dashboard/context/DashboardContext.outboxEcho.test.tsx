// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DashboardProvider, useDashboard, type DashboardContextValue } from './DashboardContext';
import { createOutboxStore } from '../../outbox/outboxStore';
import type { Message } from '../../../types/api';

// fix/outbox-sender-echo RED reproduction (context level):
// A live sender echo (MessageID 101) inserted by the WS `message` handler is
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
const chatMsg = (id: number): Message => ({
    MessageID: id, SenderTelephon: 'B', Receptor: '111', Message: `m${id}`, Status: 'visto', Time: iso(id), Edited: false,
});
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const ids = (list: ReadonlyArray<{ MessageID: number | string }> | undefined) => (list ?? []).map(m => m.MessageID);

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
        if (url === '/api/v1/user') return Promise.resolve({ data: { Telephon: '111', Username: 'ana' } });
        if (url === '/api/v1/chats') {
            // Held pending: released with a stale, short window (11 msgs => hasMore=false).
            return new Promise((resolve) => {
                releaseChats = () => resolve({
                    data: [{
                        ContactTelephon: '222', ContactUsername: 'bea', ContactName: 'Bea', ContactAvatarUrl: '',
                        IsContact: true, Messages: range(90, 100).map(chatMsg),
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
            MessageID: 101, SenderTelephon: '111', Receptor: '222', Message: 'echo', Status: 'enviado', Time: iso(101), Edited: false,
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
});
