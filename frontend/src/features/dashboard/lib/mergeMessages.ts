/**
 * Merge helpers for paginated message history (1:1 and group).
 *
 * Entries are identified by their message id. Real backend messages carry a
 * numeric id (used as the pagination cursor); any malformed/legacy entry with a
 * non-numeric id is never a cursor.
 *
 * Casing (api-casing cutover complete): both 1:1 and group messages use
 * camelCase keys (`messageID`, `time`, `reactions`). These helpers are shared
 * by both domains, so they still read through `messageIdOf`/`messageTimeOf`
 * and tolerate either casing (cached/stale payloads); new code uses camel.
 */

import type { ReactionSummary } from '../../../types/api';

export interface MergeableMessage {
    MessageID?: number | string;
    messageID?: number | string;
    Time?: string;
    time?: string;
}

/** Message id of a chat entry (camel; tolerates legacy Pascal). */
export const messageIdOf = (m: MergeableMessage): number | string | undefined =>
    m.messageID !== undefined ? m.messageID : m.MessageID;

/** Timestamp of a chat entry (camel; tolerates legacy Pascal). */
export const messageTimeOf = (m: MergeableMessage): string | undefined =>
    m.time !== undefined ? m.time : m.Time;

/** True when the entry carries the camelCase (1:1) shape. */
export const isCamelMessage = (m: MergeableMessage): boolean => m.messageID !== undefined;

type ReactionsCarrier = { reactions?: ReactionSummary[]; Reactions?: ReactionSummary[] };

/** Reactions of a chat entry (camel; tolerates legacy Pascal). */
export const messageReactionsOf = (m: MergeableMessage): ReactionSummary[] | undefined => {
    const carrier = m as MergeableMessage & ReactionsCarrier;
    return carrier.reactions !== undefined ? carrier.reactions : carrier.Reactions;
};

/** Copy of `m` with its Reactions replaced/removed on the matching casing key. */
export const withMessageReactions = <T extends MergeableMessage>(
    m: T,
    reactions: ReactionSummary[] | undefined,
): T => {
    const copy = { ...m } as T & ReactionsCarrier;
    if (isCamelMessage(m)) {
        if (reactions) copy.reactions = reactions; else delete copy.reactions;
    } else {
        if (reactions) copy.Reactions = reactions; else delete copy.Reactions;
    }
    return copy as T;
};

/** Local paging state for one chat/group. */
export interface PagingState {
    hasMore: boolean;
    loadingOlder: boolean;
    /** True once at least one older page was loaded (re-syncs must keep its hasMore). */
    olderLoaded: boolean;
}

export const DEFAULT_PAGING: PagingState = { hasMore: false, loadingOlder: false, olderLoaded: false };

const isRealId = (id: number | string | undefined): id is number => typeof id === 'number' && Number.isFinite(id);

const compareChronological = (a: MergeableMessage, b: MergeableMessage): number => {
    const ta = Date.parse(messageTimeOf(a) ?? '');
    const tb = Date.parse(messageTimeOf(b) ?? '');
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
    const ia = messageIdOf(a);
    const ib = messageIdOf(b);
    if (isRealId(ia) && isRealId(ib)) return ia - ib;
    return 0;
};

/** Removes duplicated ids keeping the first occurrence, then sorts chronologically. */
const dedupeAndSort = <T extends MergeableMessage>(list: T[]): T[] => {
    const seen = new Set<number | string>();
    const unique: T[] = [];
    for (const item of list) {
        const id = messageIdOf(item);
        if (id !== undefined) {
            if (seen.has(id)) continue;
            seen.add(id);
        }
        unique.push(item);
    }
    return unique.sort(compareChronological);
};

/** Smallest numeric MessageID (the "before" cursor); ignores non-numeric ids. */
export function oldestRealMessageId(list: readonly MergeableMessage[] | undefined): number | null {
    if (!list) return null;
    let oldest: number | null = null;
    for (const m of list) {
        const id = messageIdOf(m);
        if (isRealId(id) && (oldest === null || id < oldest)) oldest = id;
    }
    return oldest;
}

/** Largest numeric MessageID (the "after" cursor); ignores non-numeric ids. */
export function newestRealMessageId(list: readonly MergeableMessage[] | undefined): number | null {
    if (!list) return null;
    let newest: number | null = null;
    for (const m of list) {
        const id = messageIdOf(m);
        if (isRealId(id) && (newest === null || id > newest)) newest = id;
    }
    return newest;
}

/** Dedupes by id (first occurrence wins) and sorts chronologically. */
export function sortUnique<T extends MergeableMessage>(list: readonly T[]): T[] {
    return dedupeAndSort([...list]);
}

const sameReactions = (a: readonly ReactionSummary[] | undefined, b: readonly ReactionSummary[] | undefined): boolean => {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    return a.every((r, i) => r.emoji === b[i]?.emoji && r.count === b[i]?.count && r.mine === b[i]?.mine);
};

/**
 * Pages fetched from the server may overlap messages that are already loaded.
 * The loaded copy keeps winning for every field (a live edit must not be rolled
 * back by a slightly older page), EXCEPT `Reactions`: the incoming server value
 * replaces it (including "no reactions"), so a stale optimistic chip never survives
 * a refetch. Same objects/array when nothing differs.
 */
export function adoptServerReactions<T extends MergeableMessage>(loaded: readonly T[], incoming: readonly T[]): T[] {
    const fresh = new Map<number | string | undefined, T>();
    for (const m of incoming) fresh.set(messageIdOf(m), m);
    return loaded.map(m => {
        const server = fresh.get(messageIdOf(m));
        if (!server) return m;
        const current = messageReactionsOf(m);
        const next = messageReactionsOf(server);
        if (sameReactions(current, next)) return m;
        return withMessageReactions(m, next);
    });
}

/** Adds an older page before the loaded messages; already-loaded copies win (except Reactions, see adoptServerReactions). */
export function prependOlder<T extends MergeableMessage>(prev: readonly T[] | undefined, older: readonly T[]): T[] {
    return dedupeAndSort([...adoptServerReactions(prev ?? [], older), ...older]);
}

/**
 * True when merging `fresh` (the latest window) onto `prev` cannot leave a hole.
 * Contiguous when: there is nothing loaded yet; the server window is the complete
 * history (`windowHasMore === false`, nothing older can be missing); or `prev`
 * already holds the window's oldest real id (the ranges overlap, so the window
 * covers everything from that id up). Any other newer id in `prev` is not enough:
 * a live message received after a reconnect sits above a possible hole. Ids are
 * global serials, so adjacency cannot be inferred from id values alone.
 */
export function isContiguousWindow(
    prev: readonly MergeableMessage[] | undefined,
    fresh: readonly MergeableMessage[],
    windowHasMore = true,
): boolean {
    if (!prev || prev.length === 0 || fresh.length === 0 || !windowHasMore) return true;
    const freshOldestId = oldestRealMessageId(fresh);
    if (freshOldestId === null) return true;
    return prev.some(m => messageIdOf(m) === freshOldestId);
}

/**
 * Applies a fresh "latest window" from the server without wiping pages that
 * were already loaded: inside the window the server is the truth (edits
 * refresh, server-side deletions disappear); entries older than the window are
 * kept ONLY when `isContiguousWindow` holds. If not, the loaded block is dropped
 * (result = fresh window) so no id range is silently skipped; callers must then
 * reset paging (see `isContiguousWindow`). Live entries NEWER than the window
 * (e.g. a sender echo inserted by the socket before a stale/short resync lands)
 * are always preserved, so a stale page cannot discard them: alongside the kept
 * older pages when the window is contiguous, and on their own when it is not
 * but `prev` holds no page older than the window (a mixed block with a hole is
 * dropped whole). The time comparison is the equivalent for non-numeric
 * (synthetic) ids. `windowHasMore=false` marks the window as the full history.
 * An empty window means an empty history.
 */
export function mergeLatestWindow<T extends MergeableMessage>(
    prev: readonly T[] | undefined,
    fresh: readonly T[],
    windowHasMore = true,
): T[] {
    if (fresh.length === 0) return [];
    const freshOldestId = oldestRealMessageId(fresh);
    if (freshOldestId === null || !prev || prev.length === 0) return dedupeAndSort([...fresh]);

    const freshNewestId = newestRealMessageId(fresh);
    const freshTimes = fresh.map(m => Date.parse(messageTimeOf(m) ?? '')).filter(Number.isFinite);
    const freshOldestTime = Math.min(...freshTimes);
    const freshNewestTime = Math.max(...freshTimes);
    const isOlderThanWindow = (m: T): boolean => {
        const id = messageIdOf(m);
        return isRealId(id) ? id < freshOldestId : Date.parse(messageTimeOf(m) ?? '') < freshOldestTime;
    };
    const isNewerThanWindow = (m: T): boolean => {
        const id = messageIdOf(m);
        if (isRealId(id)) return freshNewestId !== null && id > freshNewestId;
        const t = Date.parse(messageTimeOf(m) ?? '');
        return Number.isFinite(t) && t > freshNewestTime;
    };

    if (!isContiguousWindow(prev, fresh, windowHasMore)) {
        // The loaded block does not reach the window (there is a hole), so it is
        // dropped and the window becomes the truth. A live entry newer than the
        // whole window is not part of that block and must survive a stale/short
        // page — but only when `prev` carries no older page at all: a mixed block
        // is dropped whole so no id range is silently skipped.
        return prev.some(isOlderThanWindow)
            ? dedupeAndSort([...fresh])
            : dedupeAndSort([...prev.filter(isNewerThanWindow), ...fresh]);
    }

    const kept = prev.filter(m => isOlderThanWindow(m) || isNewerThanWindow(m));
    return dedupeAndSort([...kept, ...fresh]);
}
