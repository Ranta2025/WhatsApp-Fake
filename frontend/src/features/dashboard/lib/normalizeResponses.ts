import type {
    GroupResponse, GroupMessageResponse, GroupMemberBrief, GroupMessageReceipts, Message,
    ReactionSummary, ReactionUser, MessageReactionsResponse,
} from '../../../types/api';

/**
 * Static types describe the backend contract, they do not validate runtime
 * network data. The REST wrappers below (`{ groups: [...] }`, `{ messages:
 * [...] }`) are declared non-nullable in `types/api.ts`, but the JS version
 * of DashboardContext still guarded every field with `data?.X` before
 * falling back to `[]` (empty/null body, e.g. a 204 or a malformed
 * response). These pure normalizers restore that tolerance and are the
 * single place the guard lives, instead of repeating `data?.` at each call
 * site.
 */

/**
 * `Reactions` of a message: keeps entries with a non-empty string `Emoji`, an
 * integer `Count` > 0 and a boolean `Mine` (first occurrence per emoji); anything
 * else is dropped, never thrown. Returns undefined when nothing valid remains
 * (the backend omits the field when there are no reactions).
 */
export function normalizeReactions(data: unknown): ReactionSummary[] | undefined {
    if (!Array.isArray(data)) return undefined;
    const seen = new Set<string>();
    const out: ReactionSummary[] = [];
    for (const item of data) {
        if (!item || typeof item !== 'object') continue;
        const { Emoji, Count, Mine } = item as { Emoji?: unknown; Count?: unknown; Mine?: unknown };
        if (typeof Emoji !== 'string' || Emoji === '' || seen.has(Emoji)) continue;
        if (typeof Count !== 'number' || !Number.isInteger(Count) || Count <= 0) continue;
        if (typeof Mine !== 'boolean') continue;
        seen.add(Emoji);
        out.push({ Emoji, Count, Mine });
    }
    return out.length > 0 ? out : undefined;
}

/** Sanitizes `Reactions` on one message; same object when it has none (the common case). */
const withNormalizedReactions = <T extends object>(message: T): T => {
    // 1:1 messages carry `reactions` (camel, AC4); group messages still `Reactions` (AC5).
    if ('reactions' in message) {
        const { reactions, ...rest } = message as T & { reactions?: unknown };
        const clean = normalizeReactions(reactions);
        return (clean ? { ...rest, reactions: clean } : rest) as T;
    }
    if ('Reactions' in message) {
        const { Reactions, ...rest } = message as T & { Reactions?: unknown };
        const clean = normalizeReactions(Reactions);
        return (clean ? { ...rest, Reactions: clean } : rest) as T;
    }
    return message;
};

/** Sanitizes Reactions on every element; returns the SAME array when no element changed. */
const normalizeMessageList = <T extends object>(list: unknown[]): T[] => {
    let changed = false;
    const out = list.map(m => {
        if (!m || typeof m !== 'object') return m as T;
        const next = withNormalizedReactions(m as T);
        if (next !== m) changed = true;
        return next;
    });
    return changed ? out : list as T[];
};

/** `GET .../reactions`: malformed groups/users are dropped; users default to telephon / empty avatar. */
export function normalizeReactionUsers(data: unknown): MessageReactionsResponse {
    const raw = data && typeof data === 'object' ? (data as { reactions?: unknown }).reactions : undefined;
    if (!Array.isArray(raw)) return { reactions: [] };
    const reactions: MessageReactionsResponse['reactions'] = [];
    for (const group of raw) {
        if (!group || typeof group !== 'object') continue;
        const { emoji, users } = group as { emoji?: unknown; users?: unknown };
        if (typeof emoji !== 'string' || emoji === '' || !Array.isArray(users)) continue;
        const clean: ReactionUser[] = [];
        for (const u of users) {
            if (!u || typeof u !== 'object') continue;
            const { telephon, username, avatarUrl } = u as { telephon?: unknown; username?: unknown; avatarUrl?: unknown };
            if (typeof telephon !== 'string' || telephon === '') continue;
            clean.push({
                telephon,
                username: typeof username === 'string' && username !== '' ? username : telephon,
                avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : '',
            });
        }
        if (clean.length > 0) reactions.push({ emoji, users: clean });
    }
    return { reactions };
}

/** `/api/v1/group` (fetchUserGroups): empty/null body -> no groups. */
export function normalizeGroupsResponse(data: unknown): GroupResponse[] {
    if (!data || typeof data !== 'object') return [];
    const { groups } = data as { groups?: unknown };
    return Array.isArray(groups) ? (groups as GroupResponse[]) : [];
}

/** `/api/v1/group/:id/message` (fetchGroupMessages): empty/null body -> no messages. */
export function normalizeGroupMessagesResponse(data: unknown): GroupMessageResponse[] {
    if (!data || typeof data !== 'object') return [];
    const { messages } = data as { messages?: unknown };
    return Array.isArray(messages) ? normalizeMessageList<GroupMessageResponse>(messages) : [];
}

/** `GroupDetail.Messages` (fetchGroupDetail's pre-populated message cache): empty/null -> no messages. */
export function normalizeGroupDetailMessages(data: unknown): GroupMessageResponse[] {
    if (!data || typeof data !== 'object') return [];
    const { Messages } = data as { Messages?: unknown };
    return Array.isArray(Messages) ? normalizeMessageList<GroupMessageResponse>(Messages) : [];
}

/**
 * `/api/v1/chat/:contact` (fetchChatMessages / loadOlderMessages): non-array body -> no
 * messages. Entries without a numeric `messageID` are dropped: the id is the dedupe key
 * and the pagination cursor, so a malformed element must never reach the merge.
 */
export function normalizeChatMessagesResponse(data: unknown): Message[] {
    if (!Array.isArray(data)) return [];
    return data
        .filter((m): m is Message => (
            !!m && typeof m === 'object' && typeof (m as { messageID?: unknown }).messageID === 'number'
        ))
        .map(withNormalizedReactions);
}

/** `hasMore` sibling of `{ messages }` in the group history response; undefined if absent/invalid. */
export function normalizeHasMore(data: unknown): boolean | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const { hasMore } = data as { hasMore?: unknown };
    return typeof hasMore === 'boolean' ? hasMore : undefined;
}

const normalizeBriefs = (list: unknown): GroupMemberBrief[] => {
    if (!Array.isArray(list)) return [];
    const out: GroupMemberBrief[] = [];
    for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const { telephon, username, avatarUrl } = item as { telephon?: unknown; username?: unknown; avatarUrl?: unknown };
        if (typeof telephon !== 'string' || telephon === '') continue;
        out.push({
            telephon,
            username: typeof username === 'string' && username !== '' ? username : telephon,
            ...(typeof avatarUrl === 'string' && avatarUrl !== '' ? { avatarUrl } : {}),
        });
    }
    return out;
};

/** `GET .../message/:id/receipts`: each list degrades to [] when absent/invalid; malformed members are dropped. */
export function normalizeGroupReceipts(data: unknown): GroupMessageReceipts {
    const body = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    return {
        readBy: normalizeBriefs(body.readBy),
        deliveredTo: normalizeBriefs(body.deliveredTo),
        pending: normalizeBriefs(body.pending),
    };
}
