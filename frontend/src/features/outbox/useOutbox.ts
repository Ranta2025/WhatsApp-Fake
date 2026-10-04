import { useCallback, useEffect, useRef, useState } from 'react';
import wsManager from '../../api/websocket';
import { getDefaultOutboxStore, type OutboxStore } from './outboxStore';
import { OutboxQueue, type AckOutcome, type OutboxTransport, type SendOutcome } from './outboxQueue';
import type { OutboxItem, OutboxSendInput } from './outboxTypes';

/** Sends an outbox entry over the app WebSocket, always with its clientID. */
export const wsOutboxTransport: OutboxTransport = {
    isOpen: () => wsManager.isConnected(),
    send: (entry) => (entry.kind === 'direct'
        ? wsManager.sendMessage(entry.target, entry.text, entry.replyTo, null, entry.clientID)
        : wsManager.sendGroupMessage(entry.target, entry.text, entry.replyTo, null, entry.clientID)),
};

const hex = (bytes: Uint8Array): string => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

/**
 * Canonical lowercase v4 UUID. `crypto.randomUUID` only exists in secure contexts
 * (https/localhost); on plain http (LAN dev) it falls back to getRandomValues.
 */
export function newClientID(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6]! & 0x0f) | 0x40;
    b[8] = (b[8]! & 0x3f) | 0x80;
    const h = hex(b);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const browserOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false;

export interface UseOutboxOptions {
    /** Logged-in telephon; null = no session (no queue). */
    owner: string | null;
    /** WebSocket open: flushes on every transition to true. */
    connected: boolean;
    store?: OutboxStore;
    transport?: OutboxTransport;
}

/** `unavailable`: no session yet, nothing was sent or queued. */
export type OutboxSendResult = SendOutcome | 'unavailable';

export interface UseOutboxResult {
    /** Pending (clock) and failed ("no enviado") text messages of this user. */
    items: readonly OutboxItem[];
    sendText: (input: OutboxSendInput) => Promise<OutboxSendResult>;
    /** Ack/echo of one of our messages; see AckOutcome. */
    ack: (clientID: string) => AckOutcome;
    /** WS `error` frame text. */
    handleError: (message: string) => void;
    reconcile: (knownClientIDs: ReadonlySet<string>) => void;
    /** Logout: drops this user's queue (memory + IndexedDB). */
    clear: () => Promise<void>;
}

const NO_ITEMS: readonly OutboxItem[] = [];

/** React binding of OutboxQueue: one queue per logged-in owner. */
export function useOutbox({ owner, connected, store, transport }: UseOutboxOptions): UseOutboxResult {
    const [state, setState] = useState<{ owner: string | null; items: readonly OutboxItem[] }>({ owner: null, items: NO_ITEMS });
    const queueRef = useRef<OutboxQueue | null>(null);
    const deps = useRef({ store, transport });

    useEffect(() => {
        if (!owner) return;
        const queue = new OutboxQueue({
            store: deps.current.store ?? getDefaultOutboxStore(),
            owner,
            transport: deps.current.transport ?? wsOutboxTransport,
            isOnline: browserOnline,
            newClientID,
            now: Date.now,
        });
        queueRef.current = queue;
        const unsubscribe = queue.subscribe(items => setState({ owner, items }));
        return () => {
            unsubscribe();
            queue.dispose();
            if (queueRef.current === queue) queueRef.current = null;
        };
    }, [owner]);

    useEffect(() => {
        const queue = queueRef.current;
        if (!queue) return;
        if (connected) void queue.flush();
        else queue.handleDisconnect();
    }, [connected, owner]);

    // Text queued while `navigator.onLine` was false is not flushed by a connect
    // event when the socket never closed: flush when the browser is back online.
    // A closed socket reconnects on `online` (wsManager) and flushes on connect.
    useEffect(() => {
        if (!owner) return;
        const onOnline = () => { queueRef.current?.handleOnline(); };
        window.addEventListener('online', onOnline);
        return () => window.removeEventListener('online', onOnline);
    }, [owner]);

    const sendText = useCallback(async (input: OutboxSendInput): Promise<OutboxSendResult> => {
        const queue = queueRef.current;
        return queue ? queue.sendText(input) : 'unavailable';
    }, []);
    const ack = useCallback((clientID: string): AckOutcome => queueRef.current?.ack(clientID) ?? 'unknown', []);
    const handleError = useCallback((message: string) => { queueRef.current?.handleError(message); }, []);
    const reconcile = useCallback((ids: ReadonlySet<string>) => { void queueRef.current?.reconcile(ids); }, []);
    const clear = useCallback(async () => {
        const queue = queueRef.current;
        if (queue) await queue.clear();
        else if (owner) await (deps.current.store ?? getDefaultOutboxStore()).clear(owner).catch(() => {});
    }, [owner]);

    const items = owner && state.owner === owner ? state.items : NO_ITEMS;
    return { items, sendText, ack, handleError, reconcile, clear };
}
