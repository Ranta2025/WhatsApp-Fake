import type {
    GlobalSearchChat, GlobalSearchResponse, HighlightRange, SearchPage, SearchResult,
} from '../../../types/api';

/**
 * Runtime guards for the search endpoints. Static types describe the backend
 * contract but do not validate network data (see normalizeResponses.ts): every
 * field is checked here so a malformed element never reaches rendering.
 */

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Length in runes (codepoints), the unit the backend uses for highlight offsets. */
const runeLength = (s: string): number => Array.from(s).length;

const normalizeHighlights = (raw: unknown, snippet: string): HighlightRange[] => {
    if (!Array.isArray(raw)) return [];
    const max = runeLength(snippet);
    const out: HighlightRange[] = [];
    for (const item of raw) {
        if (!Array.isArray(item) || item.length !== 2) continue;
        const [start, end] = item as unknown[];
        if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
        const s = start as number;
        const e = end as number;
        if (s < 0 || e <= s || e > max) continue;
        out.push([s, e]);
    }
    return out;
};

const normalizeResult = (raw: unknown): SearchResult | null => {
    if (!isRecord(raw)) return null;
    const { messageID, time, snippet, highlights } = raw;
    if (typeof messageID !== 'number' || !Number.isFinite(messageID)) return null;
    if (typeof snippet !== 'string') return null;
    return {
        messageID,
        time: typeof time === 'string' ? time : '',
        snippet,
        highlights: normalizeHighlights(highlights, snippet),
    };
};

const normalizeResults = (raw: unknown): SearchResult[] => {
    if (!Array.isArray(raw)) return [];
    const out: SearchResult[] = [];
    for (const item of raw) {
        const r = normalizeResult(item);
        if (r) out.push(r);
    }
    return out;
};

/** `GET .../search` (in-chat): malformed body -> empty page; invalid results are dropped. */
export function normalizeSearchPage(data: unknown): SearchPage {
    if (!isRecord(data)) return { results: [], hasMore: false };
    return {
        results: normalizeResults(data.results),
        hasMore: data.hasMore === true,
    };
}

/** `GET /api/v1/search`: chats with an unknown kind, empty key or no valid results are dropped. */
export function normalizeGlobalSearch(data: unknown): GlobalSearchResponse {
    if (!isRecord(data) || !Array.isArray(data.chats)) return { chats: [] };
    const chats: GlobalSearchChat[] = [];
    for (const raw of data.chats) {
        if (!isRecord(raw)) continue;
        const { kind, key, name, avatarUrl, total } = raw;
        if (kind !== 'direct' && kind !== 'group') continue;
        if (typeof key !== 'string' || key === '') continue;
        const results = normalizeResults(raw.results);
        if (results.length === 0) continue;
        chats.push({
            kind,
            key,
            name: typeof name === 'string' && name !== '' ? name : key,
            avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : '',
            results,
            total: typeof total === 'number' && Number.isFinite(total) && total >= results.length ? total : results.length,
        });
    }
    return { chats };
}
