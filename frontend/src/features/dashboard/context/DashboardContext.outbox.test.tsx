// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DashboardProvider, useDashboard, type DashboardContextValue } from './DashboardContext';
import { createOutboxStore } from '../../outbox/outboxStore';
import type { GroupMessageResponse, Message } from '../../../types/api';

// PW9: DashboardContext wires the offline outbox: text sends get a clientID and are
// queued while the socket is closed (shown as pending), the sender's echo is
// reconciled by ClientID (never twice), a possibly-replayed ack reloads history
// instead of being inserted (a since-deleted message is not resurrected), a
// permanent WS error marks the message failed, and logout clears the queue.

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

const socket = { open: false };
const mockSendMessage = vi.fn((..._args: unknown[]) => socket.open);
const mockSendGroupMessage = vi.fn((..._args: unknown[]) => socket.open);
vi.mock('../../../api/websocket', () => ({
    default: {
        isConnected: () => socket.open,
        sendMessage: (...args: unknown[]) => mockSendMessage(...args),
        sendGroupMessage: (...args: unknown[]) => mockSendGroupMessage(...args),
        sendReaction: vi.fn(() => true),
    },
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
function Harness({ tick, onReady }: { tick: number; onReady: (value: DashboardContextValue) => void }) {
    const dash = useDashboard();
    onReady(dash);
    return <span data-tick={tick} />;
}

const CID = '0b7f3c1e-2d4a-4f6b-9c8d-1a2b3c4d5e6f';
const iso = (n: number) => new Date(Date.UTC(2024, 0, 1, 0, 0, n)).toISOString();
const echo = (id: number, clientID: string | undefined, over: Partial<Message> = {}): Message => ({
    MessageID: id, SenderTelephon: '111', Receptor: '222', Message: 'hola', Status: 'enviado', Time: iso(id), Edited: false,
    ...(clientID ? { ClientID: clientID } : {}), ...over,
});
const groupEcho = (id: number, clientID: string): GroupMessageResponse => ({
    MessageID: id, GroupID: 9, SenderTelephon: '111', SenderUsername: 'ana', Message: 'hola grupo', Time: iso(id), Edited: false,
    ClientID: clientID,
});

let container: HTMLDivElement;
let root: Root;
let tick = 0;

const render = async () => {
    tick += 1;
    await act(async () => {
        root.render(<DashboardProvider><Harness tick={tick} onReady={capture} /></DashboardProvider>);
    });
    // Let the initial/reconnect fetches (chats, groups) land before the test emits events.
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
};
const setConnected = async (value: boolean) => {
    socket.open = value;
    stableWs.isConnected = value;
    await render();
};
const emit = async (event: string, payload: unknown) => {
    const handler = handlers.get(event);
    if (!handler) throw new Error(`no handler registered for ${event}`);
    await act(async () => { handler(payload); });
};
const settle = async (check: () => void) => {
    await act(async () => { await vi.waitFor(check); });
};

beforeEach(async () => {
    mockGet.mockImplementation((url: string) => {
        if (url === '/api/v1/user') return Promise.resolve({ data: { Telephon: '111', Username: 'ana' } });
        return Promise.resolve({ data: url === '/api/v1/chats' || url === '/api/v1/contact' ? [] : null, headers: {} });
    });
    mockGetUserGroups.mockResolvedValue({ data: [] });
    mockGetGroupMessages.mockResolvedValue({ data: [] });
    mockGetGroupDetail.mockResolvedValue({ data: null });
    socket.open = false;
    stableWs.isConnected = false;
    handlers.clear();
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

describe('DashboardContext outbox wiring', () => {
    it('pins existing reconciliation: the same echo (same MessageID) is inserted once', async () => {
        await setConnected(true);
        await emit('message', echo(5, undefined));
        await emit('message', echo(5, undefined));
        expect(latest.messagesByChat['222']?.map(m => m.MessageID)).toEqual([5]);
    });

    it('online text send goes straight to the socket with a clientID and queues nothing', async () => {
        await setConnected(true);
        await act(async () => { await latest.sendText({ kind: 'direct', target: '222', text: 'hola', replyTo: null }); });

        expect(mockSendMessage).toHaveBeenCalledWith('222', 'hola', null, null, expect.stringMatching(/^[0-9a-f-]{36}$/));
        expect(latest.outboxItems).toEqual([]);
    });

    it('queues a text sent while disconnected (pending), flushes it on connect and reconciles the echo once by ClientID', async () => {
        await render();
        await act(async () => { await latest.sendText({ kind: 'direct', target: '222', text: 'hola', replyTo: null }); });
        expect(latest.outboxItems).toEqual([{ state: 'pending', entry: expect.objectContaining({ kind: 'direct', target: '222', text: 'hola' }) }]);
        expect(mockSendMessage).not.toHaveBeenCalled();
        const clientID = latest.outboxItems[0]!.entry.clientID;

        await setConnected(true);
        await settle(() => expect(mockSendMessage).toHaveBeenCalledWith('222', 'hola', null, null, clientID));

        await emit('message', echo(7, clientID));
        await emit('message', echo(7, clientID));
        expect(latest.outboxItems).toEqual([]);
        expect(latest.messagesByChat['222']?.map(m => m.MessageID)).toEqual([7]);
    });

    it('a possibly-replayed ack (second attempt) is not inserted: the chat is reloaded from history instead', async () => {
        const store = createOutboxStore();
        await store.put('111', { clientID: CID, kind: 'direct', target: '222', text: 'borrado', replyTo: null, createdAt: 1, attempts: 1 });
        store.close();

        await setConnected(true);
        await settle(() => expect(mockSendMessage).toHaveBeenCalledWith('222', 'borrado', null, null, CID));
        mockGet.mockClear();

        await emit('message', echo(3, CID, { Message: 'borrado' }));

        expect(latest.messagesByChat['222'] ?? []).toEqual([]);
        expect(latest.outboxItems).toEqual([]);
        expect(mockGet).toHaveBeenCalledWith('/api/v1/chat/222');
    });

    it('group: queued offline, flushed on connect, echo reconciled once; a replay reloads the group', async () => {
        await render();
        await act(async () => { await latest.sendText({ kind: 'group', target: 9, text: 'hola grupo', replyTo: null }); });
        const clientID = latest.outboxItems[0]!.entry.clientID;

        await setConnected(true);
        await settle(() => expect(mockSendGroupMessage).toHaveBeenCalledWith(9, 'hola grupo', null, null, clientID));
        await emit('group_chat', groupEcho(11, clientID));
        await emit('group_chat', groupEcho(11, clientID));
        expect(latest.groupMessages[9]?.map(m => m.MessageID)).toEqual([11]);
        expect(latest.outboxItems).toEqual([]);
    });

    it('group replayed ack reloads the group instead of inserting', async () => {
        const store = createOutboxStore();
        await store.put('111', { clientID: CID, kind: 'group', target: 9, text: 'x', replyTo: null, createdAt: 1, attempts: 1 });
        store.close();
        await setConnected(true);
        await settle(() => expect(mockSendGroupMessage).toHaveBeenCalled());
        mockGetGroupMessages.mockClear();

        await emit('group_chat', groupEcho(12, CID));

        expect(latest.groupMessages[9] ?? []).toEqual([]);
        expect(mockGetGroupMessages).toHaveBeenCalledWith(9);
    });

    it('a permanent WS error for the message in flight marks it failed', async () => {
        await render();
        await act(async () => { await latest.sendText({ kind: 'direct', target: '222', text: 'x', replyTo: null }); });
        await setConnected(true);
        await settle(() => expect(mockSendMessage).toHaveBeenCalled());

        await emit('error', { type: 'error', error: 'Error al enviar mensaje: clientID ya usado en otra conversación' });

        await settle(() => expect(latest.outboxItems.map(i => i.state)).toEqual(['failed']));
    });

    it('logout clears the stored outbox of the user and then logs out', async () => {
        await render();
        await act(async () => { await latest.sendText({ kind: 'direct', target: '222', text: 'x', replyTo: null }); });

        await act(async () => { await latest.logout(); });

        expect(stableLogout).toHaveBeenCalledTimes(1);
        const store = createOutboxStore();
        expect(await store.list('111')).toEqual([]);
        store.close();
    });

    it('rehydrates stored entries on start as pending items', async () => {
        const store = createOutboxStore();
        await store.put('111', { clientID: CID, kind: 'direct', target: '222', text: 'guardado', replyTo: null, createdAt: 1, attempts: 0 });
        store.close();

        await render();
        await settle(() => expect(latest.outboxItems.map(i => [i.state, i.entry.clientID])).toEqual([['pending', CID]]));
    });
});
