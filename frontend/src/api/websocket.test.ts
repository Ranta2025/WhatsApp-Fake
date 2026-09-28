// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
