// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createOutboxStore, type OutboxStore } from './outboxStore';
import type { OutboxTransport } from './outboxQueue';
import type { OutboxEntry } from './outboxTypes';
import { useOutbox, type UseOutboxResult } from './useOutbox';

// PW10: text queued while the browser reported offline must flush when the
// browser comes back online even if the WebSocket never closed (no
// connection-state change happens in that case).

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../api/websocket', () => ({
    wsManager: { isConnected: () => false, sendMessage: () => false, sendGroupMessage: () => false },
}));

class OpenTransport implements OutboxTransport {
    sent: OutboxEntry[] = [];
    isOpen(): boolean { return true; }
    send(entry: OutboxEntry): boolean {
        this.sent.push(entry);
        return true;
    }
}

let dbSeq = 0;

function Harness({ store, transport, onReady }: { store: OutboxStore; transport: OutboxTransport; onReady: (r: UseOutboxResult) => void }) {
    const outbox = useOutbox({ owner: '111', connected: true, store, transport });
    onReady(outbox);
    return null;
}

describe('useOutbox with an open socket', () => {
    let container: HTMLDivElement;
    let root: Root;
    let store: OutboxStore;
    let online: boolean;

    beforeEach(() => {
        online = false;
        vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
        store = createOutboxStore(`use-outbox-test-${++dbSeq}`);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
        store.close();
        vi.restoreAllMocks();
    });

    it('flushes the queue when the browser fires online while the socket stayed open', async () => {
        const transport = new OpenTransport();
        let outbox: UseOutboxResult | undefined;
        await act(async () => {
            root.render(<Harness store={store} transport={transport} onReady={(r) => { outbox = r; }} />);
        });

        let result: string | undefined;
        await act(async () => { result = await outbox!.sendText({ kind: 'direct', target: '222', text: 'hola', replyTo: null }); });
        expect(result).toBe('queued');
        expect(transport.sent).toHaveLength(0);

        online = true;
        await act(async () => { window.dispatchEvent(new Event('online')); });

        await vi.waitFor(() => expect(transport.sent.map(e => e.text)).toEqual(['hola']));
    });

    it('stops listening for online after unmount', async () => {
        const transport = new OpenTransport();
        let outbox: UseOutboxResult | undefined;
        await act(async () => {
            root.render(<Harness store={store} transport={transport} onReady={(r) => { outbox = r; }} />);
        });
        await act(async () => { await outbox!.sendText({ kind: 'direct', target: '222', text: 'hola', replyTo: null }); });

        act(() => { root.unmount(); });
        root = createRoot(container);
        online = true;
        await act(async () => { window.dispatchEvent(new Event('online')); });

        expect(transport.sent).toHaveLength(0);
    });
});
