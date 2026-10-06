import { useCallback, useEffect, useRef, useState } from 'react';
import {
    deleteSticker, getStickerLibrary, saveSticker, setStickerFavorite,
} from '../../api/stickerApi';
import type {
    Sticker, StickerFavoriteItem, StickerLibraryResponse, StickerRecentItem,
} from '../../types/api';

/**
 * Sticker library hook (SF4): fetches the user library on the first panel
 * open, caches it in memory and keeps it consistent on mutations. It only
 * talks to `stickerApi`; the injected `api` exists for tests.
 */

export interface StickerLibraryApi {
    getStickerLibrary: () => Promise<StickerLibraryResponse>;
    setStickerFavorite: (url: string, favorite: boolean) => Promise<void>;
    deleteSticker: (id: number) => Promise<void>;
    saveSticker: (url: string) => Promise<Sticker | null>;
}

const defaultApi: StickerLibraryApi = {
    getStickerLibrary, setStickerFavorite, deleteSticker, saveSticker,
};

export type StickerLibraryStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseStickerLibraryOptions {
    /** True while the panel is open; the first `true` triggers the fetch. */
    enabled?: boolean;
    /** Injectable for tests; defaults to the real stickerApi. */
    api?: StickerLibraryApi;
}

export interface StickerLibraryState {
    mine: Sticker[];
    favorites: StickerFavoriteItem[];
    recents: StickerRecentItem[];
    status: StickerLibraryStatus;
    /** Fetches the library once; later calls are no-ops while cached. */
    load: () => Promise<void>;
    /** Optimistic favorite toggle; rolls back and returns false on failure. */
    toggleFavorite: (url: string, favorite: boolean) => Promise<boolean>;
    /** Deletes an owned sticker; returns false on failure. */
    remove: (id: number) => Promise<boolean>;
    /** Adds a received sticker to "Mis stickers"; null on failure/malformed response. */
    saveFromMessage: (url: string) => Promise<Sticker | null>;
}

export function useStickerLibrary({
    enabled = false,
    api = defaultApi,
}: UseStickerLibraryOptions = {}): StickerLibraryState {
    const [mine, setMine] = useState<Sticker[]>([]);
    const [favorites, setFavorites] = useState<StickerFavoriteItem[]>([]);
    const [recents, setRecents] = useState<StickerRecentItem[]>([]);
    const [status, setStatus] = useState<StickerLibraryStatus>('idle');
    const loadedRef = useRef(false);
    const inFlightRef = useRef<Promise<void> | null>(null);

    const load = useCallback((): Promise<void> => {
        if (loadedRef.current) return Promise.resolve();
        if (inFlightRef.current) return inFlightRef.current;
        // The `loading` transition runs on a microtask (not synchronously in the
        // caller's body): the fetch is triggered from an effect on first open, and
        // a synchronous setState there would cascade renders.
        const run = Promise.resolve()
            .then(() => {
                setStatus('loading');
                return api.getStickerLibrary();
            })
            .then((library) => {
                setMine(library.mine);
                setFavorites(library.favorites);
                setRecents(library.recents);
                loadedRef.current = true;
                setStatus('ready');
            })
            .catch(() => {
                setStatus('error');
            })
            .finally(() => {
                if (inFlightRef.current === run) inFlightRef.current = null;
            });
        inFlightRef.current = run;
        return run;
    }, [api]);

    useEffect(() => {
        if (enabled) void load();
    }, [enabled, load]);

    const toggleFavorite = useCallback(async (url: string, favorite: boolean): Promise<boolean> => {
        const previousFavorite = mine.find((item) => item.url === url)?.favorite;
        const previousFavoriteItem = favorites.find((item) => item.url === url);
        setMine((list) => list.map((item) => (item.url === url ? { ...item, favorite } : item)));
        setFavorites((list) => {
            if (!favorite) return list.filter((item) => item.url !== url);
            if (list.some((item) => item.url === url)) return list;
            return [{ url, createdAt: new Date().toISOString() }, ...list];
        });
        try {
            await api.setStickerFavorite(url, favorite);
            return true;
        } catch {
            // Roll back ONLY this URL, re-applying its pre-call value on top of the
            // current state so an overlapping toggle on another URL survives.
            if (previousFavorite !== undefined) {
                setMine((list) => list.map((item) => (
                    item.url === url ? { ...item, favorite: previousFavorite } : item
                )));
            }
            setFavorites((list) => {
                const has = list.some((item) => item.url === url);
                if (previousFavoriteItem) return has ? list : [previousFavoriteItem, ...list];
                return has ? list.filter((item) => item.url !== url) : list;
            });
            return false;
        }
    }, [api, mine, favorites]);

    const remove = useCallback(async (id: number): Promise<boolean> => {
        const target = mine.find((item) => item.id === id);
        try {
            await api.deleteSticker(id);
        } catch {
            return false;
        }
        setMine((list) => list.filter((item) => item.id !== id));
        if (target) setFavorites((list) => list.filter((item) => item.url !== target.url));
        return true;
    }, [api, mine]);

    const saveFromMessage = useCallback(async (url: string): Promise<Sticker | null> => {
        try {
            const saved = await api.saveSticker(url);
            if (!saved) return null;
            setMine((list) => (list.some((item) => item.url === saved.url) ? list : [saved, ...list]));
            return saved;
        } catch {
            return null;
        }
    }, [api]);

    return { mine, favorites, recents, status, load, toggleFavorite, remove, saveFromMessage };
}
