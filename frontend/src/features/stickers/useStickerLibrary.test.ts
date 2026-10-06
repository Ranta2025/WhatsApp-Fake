// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
    useStickerLibrary, type StickerLibraryState, type UseStickerLibraryOptions,
} from './useStickerLibrary';
import type { Sticker, StickerLibraryResponse } from '../../types/api';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const sticker = (over: Partial<Sticker> = {}): Sticker => ({
    id: 1,
    url: '/storage/bucket/stickers/a.webp',
    sha256: 'a'.repeat(64),
    animated: false,
    favorite: false,
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
});

const library = (over: Partial<StickerLibraryResponse> = {}): StickerLibraryResponse => ({
    mine: [],
    favorites: [],
    recents: [],
    ...over,
});

describe('useStickerLibrary', () => {
    let host: HTMLDivElement;
    let root: Root;
    let state: StickerLibraryState;
    const api = {
        getStickerLibrary: vi.fn<() => Promise<StickerLibraryResponse>>(),
        setStickerFavorite: vi.fn<(url: string, favorite: boolean) => Promise<void>>(),
        deleteSticker: vi.fn<(id: number) => Promise<void>>(),
        saveSticker: vi.fn<(url: string) => Promise<Sticker | null>>(),
    };

    function Harness({ opts, onState }: { opts: UseStickerLibraryOptions; onState: (s: StickerLibraryState) => void }) {
        onState(useStickerLibrary(opts));
        return null;
    }

    const capture = (s: StickerLibraryState) => { state = s; };

    const mount = (opts: UseStickerLibraryOptions = { api }) =>
        act(() => { root.render(createElement(Harness, { opts, onState: capture })); });

    beforeEach(() => {
        api.getStickerLibrary.mockReset();
        api.setStickerFavorite.mockReset();
        api.deleteSticker.mockReset();
        api.saveSticker.mockReset();
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });

    it('loads the library once and serves the cache afterwards', async () => {
        api.getStickerLibrary.mockResolvedValue(library({ mine: [sticker()] }));
        mount();

        await act(async () => { await state.load(); });

        expect(api.getStickerLibrary).toHaveBeenCalledTimes(1);
        expect(state.mine).toEqual([sticker()]);
        expect(state.status).toBe('ready');

        await act(async () => { await state.load(); });
        await act(async () => { await state.load(); });

        expect(api.getStickerLibrary).toHaveBeenCalledTimes(1);
    });

    it('fetches on the first open and shares one in-flight request', async () => {
        let resolveLib!: (value: StickerLibraryResponse) => void;
        api.getStickerLibrary.mockReturnValue(new Promise((resolve) => { resolveLib = resolve; }));
        mount({ api, enabled: true });

        const first = state.load();
        const second = state.load();
        expect(first).toBe(second);

        await act(async () => {
            resolveLib(library({ mine: [sticker()] }));
            await first;
            await second;
        });

        expect(api.getStickerLibrary).toHaveBeenCalledTimes(1);
        expect(state.status).toBe('ready');
        expect(state.mine).toEqual([sticker()]);
    });

    it('keeps the error status and allows a retry after a failed fetch', async () => {
        api.getStickerLibrary.mockRejectedValueOnce(new Error('offline'));
        mount();

        await act(async () => { await state.load(); });
        expect(state.status).toBe('error');

        api.getStickerLibrary.mockResolvedValueOnce(library({ mine: [sticker()] }));
        await act(async () => { await state.load(); });

        expect(api.getStickerLibrary).toHaveBeenCalledTimes(2);
        expect(state.status).toBe('ready');
        expect(state.mine).toEqual([sticker()]);
    });

    it('applies a favorite optimistically and keeps it on success', async () => {
        api.getStickerLibrary.mockResolvedValue(library({ mine: [sticker({ favorite: false })] }));
        mount();
        await act(async () => { await state.load(); });
        api.setStickerFavorite.mockResolvedValue(undefined);

        let ok = false;
        await act(async () => { ok = await state.toggleFavorite(sticker().url, true); });

        expect(ok).toBe(true);
        expect(api.setStickerFavorite).toHaveBeenCalledWith(sticker().url, true);
        expect(state.mine[0]?.favorite).toBe(true);
        expect(state.favorites.map((f) => f.url)).toEqual([sticker().url]);
    });

    it('rolls the optimistic favorite back when the request fails', async () => {
        api.getStickerLibrary.mockResolvedValue(library({ mine: [sticker({ favorite: false })] }));
        mount();
        await act(async () => { await state.load(); });
        api.setStickerFavorite.mockRejectedValue(new Error('nope'));

        let ok = true;
        await act(async () => { ok = await state.toggleFavorite(sticker().url, true); });

        expect(ok).toBe(false);
        expect(state.mine[0]?.favorite).toBe(false);
        expect(state.favorites).toEqual([]);
    });

    it('reverts only the failed URL when overlapping toggles interleave', async () => {
        const a = sticker({ id: 1, url: '/storage/bucket/stickers/a.webp' });
        const b = sticker({ id: 2, url: '/storage/bucket/stickers/b.webp' });
        api.getStickerLibrary.mockResolvedValue(library({ mine: [a, b] }));
        mount();
        await act(async () => { await state.load(); });

        let rejectA!: (err: Error) => void;
        let resolveB!: () => void;
        api.setStickerFavorite.mockImplementation((url: string) => {
            if (url === a.url) return new Promise<void>((_, reject) => { rejectA = reject; });
            return new Promise<void>((resolve) => { resolveB = resolve; });
        });

        let okA = true;
        let okB = false;
        await act(async () => {
            const pA = state.toggleFavorite(a.url, true);
            const pB = state.toggleFavorite(b.url, true);
            resolveB();
            okB = await pB;
            rejectA(new Error('nope'));
            okA = await pA;
        });

        expect(okA).toBe(false);
        expect(okB).toBe(true);
        expect(state.mine.find((s) => s.url === a.url)?.favorite).toBe(false);
        expect(state.mine.find((s) => s.url === b.url)?.favorite).toBe(true);
        expect(state.favorites.map((f) => f.url)).toEqual([b.url]);
    });

    it('removes a sticker and its favorite after a successful delete', async () => {
        api.getStickerLibrary.mockResolvedValue(library({
            mine: [sticker()],
            favorites: [{ url: sticker().url, createdAt: '2026-01-01T00:00:00Z' }],
        }));
        mount();
        await act(async () => { await state.load(); });
        api.deleteSticker.mockResolvedValue(undefined);

        let ok = false;
        await act(async () => { ok = await state.remove(1); });

        expect(ok).toBe(true);
        expect(api.deleteSticker).toHaveBeenCalledWith(1);
        expect(state.mine).toEqual([]);
        expect(state.favorites).toEqual([]);
    });

    it('keeps the sticker when the delete fails', async () => {
        api.getStickerLibrary.mockResolvedValue(library({ mine: [sticker()] }));
        mount();
        await act(async () => { await state.load(); });
        api.deleteSticker.mockRejectedValue(new Error('boom'));

        let ok = true;
        await act(async () => { ok = await state.remove(1); });

        expect(ok).toBe(false);
        expect(state.mine).toHaveLength(1);
    });

    it('saves a received sticker into the library', async () => {
        api.getStickerLibrary.mockResolvedValue(library());
        mount();
        await act(async () => { await state.load(); });
        const saved = sticker({ id: 7, url: '/storage/bucket/stickers/c.webp' });
        api.saveSticker.mockResolvedValue(saved);

        let out: Sticker | null = null;
        await act(async () => { out = await state.saveFromMessage(saved.url); });

        expect(api.saveSticker).toHaveBeenCalledWith(saved.url);
        expect(out).toEqual(saved);
        expect(state.mine).toEqual([saved]);
    });

    it('does not add anything when save fails or the response is malformed', async () => {
        api.getStickerLibrary.mockResolvedValue(library());
        mount();
        await act(async () => { await state.load(); });
        api.saveSticker.mockResolvedValue(null);

        let out: Sticker | null = sticker();
        await act(async () => { out = await state.saveFromMessage('/x.webp'); });

        expect(out).toBeNull();
        expect(state.mine).toEqual([]);
    });

    it('returns null when saveFromMessage rejects', async () => {
        api.getStickerLibrary.mockResolvedValue(library());
        mount();
        await act(async () => { await state.load(); });
        api.saveSticker.mockRejectedValue(new Error('offline'));

        let out: Sticker | null = sticker();
        await act(async () => { out = await state.saveFromMessage('/x.webp'); });

        expect(out).toBeNull();
        expect(state.mine).toEqual([]);
    });
});
