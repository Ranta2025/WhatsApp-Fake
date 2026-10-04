import type { GroupMessageResponse, Message } from '../../../types/api';
import { isDisappearSeconds } from './disappearing';
import { parseSystemMessage } from './groupAdminEvents';

/**
 * Runtime guards for the disappearing-messages WS payloads (and the REST bodies,
 * which are the same envelope). Same principle as `groupAdminEvents.ts`: network
 * payloads are untrusted, so every handler validates before touching state.
 */

export type DisappearingChangedEvent =
    | { kind: 'direct'; key: string; seconds: number; byTelephon: string; systemMessage?: Message }
    | { kind: 'group'; key: number; seconds: number; byTelephon: string; systemMessage?: GroupMessageResponse };

export type MessagesExpiredEvent =
    | { kind: 'direct'; key: string; messageIDs: number[] }
    | { kind: 'group'; key: number; messageIDs: number[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const asPositiveInt = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;

const asNonEmptyString = (value: unknown): string | undefined =>
    typeof value === 'string' && value !== '' ? value : undefined;

/** Validates a persisted 1:1 system message; undefined when absent, null or malformed. */
export function parseDirectSystemMessage(raw: unknown): Message | undefined {
    if (!isRecord(raw) || raw.Kind !== 'system') return undefined;
    const messageID = asPositiveInt(raw.MessageID);
    const sender = asNonEmptyString(raw.SenderTelephon);
    if (messageID === undefined || sender === undefined || typeof raw.Receptor !== 'string') return undefined;
    return {
        MessageID: messageID,
        SenderTelephon: sender,
        Receptor: raw.Receptor,
        Message: typeof raw.Message === 'string' ? raw.Message : '',
        // System messages are stored as seen: they never count as unread/pending.
        Status: 'visto',
        Time: typeof raw.Time === 'string' ? raw.Time : '',
        Edited: false,
        Kind: 'system',
        ...(raw.SystemEvent === 'disappearing_changed' ? { SystemEvent: 'disappearing_changed' as const } : {}),
    };
}

/** `disappearing_changed` guard; `systemMessage` is dropped when absent/null/invalid (value unchanged). */
export function parseDisappearingChanged(payload: unknown): DisappearingChangedEvent | null {
    if (!isRecord(payload)) return null;
    const byTelephon = asNonEmptyString(payload.byTelephon);
    if (byTelephon === undefined || !isDisappearSeconds(payload.seconds)) return null;
    const seconds = payload.seconds;
    if (payload.kind === 'direct') {
        const key = asNonEmptyString(payload.key);
        if (key === undefined) return null;
        const systemMessage = parseDirectSystemMessage(payload.systemMessage);
        return { kind: 'direct', key, seconds, byTelephon, ...(systemMessage ? { systemMessage } : {}) };
    }
    if (payload.kind === 'group') {
        const key = asPositiveInt(payload.key);
        if (key === undefined) return null;
        const systemMessage = parseSystemMessage(payload.systemMessage);
        return { kind: 'group', key, seconds, byTelephon, ...(systemMessage ? { systemMessage } : {}) };
    }
    return null;
}

/** `messages_expired` guard: keeps only valid ids; an event with none is rejected. */
export function parseMessagesExpired(payload: unknown): MessagesExpiredEvent | null {
    if (!isRecord(payload) || !Array.isArray(payload.messageIDs)) return null;
    const messageIDs = payload.messageIDs.filter((id): id is number => asPositiveInt(id) !== undefined);
    if (messageIDs.length === 0) return null;
    if (payload.kind === 'direct') {
        const key = asNonEmptyString(payload.key);
        return key === undefined ? null : { kind: 'direct', key, messageIDs };
    }
    if (payload.kind === 'group') {
        const key = asPositiveInt(payload.key);
        return key === undefined ? null : { kind: 'group', key, messageIDs };
    }
    return null;
}
