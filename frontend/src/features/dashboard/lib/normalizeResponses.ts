import type { GroupResponse, GroupMessageResponse, Message } from '../../../types/api';

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
    return Array.isArray(messages) ? (messages as GroupMessageResponse[]) : [];
}

/** `GroupDetail.Messages` (fetchGroupDetail's pre-populated message cache): empty/null -> no messages. */
export function normalizeGroupDetailMessages(data: unknown): GroupMessageResponse[] {
    if (!data || typeof data !== 'object') return [];
    const { Messages } = data as { Messages?: unknown };
    return Array.isArray(Messages) ? (Messages as GroupMessageResponse[]) : [];
}

/**
 * `/api/v1/chat/:contact` (fetchChatMessages / loadOlderMessages): non-array body -> no
 * messages. Entries without a numeric `MessageID` are dropped: the id is the dedupe key
 * and the pagination cursor, so a malformed element must never reach the merge.
 */
export function normalizeChatMessagesResponse(data: unknown): Message[] {
    if (!Array.isArray(data)) return [];
    return data.filter((m): m is Message => (
        !!m && typeof m === 'object' && typeof (m as { MessageID?: unknown }).MessageID === 'number'
    ));
}

/** `hasMore` sibling of `{ messages }` in the group history response; undefined if absent/invalid. */
export function normalizeHasMore(data: unknown): boolean | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const { hasMore } = data as { hasMore?: unknown };
    return typeof hasMore === 'boolean' ? hasMore : undefined;
}
