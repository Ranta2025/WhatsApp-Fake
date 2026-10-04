import { adoptServerReactions, newestRealMessageId, sortUnique, type MergeableMessage } from './mergeMessages';

/**
 * A "detached" slice of a chat's history, opened to jump to a message that is
 * not in the normally loaded (latest) list. It lives OUTSIDE messagesByChat /
 * groupMessages on purpose: `mergeLatestWindow` assumes the normal list always
 * ends at the latest message, and feeding it a window from the middle of the
 * history would corrupt pagination (holes, wrong cursors).
 */
export interface FocusedWindow<T extends MergeableMessage> {
    /** Chronological, deduped. */
    messages: T[];
    hasMoreOlder: boolean;
    hasMoreNewer: boolean;
    /** Message to scroll to / highlight. */
    targetId: number;
    /** Bumped on every (re)focus so the same target can be scrolled to again. */
    seq: number;
    loadingOlder: boolean;
    loadingNewer: boolean;
}

export function createFocusedWindow<T extends MergeableMessage>(
    messages: readonly T[],
    flags: { hasMoreOlder: boolean; hasMoreNewer: boolean },
    targetId: number,
    seq: number,
): FocusedWindow<T> {
    return {
        messages: sortUnique(messages),
        hasMoreOlder: flags.hasMoreOlder,
        hasMoreNewer: flags.hasMoreNewer,
        targetId,
        seq,
        loadingOlder: false,
        loadingNewer: false,
    };
}

export function windowHasMessage<T extends MergeableMessage>(win: FocusedWindow<T>, id: number): boolean {
    return win.messages.some(m => m.MessageID === id);
}

/** Points the window at another message it already contains (no refetch). */
export function refocus<T extends MergeableMessage>(win: FocusedWindow<T>, targetId: number): FocusedWindow<T> {
    return { ...win, targetId, seq: win.seq + 1 };
}

/** Adds an older page (already-loaded copies win, except Reactions: the server value replaces them); an empty page ends that direction. */
export function extendOlder<T extends MergeableMessage>(
    win: FocusedWindow<T>, older: readonly T[], hasMoreOlder: boolean,
): FocusedWindow<T> {
    return {
        ...win,
        messages: sortUnique([...adoptServerReactions(win.messages, older), ...older]),
        hasMoreOlder: older.length > 0 && hasMoreOlder,
        loadingOlder: false,
    };
}

/** Adds a newer page (already-loaded copies win, except Reactions: the server value replaces them); an empty page ends that direction. */
export function extendNewer<T extends MergeableMessage>(
    win: FocusedWindow<T>, newer: readonly T[], hasMoreNewer: boolean,
): FocusedWindow<T> {
    return {
        ...win,
        messages: sortUnique([...adoptServerReactions(win.messages, newer), ...newer]),
        hasMoreNewer: newer.length > 0 && hasMoreNewer,
        loadingNewer: false,
    };
}

/**
 * What to render while detached. Live messages only land in the normal list;
 * once the window has caught up with the server tail (no more newer messages)
 * the live ones after its end are appended so the view keeps following the chat.
 */
export function composeFocusedMessages<T extends MergeableMessage>(
    win: FocusedWindow<T>, live: readonly T[] | undefined,
): T[] {
    if (win.hasMoreNewer || !live || live.length === 0) return win.messages;
    const newestId = newestRealMessageId(win.messages);
    const last = win.messages[win.messages.length - 1];
    const lastTime = last ? Date.parse(last.Time) : Number.NaN;
    const tail = live.filter(m => (
        typeof m.MessageID === 'number'
            ? newestId === null || m.MessageID > newestId
            : Date.parse(m.Time) > lastTime
    ));
    return tail.length === 0 ? win.messages : sortUnique([...win.messages, ...tail]);
}

/** Applies an in-place edit/status change to the window; same object when nothing changed. */
export function updateFocusedMessages<T extends MergeableMessage>(
    win: FocusedWindow<T>, fn: (m: T) => T,
): FocusedWindow<T> {
    let changed = false;
    const messages = win.messages.map(m => {
        const next = fn(m);
        if (next !== m) changed = true;
        return next;
    });
    return changed ? { ...win, messages } : win;
}

/** Removes a message deleted for everyone; same object when it is not in the window. */
export function removeFocusedMessage<T extends MergeableMessage>(win: FocusedWindow<T>, id: number): FocusedWindow<T> {
    if (!windowHasMessage(win, id)) return win;
    return { ...win, messages: win.messages.filter(m => m.MessageID !== id) };
}
