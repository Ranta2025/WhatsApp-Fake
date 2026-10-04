import api from '../../../api/axios';
import type { GlobalSearchResponse, SearchPage } from '../../../types/api';
import { normalizeSearchPage, normalizeGlobalSearch } from '../lib/normalizeSearch';

export interface SearchPageOptions {
    /** Cursor: only matches with id < before (older page). */
    before?: number;
    limit?: number;
    signal?: AbortSignal;
}

export interface GlobalSearchOptions {
    /** Max number of chats. */
    limit?: number;
    /** Max matches per chat. */
    perChat?: number;
    signal?: AbortSignal;
}

const definedParams = (params: Record<string, string | number | undefined>): Record<string, string | number> => {
    const out: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) out[key] = value;
    }
    return out;
};

/** In-chat search of a 1:1 conversation (newest match first). */
export async function searchChat(contact: string, q: string, opts: SearchPageOptions = {}): Promise<SearchPage> {
    const { data } = await api.get<unknown>(`/api/v1/chat/${contact}/search`, {
        params: definedParams({ q, before: opts.before, limit: opts.limit }),
        signal: opts.signal,
    });
    return normalizeSearchPage(data);
}

/** In-chat search of a group (members only; newest match first). */
export async function searchGroup(groupID: number, q: string, opts: SearchPageOptions = {}): Promise<SearchPage> {
    const { data } = await api.get<unknown>(`/api/v1/group/${groupID}/message/search`, {
        params: definedParams({ q, before: opts.before, limit: opts.limit }),
        signal: opts.signal,
    });
    return normalizeSearchPage(data);
}

/** Global search across every chat and group of the user. */
export async function searchAll(q: string, opts: GlobalSearchOptions = {}): Promise<GlobalSearchResponse> {
    const { data } = await api.get<unknown>('/api/v1/search', {
        params: definedParams({ q, limit: opts.limit, perChat: opts.perChat }),
        signal: opts.signal,
    });
    return normalizeGlobalSearch(data);
}
