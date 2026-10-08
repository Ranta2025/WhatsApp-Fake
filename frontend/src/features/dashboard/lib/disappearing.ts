import type { DisappearSeconds, Message } from '../../../types/api';
import type { MergeableMessage } from './mergeMessages';
import { messageIdOf } from './mergeMessages';
import type { FocusedWindow } from './focusedWindow';

/**
 * Pure helpers for disappearing messages: allowed timer values, the wording of the
 * system notice (shared by 1:1 and groups), `ExpiresAt` parsing, removal reducers
 * (server `messages_expired` and the local expiry sweep) and the unread/preview
 * exclusions for system messages. Network data is untrusted: everything here
 * tolerates garbage instead of throwing.
 */

export const DISAPPEAR_OPTIONS: readonly DisappearSeconds[] = [0, 86400, 604800, 7776000];

/** Longest single timeout the local expiry timer will schedule; it re-arms after firing. */
export const MAX_EXPIRY_DELAY_MS = 60 * 60 * 1000;

export const isDisappearSeconds = (value: unknown): value is DisappearSeconds =>
    typeof value === 'number' && (DISAPPEAR_OPTIONS as readonly number[]).includes(value);

/** `DisappearSeconds` fields are omitempty: absent/invalid means "off". */
export const normalizeDisappearSeconds = (value: unknown): number =>
    typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;

export function formatDisappearDuration(seconds: number): string {
    switch (seconds) {
        case 86400: return '24 horas';
        case 604800: return '7 días';
        case 7776000: return '90 días';
        default: return `${seconds} s`;
    }
}

/** Compact label for the header chip: "24 h" / "7 d" / "90 d". */
export function formatDisappearShort(seconds: number): string {
    switch (seconds) {
        case 86400: return '24 h';
        case 604800: return '7 d';
        case 7776000: return '90 d';
        default: return `${seconds} s`;
    }
}

/** Option label of the selector ("Desactivados" for 0). */
export const disappearOptionLabel = (seconds: number): string =>
    seconds === 0 ? 'Desactivados' : formatDisappearDuration(seconds);

/** Notice text: "Ana activó los mensajes temporales: 24 horas" / "Activaste ..." for the viewer. */
export function describeDisappearingChange(seconds: number, actorIsViewer: boolean, actorName: string): string {
    if (seconds === 0) {
        return actorIsViewer ? 'Desactivaste los mensajes temporales' : `${actorName} desactivó los mensajes temporales`;
    }
    const duration = formatDisappearDuration(seconds);
    return actorIsViewer
        ? `Activaste los mensajes temporales: ${duration}`
        : `${actorName} activó los mensajes temporales: ${duration}`;
}

/** The system message body is the new value in seconds ("0" = off). */
export const secondsFromSystemText = (text: string): number | undefined => {
    const value = Number(text);
    return text.trim() !== '' && isDisappearSeconds(value) ? value : undefined;
};

/** Shared by 1:1 and group system messages (`SystemEvent` disappearing_changed). */
export function describeDisappearingSystemText(
    text: string, actor: string, actorName: string | undefined, viewerTelephon: string | undefined,
): string {
    const actorIsViewer = viewerTelephon !== undefined && actor === viewerTelephon;
    const name = actorName || actor;
    const seconds = secondsFromSystemText(text);
    if (seconds === undefined) {
        return actorIsViewer ? 'Cambiaste los mensajes temporales' : `${name} cambió los mensajes temporales`;
    }
    return describeDisappearingChange(seconds, actorIsViewer, name);
}

/** Renders a persisted 1:1 system message for one viewer. */
export function describeDirectSystemMessage(
    msg: Message,
    viewerTelephon: string | undefined,
    resolveName: (telephon: string) => string | undefined,
): string {
    return describeDisappearingSystemText(msg.message, msg.senderTelephon, resolveName(msg.senderTelephon), viewerTelephon);
}

/** `ExpiresAt` (RFC 3339) -> epoch ms; anything invalid is ignored (message never expires locally). */
export function parseExpiresAt(raw: unknown): number | undefined {
    if (typeof raw !== 'string' || raw === '') return undefined;
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? undefined : ms;
}

/** Shape shared by 1:1 (camel) and group (Pascal) messages for expiry and reply scrubbing. */
export interface ExpirableMessage extends MergeableMessage {
    ExpiresAt?: string;
    expiresAt?: string;
    Kind?: 'system';
    kind?: 'system';
    ReplyToMessageID?: number;
    replyToMessageID?: number;
    ReplyToTelephon?: string;
    replyToTelephon?: string;
    ReplyToMessage?: string;
    replyToMessage?: string;
}

const replyIdOf = (m: ExpirableMessage): number | undefined =>
    m.replyToMessageID !== undefined ? m.replyToMessageID : m.ReplyToMessageID;

const dropReply = <T extends ExpirableMessage>(m: T): T => {
    const copy = { ...m };
    delete copy.ReplyToMessageID;
    delete copy.replyToMessageID;
    delete copy.ReplyToTelephon;
    delete copy.replyToTelephon;
    delete copy.ReplyToMessage;
    delete copy.replyToMessage;
    return copy;
};

/**
 * Removes messages by id. Replies that quoted a removed message lose the quote
 * (the server scrubs it too), so the expired text does not linger on screen.
 * Same array when nothing matched.
 */
export function removeMessagesByIds<T extends ExpirableMessage>(list: T[], ids: ReadonlySet<number>): T[];
export function removeMessagesByIds<T extends ExpirableMessage>(list: readonly T[], ids: ReadonlySet<number>): readonly T[];
export function removeMessagesByIds<T extends ExpirableMessage>(list: readonly T[], ids: ReadonlySet<number>): readonly T[] {
    if (ids.size === 0) return list;
    let changed = false;
    const out: T[] = [];
    for (const m of list) {
        const id = messageIdOf(m);
        if (typeof id === 'number' && ids.has(id)) { changed = true; continue; }
        const replyId = replyIdOf(m);
        if (replyId !== undefined && ids.has(replyId)) {
            changed = true;
            out.push(dropReply(m));
            continue;
        }
        out.push(m);
    }
    return changed ? out : list;
}

/** Expiry instant of a message the local sweep may remove (numeric id, never a system notice). */
const removableExpiry = (m: ExpirableMessage): number | undefined => {
    const id = messageIdOf(m);
    const kind = m.kind !== undefined ? m.kind : m.Kind;
    const expiresAt = m.expiresAt !== undefined ? m.expiresAt : m.ExpiresAt;
    return typeof id === 'number' && kind !== 'system' ? parseExpiresAt(expiresAt) : undefined;
};

const isExpired = (m: ExpirableMessage, now: number): boolean => {
    const at = removableExpiry(m);
    return at !== undefined && now >= at;
};

/** Removes every message with `now >= ExpiresAt` (plus reply scrubbing); same array when none. */
export function removeExpiredMessages<T extends ExpirableMessage>(list: T[], now: number): T[] {
    const ids = new Set<number>();
    for (const m of list) {
        const id = messageIdOf(m);
        if (typeof id === 'number' && isExpired(m, now)) ids.add(id);
    }
    return removeMessagesByIds(list, ids);
}

/** Detached window: same object when nothing was removed; paging flags untouched. */
export function removeIdsFromWindow<T extends ExpirableMessage>(win: FocusedWindow<T>, ids: ReadonlySet<number>): FocusedWindow<T> {
    const messages = removeMessagesByIds(win.messages, ids);
    return messages === win.messages ? win : { ...win, messages };
}

export function removeExpiredFromWindow<T extends ExpirableMessage>(win: FocusedWindow<T>, now: number): FocusedWindow<T> {
    const messages = removeExpiredMessages(win.messages, now);
    return messages === win.messages ? win : { ...win, messages };
}

/** Earliest `ExpiresAt` (epoch ms) among messages the sweep can actually remove, or null. */
export function earliestExpiry(lists: Iterable<readonly ExpirableMessage[]>): number | null {
    let best: number | null = null;
    for (const list of lists) {
        for (const m of list) {
            const at = removableExpiry(m);
            if (at !== undefined && (best === null || at < best)) best = at;
        }
    }
    return best;
}

/** Delay for the single expiry timeout: never negative, capped; null when nothing expires. */
export function expiryDelay(earliest: number | null, now: number, maxMs: number = MAX_EXPIRY_DELAY_MS): number | null {
    if (earliest === null) return null;
    return Math.min(Math.max(earliest - now, 0), maxMs);
}

export const isSystemDirectMessage = (m: Pick<Message, 'kind'>): boolean => m.kind === 'system';

/** Incoming, not yet seen, real (non-system) messages from `from`. */
export function countUnreadFrom(messages: readonly Message[] | undefined, from: string): number {
    let n = 0;
    for (const m of messages ?? []) {
        if (m?.senderTelephon === from && m.status !== 'visto' && !isSystemDirectMessage(m)) n++;
    }
    return n;
}

export const hasUnreadFrom = (messages: readonly Message[] | undefined, from: string): boolean =>
    countUnreadFrom(messages, from) > 0;

/** Latest message that may feed the sidebar preview (system notices never do). */
export function latestPreviewable(messages: readonly Message[] | undefined): Message | null {
    for (let i = (messages?.length ?? 0) - 1; i >= 0; i--) {
        const m = messages![i];
        if (m && !isSystemDirectMessage(m)) return m;
    }
    return null;
}
