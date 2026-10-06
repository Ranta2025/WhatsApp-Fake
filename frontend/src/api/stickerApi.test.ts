// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();
vi.mock('./axios', () => ({
    default: {
        get: (...args: unknown[]) => mockGet(...args),
        post: (...args: unknown[]) => mockPost(...args),
        put: (...args: unknown[]) => mockPut(...args),
        delete: (...args: unknown[]) => mockDelete(...args),
    },
}));

import {
    getStickerLibrary, uploadSticker, saveSticker, setStickerFavorite, deleteSticker,
} from './stickerApi';

const validSticker = {
    id: 3,
    url: '/storage/bucket/stickers/abc.webp',
    sha256: 'a'.repeat(64),
    animated: false,
    favorite: true,
    tags: ['gato', 'cat'],
    createdAt: '2026-01-01T00:00:00Z',
};

describe('stickerApi', () => {
    beforeEach(() => {
        mockGet.mockReset();
        mockPost.mockReset();
        mockPut.mockReset();
        mockDelete.mockReset();
    });

    it('lists the library and drops malformed rows', async () => {
        mockGet.mockResolvedValue({
            data: {
                mine: [validSticker, { id: 'x' }, null, { ...validSticker, id: 4, url: '' }],
                favorites: [{ url: '/stickers/basic/hola.webp', createdAt: '2026-01-01T00:00:00Z' }, { url: 1 }, 'nope'],
                recents: [{ url: '/x.webp', lastUsedAt: '2026-01-02T00:00:00Z' }, { lastUsedAt: 'z' }],
            },
        });

        const lib = await getStickerLibrary();

        expect(mockGet).toHaveBeenCalledWith('/api/v1/stickers');
        expect(lib.mine).toEqual([validSticker]);
        expect(lib.favorites).toEqual([{ url: '/stickers/basic/hola.webp', createdAt: '2026-01-01T00:00:00Z' }]);
        expect(lib.recents).toEqual([{ url: '/x.webp', lastUsedAt: '2026-01-02T00:00:00Z' }]);
    });

    it('degrades a non-object body to empty lists without throwing', async () => {
        mockGet.mockResolvedValue({ data: null });
        expect(await getStickerLibrary()).toEqual({ mine: [], favorites: [], recents: [] });
        mockGet.mockResolvedValue({ data: { mine: 'nope', favorites: 5, recents: {} } });
        expect(await getStickerLibrary()).toEqual({ mine: [], favorites: [], recents: [] });
    });

    it('uploads multipart with the file and optional tags', async () => {
        mockPost.mockResolvedValue({ data: validSticker });
        const file = new File([new Uint8Array([1, 2, 3])], 's.webp', { type: 'image/webp' });

        const out = await uploadSticker(file, ' gato , cat ');

        expect(mockPost).toHaveBeenCalledTimes(1);
        const [url, body] = mockPost.mock.calls[0] as [string, FormData];
        expect(url).toBe('/api/v1/stickers');
        expect(body).toBeInstanceOf(FormData);
        expect(body.get('file')).toBe(file);
        expect(body.get('tags')).toBe('gato , cat');
        expect(out).toEqual(validSticker);
    });

    it('omits blank tags and returns null on a malformed upload response', async () => {
        mockPost.mockResolvedValue({ data: { id: 'nope' } });
        const file = new File([new Uint8Array([1])], 's.webp', { type: 'image/webp' });

        expect(await uploadSticker(file, '   ')).toBeNull();

        const body = mockPost.mock.calls[0]?.[1] as FormData;
        expect(body.has('tags')).toBe(false);
    });

    it('saves a received sticker by url', async () => {
        mockPost.mockResolvedValue({ data: validSticker });

        const out = await saveSticker('/storage/bucket/stickers/abc.webp');

        expect(mockPost).toHaveBeenCalledWith('/api/v1/stickers/save', { url: '/storage/bucket/stickers/abc.webp' });
        expect(out).toEqual(validSticker);
    });

    it('sets and clears favorites', async () => {
        mockPut.mockResolvedValue({ data: null });

        await setStickerFavorite('/x.webp', true);
        expect(mockPut).toHaveBeenCalledWith('/api/v1/stickers/favorites', { url: '/x.webp', favorite: true });

        await setStickerFavorite('/x.webp', false);
        expect(mockPut).toHaveBeenLastCalledWith('/api/v1/stickers/favorites', { url: '/x.webp', favorite: false });
    });

    it('deletes by id', async () => {
        mockDelete.mockResolvedValue({ data: null });

        await deleteSticker(9);

        expect(mockDelete).toHaveBeenCalledWith('/api/v1/stickers/9');
    });

    it('drops a sticker row with an empty sha256', async () => {
        mockGet.mockResolvedValue({
            data: { mine: [{ ...validSticker, sha256: '' }], favorites: [], recents: [] },
        });

        const lib = await getStickerLibrary();

        expect(lib.mine).toEqual([]);
    });

    it('propagates network and non-2xx failures instead of degrading to null/empty', async () => {
        mockGet.mockRejectedValue(new Error('Network Error'));
        await expect(getStickerLibrary()).rejects.toThrow('Network Error');

        mockPost.mockRejectedValue(new Error('Request failed with status code 500'));
        await expect(saveSticker('/x.webp')).rejects.toThrow('500');
        const file = new File([new Uint8Array([1])], 's.webp', { type: 'image/webp' });
        await expect(uploadSticker(file)).rejects.toThrow('500');

        mockPut.mockRejectedValue(new Error('Request failed with status code 403'));
        await expect(setStickerFavorite('/x.webp', true)).rejects.toThrow('403');

        mockDelete.mockRejectedValue(new Error('Request failed with status code 404'));
        await expect(deleteSticker(1)).rejects.toThrow('404');
    });
});
