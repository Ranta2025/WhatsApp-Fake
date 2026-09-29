/**
 * Merge helpers for paginated message history (1:1 and group).
 *
 * Entries are identified by `MessageID`. Real backend messages carry a numeric
 * id (used as the pagination cursor); synthetic client-only entries (group
 * "member added/left" notices) carry a string id and are never a cursor.
 */

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

/** Smallest numeric MessageID (the "before" cursor); ignores synthetic entries. */
export function oldestRealMessageId(list: readonly MergeableMessage[] | undefined): number | null {
    if (!list) return null;
    let oldest: number | null = null;
    for (const m of list) {
        if (isRealId(m.MessageID) && (oldest === null || m.MessageID < oldest)) oldest = m.MessageID;
    }
    return oldest;
}

/** Adds an older page before the loaded messages; already-loaded copies win. */
export function prependOlder<T extends MergeableMessage>(prev: readonly T[] | undefined, older: readonly T[]): T[] {
    return dedupeAndSort([...(prev ?? []), ...older]);
}

/**
 * Applies a fresh "latest window" from the server without wiping older pages
 * that were already loaded: inside the window the server is the truth (edits
 * refresh, server-side deletions disappear); entries older than the window are
 * kept. An empty window means an empty history.
 */
export function mergeLatestWindow<T extends MergeableMessage>(prev: readonly T[] | undefined, fresh: readonly T[]): T[] {
    if (fresh.length === 0) return [];
    const freshOldestId = oldestRealMessageId(fresh);
    if (freshOldestId === null || !prev || prev.length === 0) return dedupeAndSort([...fresh]);

    const freshOldestTime = Math.min(...fresh.map(m => Date.parse(m.Time)).filter(Number.isFinite));
    const kept = prev.filter(m => (
        isRealId(m.MessageID)
            ? m.MessageID < freshOldestId
            : Date.parse(m.Time) < freshOldestTime
    ));
    return dedupeAndSort([...kept, ...fresh]);
}
