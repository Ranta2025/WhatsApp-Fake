// @vitest-environment jsdom
import { describe, it, expect, expectTypeOf, vi, beforeEach, afterEach } from 'vitest';
import type { WsHandlerMap } from './websocket';

// R3-websocket-dispatch-untested: la clase WebSocketManager remapea algunos
// eventos de red antes de notificar a los listeners (chat -> 'message',
// error -> envelope completo, contacts_online -> array plano). Estos tests
// prueban ese remapeo real conduciendo la instancia singleton a través de un
// WebSocket falso, en vez de asumir el comportamiento por lectura del código.

vi.mock('./axios', () => ({
    default: {
        get: vi.fn(() => Promise.resolve({ data: { ticket: 'test-ticket' } })),
    },
}));

class FakeWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    static instances: FakeWebSocket[] = [];

    readyState = FakeWebSocket.OPEN;
    onopen: (() => void) | null = null;
    onclose: ((event: { code: number; reason: string }) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    sent: string[] = [];
    url: string;

    constructor(url: string) {
        this.url = url;
        FakeWebSocket.instances.push(this);
    }

    send(data: string): void {
        this.sent.push(data);
    }

    close(): void {
        this.readyState = FakeWebSocket.CLOSED;
    }
}

async function connectAndOpen() {
    const { default: wsManager } = await import('./websocket');
    await wsManager.connect();
    const socket = FakeWebSocket.instances.at(-1);
    if (!socket) throw new Error('FakeWebSocket instance was not created by connect()');
    socket.onopen?.();
    return { wsManager, socket };
}

function emit(socket: FakeWebSocket, payload: unknown): void {
    socket.onmessage?.({ data: JSON.stringify(payload) });
}

describe('wsManager dispatch (remapped listener contract)', () => {
    beforeEach(() => {
        vi.resetModules();
        FakeWebSocket.instances = [];
        vi.stubGlobal('WebSocket', FakeWebSocket);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('remaps a "chat" wire event to the "message" listener', async () => {
        const { wsManager, socket } = await connectAndOpen();
        const handler = vi.fn();
        wsManager.on('message', handler);

        const message = {
            MessageID: 1,
            SenderTelephon: 'a',
            Receptor: 'b',
            Message: 'hi',
            Status: 'enviado',
            Time: 't',
            Edited: false,
        };
        emit(socket, { type: 'chat', payload: message });

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(message);
        wsManager.disconnect();
    });

    it('gives the "error" listener the full {type, error} envelope, not just the string', async () => {
        const { wsManager, socket } = await connectAndOpen();
        const handler = vi.fn();
        wsManager.on('error', handler);

        emit(socket, { type: 'error', error: 'boom' });

        expect(handler).toHaveBeenCalledWith({ type: 'error', error: 'boom' });
        wsManager.disconnect();
    });

    // R3-ws-error-envelope-normalization: el listener 'error' debe recibir
    // el envelope crudo tal cual llegó (todos los campos), no un objeto
    // reconstruido a mano que solo conserva `type`/`error`.
    it('passes extra fields on the error envelope through unchanged (no rebuilt object)', async () => {
        const { wsManager, socket } = await connectAndOpen();
        const handler = vi.fn();
        wsManager.on('error', handler);

        emit(socket, { type: 'error', error: 'boom', code: 'AUTH_FAILED', requestId: 42 });

        expect(handler).toHaveBeenCalledWith({ type: 'error', error: 'boom', code: 'AUTH_FAILED', requestId: 42 });
        wsManager.disconnect();
    });

    it('passes a non-string/missing "error" field through unchanged too', async () => {
        const { wsManager, socket } = await connectAndOpen();
        const handler = vi.fn();
        wsManager.on('error', handler);

        emit(socket, { type: 'error', error: 404, detail: 'not found' });

        expect(handler).toHaveBeenCalledWith({ type: 'error', error: 404, detail: 'not found' });
        wsManager.disconnect();
    });

    it('unwraps "contacts_online" to a bare string[] (not {contacts})', async () => {
        const { wsManager, socket } = await connectAndOpen();
        const handler = vi.fn();
        wsManager.on('contacts_online', handler);

        emit(socket, { type: 'contacts_online', payload: { contacts: ['111', '222'] } });

        expect(handler).toHaveBeenCalledWith(['111', '222']);
        wsManager.disconnect();
    });

    it('dispatches a status_* event straight through under its own type', async () => {
        const { wsManager, socket } = await connectAndOpen();
        const handler = vi.fn();
        wsManager.on('status_deleted', handler);

        emit(socket, { type: 'status_deleted', payload: { ownerTelephon: '111', statusId: 5 } });

        expect(handler).toHaveBeenCalledWith({ ownerTelephon: '111', statusId: 5 });
        wsManager.disconnect();
    });

    it('ignores malformed/unknown JSON without throwing and without notifying handlers', async () => {
        const { wsManager, socket } = await connectAndOpen();
        const handler = vi.fn();
        wsManager.on('message', handler);

        expect(() => emit(socket, 'not-an-object')).not.toThrow();
        expect(() => socket.onmessage?.({ data: '{not valid json' })).not.toThrow();
        expect(() => emit(socket, { no: 'type-field' })).not.toThrow();

        expect(handler).not.toHaveBeenCalled();
        wsManager.disconnect();
    });

    it('on() registers and off() unsubscribes a listener', async () => {
        const { wsManager, socket } = await connectAndOpen();
        const handler = vi.fn();
        wsManager.on('typing', handler);
        wsManager.off('typing', handler);

        emit(socket, { type: 'typing', payload: { from: '111' } });

        expect(handler).not.toHaveBeenCalled();
        wsManager.disconnect();
    });
});

// R3-ws-unauthorized-branch-untested: connect() pide un ticket vía axios
// antes de abrir el WebSocket; si esa petición falla con 401 la sesión
// caducó de verdad (no reintentar), y con cualquier otro error se agenda un
// reconnect con backoff. La rama 401 se detecta de forma ESTRUCTURAL
// (`error.response?.status === 401`, igual que el JS original) y no debe
// exigir que el error sea una instancia real de AxiosError.
describe('group receipt frames', () => {
    beforeEach(() => {
        vi.resetModules();
        FakeWebSocket.instances = [];
        vi.stubGlobal('WebSocket', FakeWebSocket);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('sendGroupDelivered / sendGroupRead emit the frames the backend router expects', async () => {
        const { wsManager, socket } = await connectAndOpen();

        expect(wsManager.sendGroupDelivered(7, 12)).toBe(true);
        expect(wsManager.sendGroupRead(7, 15)).toBe(true);

        expect(socket.sent.map((raw) => JSON.parse(raw) as unknown)).toEqual([
            { type: 'group_delivered', payload: { groupID: 7, messageID: 12 } },
            { type: 'group_read', payload: { groupID: 7, upToMessageID: 15 } },
        ]);
        wsManager.disconnect();
    });

    it('sendReaction emits the react frame (groupID only for group messages)', async () => {
        const { wsManager, socket } = await connectAndOpen();

        expect(wsManager.sendReaction('direct', 5, '👍')).toBe(true);
        expect(wsManager.sendReaction('group', 7, '', 9)).toBe(true);

        expect(socket.sent.map((raw) => JSON.parse(raw) as unknown)).toEqual([
            { type: 'react', payload: { kind: 'direct', messageID: 5, emoji: '👍' } },
            { type: 'react', payload: { kind: 'group', messageID: 7, groupID: 9, emoji: '' } },
        ]);
        wsManager.disconnect();
    });

    it('routes reaction pushes and the raw error envelope (with context) to their listeners', async () => {
        const { wsManager, socket } = await connectAndOpen();
        const onReaction = vi.fn();
        const onError = vi.fn();
        wsManager.on('reaction', onReaction);
        wsManager.on('error', onError);
        const payload = { kind: 'direct', messageID: 5, telephon: '+1', username: 'ana', emoji: '👍', previousEmoji: '', authorTelephon: '+2', preview: 'hi' };
        const error = { type: 'error', error: 'nope', context: { action: 'react', kind: 'direct', messageID: 5, status: 403 } };

        socket.onmessage?.({ data: JSON.stringify({ type: 'reaction', payload }) } as MessageEvent);
        socket.onmessage?.({ data: JSON.stringify(error) } as MessageEvent);

        expect(onReaction).toHaveBeenCalledWith(payload);
        expect(onError).toHaveBeenCalledWith(error);
        wsManager.disconnect();
    });

    it('does not send (and reports false) while disconnected', async () => {
        const { default: wsManager } = await import('./websocket');
        expect(wsManager.sendGroupDelivered(7, 12)).toBe(false);
        expect(wsManager.sendGroupRead(7, 12)).toBe(false);
    });

    it('routes group_receipt pushes to the group_receipt listener untouched', async () => {
        const { wsManager, socket } = await connectAndOpen();
        const handler = vi.fn();
        wsManager.on('group_receipt', handler);
        const payload = { groupID: 7, telephon: '+1', deliveredUpTo: 12, readUpTo: 9 };

        emit(socket, { type: 'group_receipt', payload });

        expect(handler).toHaveBeenCalledWith(payload);
        wsManager.disconnect();
    });
});

describe('wsManager.connect() failure paths', () => {
    beforeEach(() => {
        vi.resetModules();
        FakeWebSocket.instances = [];
        vi.stubGlobal('WebSocket', FakeWebSocket);
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('stops (no retry) and reports "unauthorized" on a structurally-401 error, even if it is not a real AxiosError', async () => {
        const axiosMock = await import('./axios');
        const getMock = vi.fn(() => Promise.reject({ response: { status: 401 } }));
        axiosMock.default.get = getMock as unknown as typeof axiosMock.default.get;

        const { default: wsManager } = await import('./websocket');
        const states: string[] = [];
        wsManager.onConnectionState((state) => states.push(state));

        await wsManager.connect();

        expect(states).toEqual(['unauthorized']);
        expect(FakeWebSocket.instances).toHaveLength(0);

        // Sesión caducada de verdad: no debe reintentar el ticket más tarde.
        await vi.advanceTimersByTimeAsync(30000);
        expect(getMock).toHaveBeenCalledTimes(1);
    });

    it('schedules a reconnect/backoff retry (no "unauthorized") on a non-401 ticket-fetch error', async () => {
        const axiosMock = await import('./axios');
        const getMock = vi.fn(() => Promise.reject(new Error('network down')));
        axiosMock.default.get = getMock as unknown as typeof axiosMock.default.get;

        const { default: wsManager } = await import('./websocket');
        const states: string[] = [];
        wsManager.onConnectionState((state) => states.push(state));

        await wsManager.connect();

        expect(states).toEqual([]);
        expect(getMock).toHaveBeenCalledTimes(1);

        // Primer backoff: reconnectDelay (1500ms) * 1.5^0 = 1500ms.
        await vi.advanceTimersByTimeAsync(1500);
        expect(getMock).toHaveBeenCalledTimes(2);

        wsManager.disconnect();
    });
});

// R3-ws-error-nonstring-typed-as-string: el envelope de 'error' se pasa tal
// cual llega del servidor, así que su campo `error` no puede tiparse como
// string (puede faltar o ser de otro tipo). El tipo tiene que obligar a
// estrechar antes de usarlo. Chequeo en tiempo de compilación (npm run typecheck).
describe('tipo del payload de error', () => {
    it('el campo error es unknown', () => {
        expectTypeOf<WsHandlerMap['error']['error']>().toEqualTypeOf<unknown>();
    });
});
