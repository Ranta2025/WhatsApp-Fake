/**
 * Merge helpers for paginated message history (1:1 and group).
 *
 * Entries are identified by `MessageID`. Real backend messages carry a numeric
 * id (used as the pagination cursor); any malformed/legacy entry with a
 * non-numeric id is never a cursor.
 */

import type { ReactionSummary } from '../../../types/api';

export interface MergeableMessage {
    MessageID: number | string;
    Time: string;
}

/** Local paging state for one chat/group. */
export interface PagingState {
    hasMore: boolean;
    loadingOlder: boolean;
    /** True once at least one older page was loaded (re-syncs must keep its hasMore). */
    olderLoaded: boolean;
}

export const DEFAULT_PAGING: PagingState = { hasMore: false, loadingOlder: false, olderLoaded: false };

const isRealId = (id: number | string): id is number => typeof id === 'number' && Number.isFinite(id);

const compareChronological = (a: MergeableMessage, b: MergeableMessage): number => {
    const ta = Date.parse(a.Time);
    const tb = Date.parse(b.Time);
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
    if (isRealId(a.MessageID) && isRealId(b.MessageID)) return a.MessageID - b.MessageID;
    return 0;
};

/** Removes duplicated ids keeping the first occurrence, then sorts chronologically. */
const dedupeAndSort = <T extends MergeableMessage>(list: T[]): T[] => {
    const seen = new Set<number | string>();
    const unique: T[] = [];
    for (const item of list) {
        if (seen.has(item.MessageID)) continue;
        seen.add(item.MessageID);
        unique.push(item);
    }
    return unique.sort(compareChronological);
};

/** Smallest numeric MessageID (the "before" cursor); ignores non-numeric ids. */
export function oldestRealMessageId(list: readonly MergeableMessage[] | undefined): number | null {
    if (!list) return null;
    let oldest: number | null = null;
    for (const m of list) {
        if (isRealId(m.MessageID) && (oldest === null || m.MessageID < oldest)) oldest = m.MessageID;
    }
    return oldest;
}

/** Largest numeric MessageID (the "after" cursor); ignores non-numeric ids. */
export function newestRealMessageId(list: readonly MergeableMessage[] | undefined): number | null {
    if (!list) return null;
    let newest: number | null = null;
    for (const m of list) {
        if (isRealId(m.MessageID) && (newest === null || m.MessageID > newest)) newest = m.MessageID;
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
    return a.every((r, i) => r.Emoji === b[i]?.Emoji && r.Count === b[i]?.Count && r.Mine === b[i]?.Mine);
};

/**
 * Pages fetched from the server may overlap messages that are already loaded.
 * The loaded copy keeps winning for every field (a live edit must not be rolled
 * back by a slightly older page), EXCEPT `Reactions`: the incoming server value
 * replaces it (including "no reactions"), so a stale optimistic chip never survives
 * a refetch. Same objects/array when nothing differs.
 */
export function adoptServerReactions<T extends MergeableMessage>(loaded: readonly T[], incoming: readonly T[]): T[] {
    const fresh = new Map<number | string, T>();
    for (const m of incoming) fresh.set(m.MessageID, m);
    return loaded.map(m => {
        const server = fresh.get(m.MessageID);
        if (!server) return m;
        const current = (m as T & { Reactions?: ReactionSummary[] }).Reactions;
        const next = (server as T & { Reactions?: ReactionSummary[] }).Reactions;
        if (sameReactions(current, next)) return m;
        const copy = { ...m } as T & { Reactions?: ReactionSummary[] };
        if (next) copy.Reactions = next; else delete copy.Reactions;
        return copy;
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
    return prev.some(m => m.MessageID === freshOldestId);
}

/**
 * Applies a fresh "latest window" from the server without wiping older pages
 * that were already loaded: inside the window the server is the truth (edits
 * refresh, server-side deletions disappear); entries older than the window are
 * kept ONLY when `isContiguousWindow` holds. If not, the older block is dropped
 * (result = fresh window) so no id range is silently skipped; callers must then
 * reset paging (see `isContiguousWindow`). `windowHasMore=false` marks the window
 * as the full history. An empty window means an empty history.
 */
export function mergeLatestWindow<T extends MergeableMessage>(
    prev: readonly T[] | undefined,
    fresh: readonly T[],
    windowHasMore = true,
): T[] {
    if (fresh.length === 0) return [];
    const freshOldestId = oldestRealMessageId(fresh);
    if (freshOldestId === null || !prev || prev.length === 0) return dedupeAndSort([...fresh]);
    if (!isContiguousWindow(prev, fresh, windowHasMore)) return dedupeAndSort([...fresh]);

    const freshOldestTime = Math.min(...fresh.map(m => Date.parse(m.Time)).filter(Number.isFinite));
    const kept = prev.filter(m => (
        isRealId(m.MessageID)
            ? m.MessageID < freshOldestId
            : Date.parse(m.Time) < freshOldestTime
    ));
    return dedupeAndSort([...kept, ...fresh]);
}
