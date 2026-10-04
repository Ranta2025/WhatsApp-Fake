import type { OutboxStore } from './outboxStore';
import type { OutboxEntry, OutboxItem, OutboxSendInput } from './outboxTypes';

/**
 * Queue/flush logic of the offline outbox, independent of React and of the real
 * WebSocket (both injected) so it is unit-testable.
 *
 * - `sendText` sends right away (with a fresh clientID) when online, the socket
 *   is open and nothing is queued; otherwise it enqueues (FIFO is preserved).
 * - `flush` sends queued entries one at a time: each waits for its ack (`ack`),
 *   an error frame (`handleError`), a disconnect (`handleDisconnect`) or a
 *   timeout before the next one. Attempts are persisted BEFORE sending, so an
 *   ack of an entry with `attempts > 1` may be a server replay of a message
 *   stored by an earlier attempt (and maybe deleted since): `ack` reports it as
 *   `replayed` and the caller must reload from history instead of inserting it.
 * - The backend error frame carries no clientID; it is attributed to the entry
 *   in flight only when it is a send error ("Error al enviar mensaje…").
 *   clientID conflict/invalid errors are permanent: the entry is dropped from
 *   the store and kept in memory as `failed` (no retry UI in v1).
 * - Store failures (IndexedDB unavailable) never block: the queue keeps working
 *   in memory, it just does not survive a reload.
 */

export interface OutboxTransport {
    /** True when the WebSocket is open. */
    isOpen(): boolean;
    /** Sends one entry with its clientID; false when the frame could not be sent. */
    send(entry: OutboxEntry): boolean;
}

export interface OutboxQueueOptions {
    store: OutboxStore;
    /** Logged-in user's telephon: entries are stored per owner. */
    owner: string;
    transport: OutboxTransport;
    isOnline: () => boolean;
    newClientID: () => string;
    now: () => number;
    /** How long a flushed entry waits for its ack before it stays pending for the next open. */
    ackTimeoutMs?: number;
    /** Non-permanent send errors or ack timeouts tolerated before the entry is marked failed. */
    maxErrorAttempts?: number;
    /** First retry delay after a timeout/transient error while the socket stays open; doubles per attempt. */
    retryBaseMs?: number;
    /** Cap of the retry delay. */
    retryMaxMs?: number;
}

/** `sent`: sent immediately (not queued). `queued`: in the outbox, shown as pending. */
export type SendOutcome = 'sent' | 'queued';

/** `fresh`: first-attempt ack, safe to insert. `replayed`: may be a replay, reload instead. `unknown`: not an outbox entry. */
export type AckOutcome = 'fresh' | 'replayed' | 'unknown';

type FlightResult =
    | { kind: 'ack' }
    | { kind: 'error'; permanent: boolean }
    | { kind: 'disconnect' }
    | { kind: 'timeout' };

interface InFlight {
    clientID: string;
    settle: (result: FlightResult) => void;
}

const SEND_ERROR_PREFIX = 'Error al enviar mensaje';
const PERMANENT_ERROR_MARKER = /clientID/i;
const DEFAULT_ACK_TIMEOUT_MS = 15000;
const DEFAULT_MAX_ERROR_ATTEMPTS = 5;
const DEFAULT_RETRY_BASE_MS = 2000;
const DEFAULT_RETRY_MAX_MS = 30000;

export class OutboxQueue {
    /** Resolves once the stored entries were loaded (rehydrated). */
    readonly ready: Promise<void>;

    private items: readonly OutboxItem[] = [];
    private readonly listeners = new Set<(items: readonly OutboxItem[]) => void>();
    private inFlight: InFlight | null = null;
    private flushing = false;
    private flushAgain = false;
    private disposed = false;
    private lastCreatedAt = 0;
    private warned = false;
    private readonly ackTimeoutMs: number;
    private readonly maxErrorAttempts: number;
    private readonly retryBaseMs: number;
    private readonly retryMaxMs: number;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly options: OutboxQueueOptions) {
        this.ackTimeoutMs = options.ackTimeoutMs ?? DEFAULT_ACK_TIMEOUT_MS;
        this.maxErrorAttempts = options.maxErrorAttempts ?? DEFAULT_MAX_ERROR_ATTEMPTS;
        this.retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
        this.retryMaxMs = options.retryMaxMs ?? DEFAULT_RETRY_MAX_MS;
        this.ready = this.load();
    }

    getItems(): readonly OutboxItem[] {
        return this.items;
    }

    subscribe(listener: (items: readonly OutboxItem[]) => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    async sendText(input: OutboxSendInput): Promise<SendOutcome> {
        await this.ready;
        const entry: OutboxEntry = {
            ...input,
            clientID: this.options.newClientID(),
            createdAt: this.nextCreatedAt(),
            attempts: 0,
        };
        const queueIdle = !this.items.some(i => i.state === 'pending');
        if (queueIdle && this.options.isOnline() && this.options.transport.isOpen() && this.trySend(entry)) {
            return 'sent';
        }
        this.setItems([...this.items, { state: 'pending', entry }]);
        await this.persist(entry);
        // A scheduled retry owns the next resend: enqueueing must not bypass its backoff.
        if (this.retryTimer === null && this.options.isOnline() && this.options.transport.isOpen()) void this.flush();
        return 'queued';
    }

    /** Sends the queued entries in order; safe to call repeatedly (one flush at a time). */
    async flush(): Promise<void> {
        await this.ready;
        this.cancelRetry();
        if (this.flushing) {
            this.flushAgain = true;
            return;
        }
        this.flushing = true;
        try {
            do {
                this.flushAgain = false;
                await this.drain();
            } while (this.flushAgain && this.retryTimer === null && !this.disposed && this.options.transport.isOpen());
        } finally {
            this.flushing = false;
        }
    }

    /** Server ack/echo of one of our messages carrying `clientID`. */
    ack(clientID: string): AckOutcome {
        const item = this.items.find(i => i.entry.clientID === clientID);
        if (!item) return 'unknown';
        this.setItems(this.items.filter(i => i !== item));
        void this.unpersist(clientID);
        if (this.inFlight?.clientID === clientID) this.inFlight.settle({ kind: 'ack' });
        return item.entry.attempts === 1 ? 'fresh' : 'replayed';
    }

    /** WS `error` frame text (the frame has no clientID: attributed to the entry in flight). */
    handleError(message: string): void {
        if (!this.inFlight || !message.startsWith(SEND_ERROR_PREFIX)) return;
        this.inFlight.settle({ kind: 'error', permanent: PERMANENT_ERROR_MARKER.test(message) });
    }

    /** The socket closed: the entry in flight stays queued for the next open. */
    handleDisconnect(): void {
        this.inFlight?.settle({ kind: 'disconnect' });
    }

    /** Drops pending entries whose clientID already appears in loaded server messages. */
    async reconcile(knownClientIDs: ReadonlySet<string>): Promise<void> {
        const delivered = this.items.filter(i =>
            i.state === 'pending' && knownClientIDs.has(i.entry.clientID) && this.inFlight?.clientID !== i.entry.clientID);
        if (delivered.length === 0) return;
        this.setItems(this.items.filter(i => !delivered.includes(i)));
        await Promise.all(delivered.map(i => this.unpersist(i.entry.clientID)));
    }

    /** Logout: forget everything queued for this owner. */
    async clear(): Promise<void> {
        this.inFlight?.settle({ kind: 'disconnect' });
        this.setItems([]);
        await this.options.store.clear(this.options.owner).catch((err: unknown) => this.warn(err));
    }

    dispose(): void {
        this.disposed = true;
        this.cancelRetry();
        this.inFlight?.settle({ kind: 'disconnect' });
        this.listeners.clear();
    }

    // ── internals ────────────────────────────────────────────────────────────

    private async load(): Promise<void> {
        let stored: OutboxEntry[] = [];
        try {
            stored = await this.options.store.list(this.options.owner);
        } catch (err) {
            this.warn(err);
        }
        if (stored.length === 0) return;
        const known = new Set(this.items.map(i => i.entry.clientID));
        const restored = stored.filter(e => !known.has(e.clientID)).map(entry => ({ state: 'pending' as const, entry }));
        this.lastCreatedAt = Math.max(this.lastCreatedAt, ...stored.map(e => e.createdAt));
        this.setItems([...restored, ...this.items].sort((a, b) => a.entry.createdAt - b.entry.createdAt));
    }

    private async drain(): Promise<void> {
        for (;;) {
            const next = this.items.find(i => i.state === 'pending');
            if (!next || this.disposed || !this.options.transport.isOpen()) return;

            const entry: OutboxEntry = { ...next.entry, attempts: next.entry.attempts + 1 };
            this.replaceEntry(entry);
            // Persist the attempt first: after a reload an ack of this entry may be a replay.
            await this.persist(entry);
            if (this.disposed || !this.items.some(i => i.entry.clientID === entry.clientID)) continue;

            const result = this.waitForResult(entry.clientID);
            if (!this.trySend(entry)) this.inFlight?.settle({ kind: 'disconnect' });
            const outcome = await result;

            if (outcome.kind === 'ack') continue;
            const permanent = outcome.kind === 'error' && outcome.permanent;
            const transient = outcome.kind === 'error' || outcome.kind === 'timeout';
            if (permanent || (transient && entry.attempts >= this.maxErrorAttempts)) {
                await this.markFailed(entry.clientID);
                continue;
            }
            // Timeout or transient error with the socket still open: no reconnect will
            // trigger a flush, so retry after a backoff. A disconnect waits for the reconnect.
            if (transient) this.scheduleRetry(entry.attempts);
            return;
        }
    }

    private scheduleRetry(attempts: number): void {
        if (this.disposed || !this.options.transport.isOpen()) return;
        this.cancelRetry();
        const delay = Math.min(this.retryBaseMs * 2 ** Math.max(0, attempts - 1), this.retryMaxMs);
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            void this.flush();
        }, delay);
    }

    private cancelRetry(): void {
        if (this.retryTimer === null) return;
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
    }

    private waitForResult(clientID: string): Promise<FlightResult> {
        return new Promise<FlightResult>(resolve => {
            const timer = setTimeout(() => settle({ kind: 'timeout' }), this.ackTimeoutMs);
            const flight: InFlight = { clientID, settle: () => {} };
            const settle = (result: FlightResult): void => {
                clearTimeout(timer);
                if (this.inFlight === flight) this.inFlight = null;
                resolve(result);
            };
            flight.settle = settle;
            this.inFlight = flight;
        });
    }

    private trySend(entry: OutboxEntry): boolean {
        try {
            return this.options.transport.send(entry);
        } catch (err) {
            console.error('[outbox] send failed:', err);
            return false;
        }
    }

    private async markFailed(clientID: string): Promise<void> {
        this.setItems(this.items.map(i => (i.entry.clientID === clientID ? { ...i, state: 'failed' } : i)));
        await this.unpersist(clientID);
    }

    private replaceEntry(entry: OutboxEntry): void {
        this.setItems(this.items.map(i => (i.entry.clientID === entry.clientID ? { ...i, entry } : i)));
    }

    private nextCreatedAt(): number {
        this.lastCreatedAt = Math.max(this.options.now(), this.lastCreatedAt + 1);
        return this.lastCreatedAt;
    }

    private async persist(entry: OutboxEntry): Promise<void> {
        await this.options.store.put(this.options.owner, entry).catch((err: unknown) => this.warn(err));
    }

    private async unpersist(clientID: string): Promise<void> {
        await this.options.store.remove(this.options.owner, clientID).catch((err: unknown) => this.warn(err));
    }

    private setItems(items: readonly OutboxItem[]): void {
        this.items = items;
        this.listeners.forEach(listener => listener(items));
    }

    private warn(err: unknown): void {
        if (this.warned) return;
        this.warned = true;
        console.warn('[outbox] IndexedDB unavailable, queued messages will not survive a reload:', err);
    }
}
