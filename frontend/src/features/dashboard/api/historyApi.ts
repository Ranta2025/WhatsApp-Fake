import api from '../../../api/axios';
import type { GroupMessageResponse, Message } from '../../../types/api';
import { normalizeChatMessagesResponse, normalizeGroupMessagesResponse, normalizeHasMore } from '../lib/normalizeResponses';

/** Default size of an around/after/before page used to navigate to a message. */
export const WINDOW_LIMIT = 50;

export interface HistoryWindow<T> {
    messages: T[];
    hasMoreOlder: boolean;
    hasMoreNewer: boolean;
}

/**
 * Reads a boolean flag from a response header; `undefined` when absent or not
 * exposed (cross-origin without Access-Control-Expose-Headers). axios lowercases names.
 */
const readFlag = (headers: unknown, name: string): boolean | undefined => {
    if (!headers || typeof headers !== 'object') return undefined;
    const raw = (headers as Record<string, unknown>)[name];
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return undefined;
};

/** Reads a boolean sibling of `messages` in a group response body. */
const readBodyFlag = (data: unknown, name: string): boolean | undefined => {
    if (!data || typeof data !== 'object') return undefined;
    const value = (data as Record<string, unknown>)[name];
    return typeof value === 'boolean' ? value : undefined;
};

// Unknown flags are assumed "more available": the next page then comes back empty
// and the caller ends that direction (see extendOlder/extendNewer).

// ── 1:1 ─────────────────────────────────────────────────────────────────────

/** Window centered on `around` (about limit/2 per side). 404 when the message is not visible. */
export async function getChatWindowAround(contact: string, around: number, limit = WINDOW_LIMIT): Promise<HistoryWindow<Message>> {
    const { data, headers } = await api.get<unknown>(`/api/v1/chat/${contact}`, { params: { around, limit } });
    return {
        messages: normalizeChatMessagesResponse(data),
        hasMoreOlder: readFlag(headers, 'x-has-more-older') ?? true,
        hasMoreNewer: readFlag(headers, 'x-has-more-newer') ?? true,
    };
}

/** Messages after `after`, chronological. */
export async function getChatAfter(contact: string, after: number, limit = WINDOW_LIMIT): Promise<{ messages: Message[]; hasMoreNewer: boolean }> {
    const { data, headers } = await api.get<unknown>(`/api/v1/chat/${contact}`, { params: { after, limit } });
    return { messages: normalizeChatMessagesResponse(data), hasMoreNewer: readFlag(headers, 'x-has-more-newer') ?? true };
}

/** Page of messages before `before`, chronological. */
export async function getChatBefore(contact: string, before: number, limit = WINDOW_LIMIT): Promise<{ messages: Message[]; hasMore: boolean }> {
    const { data, headers } = await api.get<unknown>(`/api/v1/chat/${contact}`, { params: { before, limit } });
    const messages = normalizeChatMessagesResponse(data);
    return { messages, hasMore: readFlag(headers, 'x-has-more') ?? messages.length >= limit };
}

// ── Grupos ──────────────────────────────────────────────────────────────────

/** Window centered on `around`. 404 when the message is not in the group, 403 for non-members. */
export async function getGroupWindowAround(groupID: number, around: number, limit = WINDOW_LIMIT): Promise<HistoryWindow<GroupMessageResponse>> {
    const { data } = await api.get<unknown>(`/api/v1/group/${groupID}/message`, { params: { around, limit } });
    return {
        messages: normalizeGroupMessagesResponse(data),
        hasMoreOlder: readBodyFlag(data, 'hasMoreOlder') ?? normalizeHasMore(data) ?? true,
        hasMoreNewer: readBodyFlag(data, 'hasMoreNewer') ?? true,
    };
}

/** Messages after `after`, chronological. */
export async function getGroupAfter(groupID: number, after: number, limit = WINDOW_LIMIT): Promise<{ messages: GroupMessageResponse[]; hasMoreNewer: boolean }> {
    const { data } = await api.get<unknown>(`/api/v1/group/${groupID}/message`, { params: { after, limit } });
    return { messages: normalizeGroupMessagesResponse(data), hasMoreNewer: readBodyFlag(data, 'hasMoreNewer') ?? true };
}

/** Page of messages before `before` (the backend returns them newest first; callers sort). */
export async function getGroupBefore(groupID: number, before: number, limit = WINDOW_LIMIT): Promise<{ messages: GroupMessageResponse[]; hasMore: boolean }> {
    const { data } = await api.get<unknown>(`/api/v1/group/${groupID}/message`, { params: { before, limit, offset: 0 } });
    const messages = normalizeGroupMessagesResponse(data);
    return { messages, hasMore: normalizeHasMore(data) ?? messages.length >= limit };
}
