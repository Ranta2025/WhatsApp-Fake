import type { ReactionSummary } from '../../../types/api';
import type { ReactionEventPayload } from '../../../types/ws';

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
    MessageID: number | string;
    Time: string;
    Reactions?: ReactionSummary[];
}

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
    const copy: T = { ...message };
    if (reactions) copy.Reactions = reactions;
    else delete copy.Reactions;
    return copy;
}

/** Replaces the message with `id` using `fn(reactions)`; same array when unchanged / absent. */
function patch<T extends ReactionBearing>(
    messages: T[], id: number, fn: (r: ReactionSummary[] | undefined) => ReactionSummary[] | undefined,
): T[] {
    const i = messages.findIndex(m => m.MessageID === id);
    const target = messages[i];
    if (!target) return messages;
    const next = fn(target.Reactions);
    if (next === target.Reactions) return messages;
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

/** Rollback: puts back the pre-send `Reactions` snapshot (undefined = none). */
export function restoreReactions<T extends ReactionBearing>(messages: T[], messageID: number, snapshot: ReactionSummary[] | undefined): T[] {
    return patch(messages, messageID, r => (r === snapshot ? r : snapshot));
}

/** Reactions of `messageID` in the first list that holds it. */
export function reactionsOf(lists: ReadonlyArray<readonly ReactionBearing[]>, messageID: number): ReactionSummary[] | undefined {
    for (const list of lists) {
        const found = list.find(m => m.MessageID === messageID);
        if (found) return found.Reactions;
    }
    return undefined;
}

/** What to send when the user taps `tapped`: my current emoji toggles off ('' = remove), anything else sets. */
export function toggledEmoji(reactions: readonly ReactionSummary[] | undefined, tapped: string): string {
    return myEmoji(reactions) === tapped ? '' : tapped;
}
