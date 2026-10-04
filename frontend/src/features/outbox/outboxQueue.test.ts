import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createOutboxStore, type OutboxStore } from './outboxStore';
import { OutboxQueue, type OutboxTransport } from './outboxQueue';
import type { OutboxEntry, OutboxSendInput } from './outboxTypes';

// PW9: queue/flush logic of the offline outbox, driven with a fake transport and
// the real IndexedDB store (fake-indexeddb). The queue owns ordering (FIFO, one
// send in flight), ack reconciliation by clientID and error-frame attribution.

let dbSeq = 0;
const freshName = () => `outbox-queue-test-${++dbSeq}`;

const ID = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;

class FakeTransport implements OutboxTransport {
    open = true;
    accept = true;
    sent: OutboxEntry[] = [];
    isOpen(): boolean { return this.open; }
    send(entry: OutboxEntry): boolean {
        if (!this.open || !this.accept) return false;
        this.sent.push(entry);
        return true;
    }
}

interface Setup {
    store: OutboxStore;
    transport: FakeTransport;
    queue: OutboxQueue;
    online: { value: boolean };
    dbName: string;
}

const queues: OutboxQueue[] = [];
const stores: OutboxStore[] = [];

function setup(over: { dbName?: string; owner?: string; ids?: string[]; ackTimeoutMs?: number; maxErrorAttempts?: number; retryBaseMs?: number; retryMaxMs?: number; transport?: FakeTransport } = {}): Setup {
    const dbName = over.dbName ?? freshName();
    const store = createOutboxStore(dbName);
    const transport = over.transport ?? new FakeTransport();
    const online = { value: true };
    const ids = [...(over.ids ?? [ID(1), ID(2), ID(3), ID(4), ID(5)])];
    let clock = 1000;
    const queue = new OutboxQueue({
        store,
        owner: over.owner ?? '111',
        transport,
        isOnline: () => online.value,
        newClientID: () => {
            const next = ids.shift();
            if (!next) throw new Error('test ran out of client ids');
            return next;
        },
        now: () => clock++,
        ackTimeoutMs: over.ackTimeoutMs ?? 5000,
        maxErrorAttempts: over.maxErrorAttempts,
        retryBaseMs: over.retryBaseMs,
        retryMaxMs: over.retryMaxMs,
    });
    queues.push(queue);
    stores.push(store);
    return { store, transport, queue, online, dbName };
}

const text = (t: string, target = '222'): OutboxSendInput => ({ kind: 'direct', target, text: t, replyTo: null });
const groupText = (t: string, groupID = 9): OutboxSendInput => ({ kind: 'group', target: groupID, text: t, replyTo: null });

afterEach(() => {
    queues.splice(0).forEach(q => q.dispose());
    stores.splice(0).forEach(s => s.close());
});

describe('OutboxQueue.sendText', () => {
    it('online with an open socket and an empty queue sends right away with a fresh clientID and does not touch the outbox', async () => {
        const { queue, transport, store } = setup();
        await queue.ready;

        await expect(queue.sendText(text('hola'))).resolves.toBe('sent');

        expect(transport.sent).toEqual([expect.objectContaining({ clientID: ID(1), kind: 'direct', target: '222', text: 'hola' })]);
        expect(queue.getItems()).toEqual([]);
        expect(await store.list('111')).toEqual([]);
    });

    it('every online send gets its own clientID', async () => {
        const { queue, transport } = setup();
        await queue.sendText(text('a'));
        await queue.sendText(groupText('b'));
        expect(transport.sent.map(e => e.clientID)).toEqual([ID(1), ID(2)]);
        expect(transport.sent[1]).toEqual(expect.objectContaining({ kind: 'group', target: 9 }));
    });

    it('enqueues as pending when the browser is offline', async () => {
        const { queue, transport, store, online } = setup();
        online.value = false;

        await expect(queue.sendText(text('offline'))).resolves.toBe('queued');

        expect(transport.sent).toEqual([]);
        expect(queue.getItems()).toEqual([{ state: 'pending', entry: expect.objectContaining({ clientID: ID(1), text: 'offline', attempts: 0 }) }]);
        expect((await store.list('111')).map(e => e.clientID)).toEqual([ID(1)]);
    });

    it('enqueues when the WebSocket is not open even if navigator says online', async () => {
        const { queue, transport, store } = setup();
        transport.open = false;

        await expect(queue.sendText(groupText('ws closed'))).resolves.toBe('queued');

        expect((await store.list('111'))[0]).toEqual(expect.objectContaining({ kind: 'group', target: 9, text: 'ws closed' }));
    });

    it('enqueues when the socket refuses the frame', async () => {
        const { queue, transport } = setup();
        transport.accept = false;
        await expect(queue.sendText(text('x'))).resolves.toBe('queued');
        expect(queue.getItems()).toHaveLength(1);
    });

    it('keeps FIFO: a new online send waits behind entries already queued', async () => {
        const { queue, transport, online } = setup();
        online.value = false;
        await queue.sendText(text('first'));
        online.value = true;

        await expect(queue.sendText(text('second'))).resolves.toBe('queued');
        await vi.waitFor(() => expect(transport.sent.map(e => e.text)).toEqual(['first']));
        expect(queue.ack(ID(1))).toBe('fresh');
        await vi.waitFor(() => expect(transport.sent.map(e => e.text)).toEqual(['first', 'second']));
    });

    it('notifies subscribers with the current items', async () => {
        const { queue, online } = setup();
        online.value = false;
        const seen: number[] = [];
        const unsubscribe = queue.subscribe(items => seen.push(items.length));
        await queue.sendText(text('x'));
        unsubscribe();
        await queue.sendText(text('y'));
        expect(seen.at(-1)).toBe(1);
    });
});

describe('OutboxQueue.flush', () => {
    it('sends queued entries FIFO, one in flight at a time, removing each one on its ack', async () => {
        const { queue, transport, store, online } = setup();
        online.value = false;
        transport.open = false;
        await queue.sendText(text('uno'));
        await queue.sendText(groupText('dos'));

        online.value = true;
        transport.open = true;
        void queue.flush();

        await vi.waitFor(() => expect(transport.sent).toHaveLength(1));
        expect(transport.sent[0]).toEqual(expect.objectContaining({ clientID: ID(1), text: 'uno', attempts: 1 }));

        expect(queue.ack(ID(1))).toBe('fresh');
        await vi.waitFor(() => expect(transport.sent).toHaveLength(2));
        expect(transport.sent[1]).toEqual(expect.objectContaining({ clientID: ID(2), kind: 'group', text: 'dos' }));

        expect(queue.ack(ID(2))).toBe('fresh');
        await vi.waitFor(async () => expect(await store.list('111')).toEqual([]));
        expect(queue.getItems()).toEqual([]);
    });

    it('a concurrent flush call does not send the same entry twice', async () => {
        const { queue, transport, online } = setup();
        online.value = false;
        await queue.sendText(text('uno'));
        online.value = true;
        void queue.flush();
        void queue.flush();
        await vi.waitFor(() => expect(transport.sent).toHaveLength(1));
        await new Promise(r => setTimeout(r, 20));
        expect(transport.sent).toHaveLength(1);
    });

    it('a send failure keeps the entry (attempts incremented) for the next open', async () => {
        const { queue, transport, store, online } = setup();
        online.value = false;
        await queue.sendText(text('uno'));
        online.value = true;
        transport.accept = false;

        await queue.flush();

        expect(queue.getItems()).toEqual([{ state: 'pending', entry: expect.objectContaining({ clientID: ID(1), attempts: 1 }) }]);
        expect((await store.list('111'))[0]?.attempts).toBe(1);

        transport.accept = true;
        void queue.flush();
        await vi.waitFor(() => expect(transport.sent).toEqual([expect.objectContaining({ clientID: ID(1), attempts: 2 })]));
    });

    it('a disconnect mid-flush keeps the in-flight entry and stops; the next open resends the same clientID', async () => {
        const { queue, transport, store, online } = setup();
        online.value = false;
        await queue.sendText(text('uno'));
        await queue.sendText(text('dos'));
        online.value = true;

        const flushing = queue.flush();
        await vi.waitFor(() => expect(transport.sent).toHaveLength(1));
        transport.open = false;
        queue.handleDisconnect();
        await flushing;

        expect(transport.sent).toHaveLength(1);
        expect((await store.list('111')).map(e => [e.clientID, e.attempts])).toEqual([[ID(1), 1], [ID(2), 0]]);

        transport.open = true;
        void queue.flush();
        await vi.waitFor(() => expect(transport.sent).toHaveLength(2));
        expect(transport.sent[1]).toEqual(expect.objectContaining({ clientID: ID(1), attempts: 2 }));
        // A second attempt may be a server-side replay: the caller must not trust the echo blindly.
        expect(queue.ack(ID(1))).toBe('replayed');
    });

    it('an ack timeout keeps the entry pending', async () => {
        const { queue, transport, online } = setup({ ackTimeoutMs: 10 });
        online.value = false;
        await queue.sendText(text('uno'));
        online.value = true;

        await queue.flush();

        expect(transport.sent).toHaveLength(1);
        expect(queue.getItems()).toEqual([{ state: 'pending', entry: expect.objectContaining({ attempts: 1 }) }]);
    });

    it('a permanent error frame (clientID conflict/invalid) drops the entry, marks it failed and continues', async () => {
        const { queue, transport, store, online } = setup();
        online.value = false;
        await queue.sendText(text('uno'));
        await queue.sendText(text('dos'));
        online.value = true;

        void queue.flush();
        await vi.waitFor(() => expect(transport.sent).toHaveLength(1));
        queue.handleError('Error al enviar mensaje: clientID ya usado en otra conversación');

        await vi.waitFor(() => expect(transport.sent).toHaveLength(2));
        expect(queue.getItems()).toEqual([
            { state: 'failed', entry: expect.objectContaining({ clientID: ID(1) }) },
            { state: 'pending', entry: expect.objectContaining({ clientID: ID(2) }) },
        ]);
        expect((await store.list('111')).map(e => e.clientID)).toEqual([ID(2)]);
    });

    it('treats an invalid-clientID group error as permanent too', async () => {
        const { queue, transport, online } = setup();
        online.value = false;
        await queue.sendText(groupText('uno'));
        online.value = true;
        const flushing = queue.flush();
        await vi.waitFor(() => expect(transport.sent).toHaveLength(1));
        queue.handleError('Error al enviar mensaje al grupo: clientID no válido: debe ser un UUID');
        await flushing;
        expect(queue.getItems()[0]?.state).toBe('failed');
    });

    it('any other send error keeps the entry until maxErrorAttempts, then marks it failed', async () => {
        const { queue, transport, online } = setup({ maxErrorAttempts: 2 });
        online.value = false;
        await queue.sendText(text('uno'));
        online.value = true;

        let flushing = queue.flush();
        await vi.waitFor(() => expect(transport.sent).toHaveLength(1));
        queue.handleError('Error al enviar mensaje: timeout');
        await flushing;
        expect(queue.getItems()[0]?.state).toBe('pending');

        flushing = queue.flush();
        await vi.waitFor(() => expect(transport.sent).toHaveLength(2));
        queue.handleError('Error al enviar mensaje: timeout');
        await flushing;
        expect(queue.getItems()[0]?.state).toBe('failed');
    });

    it('ignores error frames unrelated to a send (nothing in flight, or another action)', async () => {
        const { queue, transport, online } = setup();
        queue.handleError('Error al enviar mensaje: clientID ya usado en otra conversación');
        online.value = false;
        await queue.sendText(text('uno'));
        online.value = true;
        void queue.flush();
        await vi.waitFor(() => expect(transport.sent).toHaveLength(1));
        queue.handleError('Error al editar mensaje: no encontrado');
        expect(queue.getItems()[0]?.state).toBe('pending');
        expect(queue.ack(ID(1))).toBe('fresh');
    });

    it('an ack for a clientID it does not hold is "unknown"', async () => {
        const { queue } = setup();
        await queue.ready;
        expect(queue.ack(ID(9))).toBe('unknown');
    });
});

describe('OutboxQueue retry while connected', () => {
    afterEach(() => { vi.useRealTimers(); });

    // In-memory store: fake-indexeddb needs real macrotasks, which fake timers would starve.
    const memoryStore = (): OutboxStore => {
        const rows = new Map<string, OutboxEntry>();
        return {
            list: () => Promise.resolve([...rows.values()]),
            put: (_owner, entry) => { rows.set(entry.clientID, entry); return Promise.resolve(); },
            remove: (_owner, id) => { rows.delete(id); return Promise.resolve(); },
            clear: () => { rows.clear(); return Promise.resolve(); },
            close: () => {},
        };
    };

    // Queues one entry while offline, then goes online with fake timers installed.
    async function queuedEntry(over: { ackTimeoutMs: number; retryBaseMs: number; retryMaxMs?: number; maxErrorAttempts?: number }) {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const transport = new FakeTransport();
        const online = { value: false };
        let n = 0;
        const queue = new OutboxQueue({
            store: memoryStore(), owner: '111', transport, isOnline: () => online.value,
            newClientID: () => ID(++n), now: () => n, ...over,
        });
        queues.push(queue);
        await queue.sendText(text('uno'));
        online.value = true;
        return { queue, transport, online };
    }

    it('re-sends a timed-out entry after the backoff without a connect event, then delivers later entries FIFO', async () => {
        const { queue, transport } = await queuedEntry({ ackTimeoutMs: 100, retryBaseMs: 1000, retryMaxMs: 8000 });
        void queue.flush();
        await vi.advanceTimersByTimeAsync(100); // ack timeout
        expect(transport.sent.map(e => [e.text, e.attempts])).toEqual([['uno', 1]]);

        await queue.sendText(text('dos')); // queued behind the stuck entry
        await vi.advanceTimersByTimeAsync(500);
        expect(transport.sent).toHaveLength(1); // enqueueing does not bypass the backoff
        await vi.advanceTimersByTimeAsync(500); // backoff elapsed
        expect(transport.sent.map(e => [e.text, e.attempts])).toEqual([['uno', 1], ['uno', 2]]);

        expect(queue.ack(ID(1))).toBe('replayed');
        await vi.advanceTimersByTimeAsync(0);
        expect(transport.sent.at(-1)).toEqual(expect.objectContaining({ text: 'dos' }));
    });

    it('repeated timeouts while open end in failed after maxErrorAttempts', async () => {
        const { queue, transport } = await queuedEntry({ ackTimeoutMs: 100, retryBaseMs: 1000, retryMaxMs: 8000, maxErrorAttempts: 3 });
        void queue.flush();
        await vi.advanceTimersByTimeAsync(100_000);
        expect(transport.sent).toHaveLength(3);
        expect(queue.getItems()[0]?.state).toBe('failed');
    });

    it('dispose cancels a scheduled retry', async () => {
        const { queue, transport } = await queuedEntry({ ackTimeoutMs: 100, retryBaseMs: 1000 });
        void queue.flush();
        await vi.advanceTimersByTimeAsync(100);
        expect(transport.sent).toHaveLength(1);
        queue.dispose();
        await vi.advanceTimersByTimeAsync(100_000);
        expect(transport.sent).toHaveLength(1);
    });

    it('handleOnline flushes entries queued while the browser was offline and the socket stayed open', async () => {
        const { queue, transport } = await queuedEntry({ ackTimeoutMs: 100, retryBaseMs: 1000 });
        expect(transport.sent).toHaveLength(0);
        queue.handleOnline();
        await vi.advanceTimersByTimeAsync(0);
        expect(transport.sent.map(e => e.text)).toEqual(['uno']);
    });

    it('handleOnline does not bypass a scheduled retry backoff', async () => {
        const { queue, transport } = await queuedEntry({ ackTimeoutMs: 100, retryBaseMs: 1000 });
        void queue.flush();
        await vi.advanceTimersByTimeAsync(100); // ack timeout -> retry scheduled
        expect(transport.sent).toHaveLength(1);
        queue.handleOnline();
        await vi.advanceTimersByTimeAsync(500);
        expect(transport.sent).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(500);
        expect(transport.sent).toHaveLength(2);
    });

    it('handleOnline does nothing while the browser still reports offline or the socket is closed', async () => {
        const { queue, transport, online } = await queuedEntry({ ackTimeoutMs: 100, retryBaseMs: 1000 });
        online.value = false;
        queue.handleOnline();
        await vi.advanceTimersByTimeAsync(0);
        online.value = true;
        transport.open = false;
        queue.handleOnline();
        await vi.advanceTimersByTimeAsync(0);
        expect(transport.sent).toHaveLength(0);
    });

    it('a disconnect does not schedule a retry (waits for the reconnect)', async () => {
        const { queue, transport } = await queuedEntry({ ackTimeoutMs: 100, retryBaseMs: 1000 });
        const flushing = queue.flush();
        await vi.advanceTimersByTimeAsync(0);
        expect(transport.sent).toHaveLength(1);
        transport.open = false;
        queue.handleDisconnect();
        await flushing;
        await vi.advanceTimersByTimeAsync(100_000);
        expect(transport.sent).toHaveLength(1);
    });
});

describe('OutboxQueue persistence', () => {
    it('rehydrates pending entries after a reload (new store + queue on the same database) and flushes them with their stored clientIDs', async () => {
        const first = setup();
        first.online.value = false;
        await first.queue.sendText(text('uno'));
        await first.queue.sendText(groupText('dos'));
        first.queue.dispose();

        const transport = new FakeTransport();
        const second = setup({ dbName: first.dbName, ids: [ID(7)], transport });
        await second.queue.ready;
        expect(second.queue.getItems().map(i => [i.state, i.entry.clientID])).toEqual([['pending', ID(1)], ['pending', ID(2)]]);

        void second.queue.flush();
        await vi.waitFor(() => expect(transport.sent.map(e => e.clientID)).toEqual([ID(1)]));
        second.queue.ack(ID(1));
        await vi.waitFor(() => expect(transport.sent.map(e => e.clientID)).toEqual([ID(1), ID(2)]));
    });

    it('rehydrates only the logged-in owner entries', async () => {
        const ana = setup({ owner: '111' });
        ana.online.value = false;
        await ana.queue.sendText(text('de ana'));

        const bea = setup({ dbName: ana.dbName, owner: '222', ids: [ID(8)] });
        await bea.queue.ready;
        expect(bea.queue.getItems()).toEqual([]);
    });

    it('clear (logout) empties the queue and the stored entries of that owner only', async () => {
        const ana = setup({ owner: '111' });
        ana.online.value = false;
        await ana.queue.sendText(text('de ana'));
        const bea = setup({ dbName: ana.dbName, owner: '222', ids: [ID(8)] });
        bea.online.value = false;
        await bea.queue.sendText(text('de bea'));

        await ana.queue.clear();

        expect(ana.queue.getItems()).toEqual([]);
        expect(await ana.store.list('111')).toEqual([]);
        expect((await ana.store.list('222')).map(e => e.clientID)).toEqual([ID(8)]);
    });

    it('reconcile drops pending entries whose clientID the server already returned (history after reload)', async () => {
        const { queue, store, online } = setup();
        online.value = false;
        await queue.sendText(text('uno'));
        await queue.sendText(text('dos'));

        await queue.reconcile(new Set([ID(1)]));

        expect(queue.getItems().map(i => i.entry.clientID)).toEqual([ID(2)]);
        expect((await store.list('111')).map(e => e.clientID)).toEqual([ID(2)]);
    });

    it('keeps working in memory when IndexedDB is unavailable', async () => {
        const transport = new FakeTransport();
        const broken: OutboxStore = {
            list: () => Promise.reject(new Error('no idb')),
            put: () => Promise.reject(new Error('no idb')),
            remove: () => Promise.reject(new Error('no idb')),
            clear: () => Promise.reject(new Error('no idb')),
            close: () => {},
        };
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const online = { value: false };
        const queue = new OutboxQueue({
            store: broken, owner: '111', transport, isOnline: () => online.value,
            newClientID: () => ID(1), now: () => 1, ackTimeoutMs: 5000,
        });
        queues.push(queue);

        await expect(queue.sendText(text('uno'))).resolves.toBe('queued');
        online.value = true;
        void queue.flush();
        await vi.waitFor(() => expect(transport.sent).toHaveLength(1));
        expect(queue.ack(ID(1))).toBe('fresh');
        warn.mockRestore();
    });
});
