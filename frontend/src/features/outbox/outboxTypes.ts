/**
 * Offline outbox (PW9): text messages typed while offline are queued with a
 * client-generated `clientID` and flushed in order when the WebSocket opens.
 * The backend (PW8) makes `(sender, clientID)` idempotent, so a resend never
 * duplicates a message.
 */

/** Minimal shape of the message being replied to (same fields the WS send uses). */
export interface OutboxReplyRef {
    MessageID: number;
    SenderTelephon: string;
    Message: string;
}

/** 1:1 chat (`target` = receiver telephon) or group (`target` = group id). */
export type OutboxTarget =
    | { kind: 'direct'; target: string }
    | { kind: 'group'; target: number };

export type OutboxKind = OutboxTarget['kind'];

/** What a caller hands to the outbox to send one text message. */
export type OutboxSendInput = OutboxTarget & {
    text: string;
    replyTo: OutboxReplyRef | null;
};

/** One queued send, as persisted in IndexedDB (per logged-in user). */
export type OutboxEntry = OutboxSendInput & {
    /** Canonical lowercase UUID, the idempotency key sent to the server. */
    clientID: string;
    /** Epoch ms, strictly increasing per queue: the FIFO order. */
    createdAt: number;
    /** Send attempts so far (persisted before each send). */
    attempts: number;
};

/** `pending`: still queued (clock icon). `failed`: dropped after a permanent error ("no enviado"). */
export type OutboxItemState = 'pending' | 'failed';

export interface OutboxItem {
    state: OutboxItemState;
    entry: OutboxEntry;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const isClientID = (value: unknown): value is string => typeof value === 'string' && UUID_PATTERN.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isNonNegativeInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

function parseReplyRef(raw: unknown): OutboxReplyRef | null | undefined {
    if (raw === null || raw === undefined) return null;
    if (!isRecord(raw)) return undefined;
    const { MessageID, SenderTelephon, Message } = raw;
    if (!isNonNegativeInt(MessageID) || MessageID === 0) return undefined;
    if (typeof SenderTelephon !== 'string' || typeof Message !== 'string') return undefined;
    return { MessageID, SenderTelephon, Message };
}

/** Runtime guard for anything read back from IndexedDB: null when the row is not a valid entry. */
export function parseOutboxEntry(raw: unknown): OutboxEntry | null {
    if (!isRecord(raw)) return null;
    const { clientID, kind, target, text, replyTo, createdAt, attempts } = raw;
    if (!isClientID(clientID)) return null;
    if (typeof text !== 'string' || text.trim() === '') return null;
    if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null;
    if (!isNonNegativeInt(attempts)) return null;
    const reply = parseReplyRef(replyTo);
    if (reply === undefined) return null;
    const base = { clientID, text, replyTo: reply, createdAt, attempts };
    if (kind === 'direct' && typeof target === 'string' && target !== '') return { ...base, kind, target };
    if (kind === 'group' && isNonNegativeInt(target) && target > 0) return { ...base, kind, target };
    return null;
}

/** Reads the echoed `ClientID` of a server message, only when it is a canonical UUID. */
export function readClientID(message: unknown): string | null {
    if (!isRecord(message)) return null;
    const value = message.ClientID;
    return isClientID(value) ? value : null;
}

/** Strips a full message down to the reply reference stored in the outbox. */
export function toReplyRef(message: OutboxReplyRef | null | undefined): OutboxReplyRef | null {
    if (!message) return null;
    return { MessageID: message.MessageID, SenderTelephon: message.SenderTelephon, Message: message.Message };
}

/**
 * Items of the open chat/group, minus any whose ClientID the server already returned.
 * `items` may be undefined (partial dashboard contexts, e.g. component test doubles).
 */
export function outboxItemsFor(
    items: readonly OutboxItem[] | undefined,
    target: OutboxTarget,
    loaded: readonly unknown[] | undefined,
): OutboxItem[] {
    const forTarget = (items ?? []).filter(i => i.entry.kind === target.kind && i.entry.target === target.target);
    if (forTarget.length === 0) return forTarget;
    const delivered = new Set<string>();
    loaded?.forEach(m => {
        const id = readClientID(m);
        if (id) delivered.add(id);
    });
    return forTarget.filter(i => !delivered.has(i.entry.clientID));
}
