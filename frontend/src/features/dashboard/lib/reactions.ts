import type { ReactionSummary } from '../../../types/api';
import type { ReactionEventPayload } from '../../../types/ws';
import { isCamelMessage, messageIdOf } from './mergeMessages';

/**
 * Pure helpers for message reactions. Reactions live inside the message objects
 * (`Reactions?: ReactionSummary[]`), so every reducer here maps a message list to
 * a new list and returns the SAME array when nothing changed (cheap no-op for
 * React state setters and for containers that do not hold the message).
 *
 * How each actor is applied:
 *  - Me (event.telephon === myTelephon): SET semantics. My current reaction is read
 *    from `Mine` and replaced by `event.emoji`. This makes the echo of my own
 *    optimistic update (and a duplicated event) a no-op, and also keeps in sync a
 *    reaction made from another session of mine.
 *  - Another user: DELTA semantics. Aggregates do not say who reacted what, so the
 *    backend event carries `previousEmoji`: decrement it (if present) and increment
 *    `emoji` (if non-empty). A duplicated event from another user cannot be
 *    detected from aggregates alone; the backend never fans out no-ops, and
 *    `previousEmoji === emoji` is ignored defensively.
 */

export type ReactionKind = 'direct' | 'group';

export interface ReactionBearing {
    MessageID?: number | string;
    messageID?: number | string;
    Time?: string;
    time?: string;
    Reactions?: ReactionSummary[];
    reactions?: ReactionSummary[];
}

/** Reactions of a direct (camel) or group (Pascal) message. */
const bearingReactions = (m: ReactionBearing): ReactionSummary[] | undefined =>
    m.reactions !== undefined ? m.reactions : m.Reactions;

export type ReactionEvent = ReactionEventPayload;

/** Key of the pending-optimistic snapshot of one message. */
export const reactionPendingKey = (kind: ReactionKind, messageID: number): string => `${kind}:${messageID}`;

const isPositiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Guards the WS `reaction` payload; malformed -> null (never throws). */
export function parseReactionEvent(payload: unknown): ReactionEvent | null {
    if (!payload || typeof payload !== 'object') return null;
    const p = payload as Record<string, unknown>;
    const { kind, messageID, groupID, telephon, emoji } = p;
    if (kind !== 'direct' && kind !== 'group') return null;
    if (!isPositiveInt(messageID)) return null;
    if (typeof telephon !== 'string' || telephon === '') return null;
    if (typeof emoji !== 'string') return null;
    if (kind === 'group' && !isPositiveInt(groupID)) return null;
    return {
        kind,
        messageID,
        ...(kind === 'group' ? { groupID: groupID as number } : {}),
        telephon,
        username: str(p.username),
        emoji,
        previousEmoji: str(p.previousEmoji),
        authorTelephon: str(p.authorTelephon),
        preview: str(p.preview),
    };
}

export interface ReactionErrorTarget {
    kind: ReactionKind;
    messageID: number;
    groupID?: number;
}

/** Extracts the message a failed `react` refers to from a WS error envelope; null for any other error. */
export function parseReactionErrorContext(envelope: unknown): ReactionErrorTarget | null {
    if (!envelope || typeof envelope !== 'object') return null;
    const ctx = (envelope as { context?: unknown }).context;
    if (!ctx || typeof ctx !== 'object') return null;
    const { action, kind, messageID, groupID } = ctx as Record<string, unknown>;
    if (action !== 'react') return null;
    if (kind !== 'direct' && kind !== 'group') return null;
    if (!isPositiveInt(messageID)) return null;
    if (kind === 'group') {
        if (!isPositiveInt(groupID)) return null;
        return { kind, messageID, groupID };
    }
    return { kind, messageID };
}

const byCountDesc = (list: ReactionSummary[]): ReactionSummary[] => list.sort((a, b) => b.Count - a.Count);

const finish = (list: ReactionSummary[]): ReactionSummary[] | undefined => (list.length > 0 ? byCountDesc(list) : undefined);

/** Removes one reactor from `emoji`'s chip; `clearMine` also clears the Mine flag. */
const decrement = (list: ReactionSummary[], emoji: string, clearMine: boolean): void => {
    const i = list.findIndex(r => r.Emoji === emoji);
    const chip = list[i];
    if (!chip) return;
    if (chip.Count <= 1) list.splice(i, 1);
    else list[i] = { ...chip, Count: chip.Count - 1, Mine: clearMine ? false : chip.Mine };
};

const increment = (list: ReactionSummary[], emoji: string, mine: boolean): void => {
    const i = list.findIndex(r => r.Emoji === emoji);
    const chip = list[i];
    if (!chip) list.push({ Emoji: emoji, Count: 1, Mine: mine });
    else list[i] = { ...chip, Count: chip.Count + 1, Mine: mine || chip.Mine };
};

/** My current emoji according to the aggregates ('' when none). */
const myEmoji = (reactions: readonly ReactionSummary[] | undefined): string => reactions?.find(r => r.Mine)?.Emoji ?? '';

/** SET my reaction to `emoji` ('' = none). Same reference when it already is that. */
function setMine(reactions: ReactionSummary[] | undefined, emoji: string): ReactionSummary[] | undefined {
    const current = myEmoji(reactions);
    if (current === emoji) return reactions;
    const list = (reactions ?? []).map(r => ({ ...r }));
    if (current) decrement(list, current, true);
    if (emoji) increment(list, emoji, true);
    return finish(list);
}

/** Another user's change as a delta. Same reference when it changes nothing. */
function applyOther(reactions: ReactionSummary[] | undefined, previous: string, next: string): ReactionSummary[] | undefined {
    if (previous === next) return reactions;
    const list = (reactions ?? []).map(r => ({ ...r }));
    if (previous) decrement(list, previous, false);
    if (next) increment(list, next, false);
    return finish(list);
}

function withReactions<T extends ReactionBearing>(message: T, reactions: ReactionSummary[] | undefined): T {
    const copy = { ...message } as T & { reactions?: ReactionSummary[]; Reactions?: ReactionSummary[] };
    if (isCamelMessage(message)) {
        if (reactions) copy.reactions = reactions; else delete copy.reactions;
    } else {
        if (reactions) copy.Reactions = reactions; else delete copy.Reactions;
    }
    return copy;
}

/** Replaces the message with `id` using `fn(reactions)`; same array when unchanged / absent. */
function patch<T extends ReactionBearing>(
    messages: T[], id: number, fn: (r: ReactionSummary[] | undefined) => ReactionSummary[] | undefined,
): T[] {
    const i = messages.findIndex(m => messageIdOf(m) === id);
    const target = messages[i];
    if (!target) return messages;
    const current = bearingReactions(target);
    const next = fn(current);
    if (next === current) return messages;
    const out = messages.slice();
    out[i] = withReactions(target, next);
    return out;
}

/** Applies a `reaction` WS event (set for me, delta for others) to a message list. */
export function applyReaction<T extends ReactionBearing>(messages: T[], event: ReactionEvent, myTelephon: string | undefined): T[] {
    if (event.telephon === myTelephon) return patch(messages, event.messageID, r => setMine(r, event.emoji));
    return patch(messages, event.messageID, r => applyOther(r, event.previousEmoji, event.emoji));
}

/** Optimistic local change of my own reaction ('' removes it). */
export function applyOptimisticReaction<T extends ReactionBearing>(messages: T[], messageID: number, emoji: string): T[] {
    return patch(messages, messageID, r => setMine(r, emoji));
}

/**
 * Rollback of a failed send: reverts ONLY my reaction to `prevMine` (null = none), leaving
 * other users' concurrent changes untouched.
 */
export function revertMine<T extends ReactionBearing>(messages: T[], messageID: number, prevMine: string | null): T[] {
    return patch(messages, messageID, r => setMine(r, prevMine ?? ''));
}

/** My current emoji according to the aggregates (null when none). */
export function currentMine(reactions: readonly ReactionSummary[] | undefined): string | null {
    return myEmoji(reactions) || null;
}

/** One unconfirmed send of mine: the emoji I had before it and when it was sent (epoch ms). */
export interface PendingReaction {
    prevMine: string | null;
    at: number;
}

/** Per-message FIFO of unconfirmed sends. */
export type PendingReactions = Map<string, PendingReaction[]>;

/** Entries older than this are dropped when the queue is touched (safety cap for lost echoes). */
export const PENDING_REACTION_TTL_MS = 15_000;

/** Appends a send to the message's queue (after dropping stale entries). */
export function enqueuePending(pending: PendingReactions, key: string, prevMine: string | null, now: number): void {
    const queue = (pending.get(key) ?? []).filter(e => now - e.at <= PENDING_REACTION_TTL_MS);
    queue.push({ prevMine, at: now });
    pending.set(key, queue);
}

/** Takes the oldest non-stale entry of the message's queue; undefined when none. */
export function shiftPending(pending: PendingReactions, key: string, now: number): PendingReaction | undefined {
    const queue = (pending.get(key) ?? []).filter(e => now - e.at <= PENDING_REACTION_TTL_MS);
    const first = queue.shift();
    if (queue.length > 0) pending.set(key, queue);
    else pending.delete(key);
    return first;
}

/** Reactions of `messageID` in the first list that holds it. */
export function reactionsOf(lists: ReadonlyArray<readonly ReactionBearing[]>, messageID: number): ReactionSummary[] | undefined {
    for (const list of lists) {
        const found = list.find(m => messageIdOf(m) === messageID);
        if (found) return bearingReactions(found);
    }
    return undefined;
}

/** What to send when the user taps `tapped`: my current emoji toggles off ('' = remove), anything else sets. */
export function toggledEmoji(reactions: readonly ReactionSummary[] | undefined, tapped: string): string {
    return myEmoji(reactions) === tapped ? '' : tapped;
}
