import api from './axios';
import type {
    Sticker, StickerFavoriteItem, StickerLibraryResponse, StickerRecentItem,
} from '../types/api';

/**
 * Sticker library REST client (`/api/v1/stickers/*`).
 *
 * Every response is parsed at runtime (M4b guards): a malformed row is dropped
 * and a malformed single object becomes `null`, so a shape mismatch never
 * throws. Network/HTTP errors still reject.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value !== '';

/** One owned sticker; null when the row is malformed. */
export function parseSticker(raw: unknown): Sticker | null {
    if (!isRecord(raw)) return null;
    const { id, url, sha256, animated, favorite, tags, createdAt } = raw;
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return null;
    if (!isNonEmptyString(url)) return null;
    if (!isNonEmptyString(sha256)) return null;
    if (typeof animated !== 'boolean') return null;
    if (typeof favorite !== 'boolean') return null;
    if (!isNonEmptyString(createdAt)) return null;
    const cleanTags = Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [];
    return { id, url, sha256, animated, favorite, tags: cleanTags, createdAt };
}

/** A favorite row; null when malformed. */
function parseFavoriteItem(raw: unknown): StickerFavoriteItem | null {
    if (!isRecord(raw)) return null;
    const { url, createdAt } = raw;
    if (!isNonEmptyString(url) || !isNonEmptyString(createdAt)) return null;
    return { url, createdAt };
}

/** A recent row; null when malformed. */
function parseRecentItem(raw: unknown): StickerRecentItem | null {
    if (!isRecord(raw)) return null;
    const { url, lastUsedAt } = raw;
    if (!isNonEmptyString(url) || !isNonEmptyString(lastUsedAt)) return null;
    return { url, lastUsedAt };
}

const parseRows = <T>(raw: unknown, parse: (row: unknown) => T | null): T[] =>
    Array.isArray(raw) ? raw.map(parse).filter((row): row is T => row !== null) : [];

/** GET /api/v1/stickers -> { mine, favorites, recents }; malformed rows are dropped. */
export function parseStickerLibrary(raw: unknown): StickerLibraryResponse {
    if (!isRecord(raw)) return { mine: [], favorites: [], recents: [] };
    return {
        mine: parseRows(raw.mine, parseSticker),
        favorites: parseRows(raw.favorites, parseFavoriteItem),
        recents: parseRows(raw.recents, parseRecentItem),
    };
}

/** POST /api/v1/stickers (multipart `file` + optional `tags` CSV). */
export const uploadSticker = async (file: File, tags?: string): Promise<Sticker | null> => {
    const body = new FormData();
    body.append('file', file);
    const cleanTags = tags?.trim();
    if (cleanTags) body.append('tags', cleanTags);
    const { data } = await api.post<unknown>('/api/v1/stickers', body);
    return parseSticker(data);
};

/** POST /api/v1/stickers/save { url }: add a received sticker to "Mis stickers". */
export const saveSticker = async (url: string): Promise<Sticker | null> => {
    const { data } = await api.post<unknown>('/api/v1/stickers/save', { url });
    return parseSticker(data);
};

/** GET /api/v1/stickers. */
export const getStickerLibrary = async (): Promise<StickerLibraryResponse> => {
    const { data } = await api.get<unknown>('/api/v1/stickers');
    return parseStickerLibrary(data);
};

/** PUT /api/v1/stickers/favorites { url, favorite } (204). */
export const setStickerFavorite = async (url: string, favorite: boolean): Promise<void> => {
    await api.put('/api/v1/stickers/favorites', { url, favorite });
};

/** DELETE /api/v1/stickers/:id (204). */
export const deleteSticker = async (id: number): Promise<void> => {
    await api.delete(`/api/v1/stickers/${id}`);
};
