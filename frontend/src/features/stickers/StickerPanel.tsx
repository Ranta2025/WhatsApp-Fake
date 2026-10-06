import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import Popover from '../../components/ui/Popover';
import { BUILTIN_PACKS, findBuiltinSticker } from './builtinPack';
import type { BuiltinSticker } from './builtinPack';
import { useLongPress } from '../dashboard/hooks/useLongPress';
import { useRefMap } from '../../hooks/useRefMap';
import { filterByTags, normalizeForSearch } from './stickerSearch';
import { useStickerLibrary } from './useStickerLibrary';
import type { StickerLibraryApi } from './useStickerLibrary';
import StickerCreator from './StickerCreator';
import type { Sticker } from '../../types/api';

/**
 * Sticker picker v2 (SF6). An icon tab bar (Recientes, Favoritos, Mis stickers
 * and one tab per built-in pack) over a 4-column grid. A search box filters the
 * built-in and custom stickers by tag (case- and accent-insensitive); while a
 * query is present the tab grid is replaced by the combined results. Every tile
 * opens a context menu on long-press / right-click with Favorito and, for owned
 * stickers, Eliminar (with a confirmation). "Mis stickers" carries a "+" tile
 * that opens StickerCreator. When the library fetch fails the server-backed
 * tabs show a "Sin conexión" hint while the built-in packs keep working.
 * Animated custom stickers are drawn as a static first frame in the grid when
 * the user prefers reduced motion.
 *
 * The `anchorRef` / `onSelect` / `onClose` props are the stable composer
 * contract; `libraryApi` and `prefersReducedMotion` are optional test seams.
 */

interface StickerPanelProps {
    anchorRef: RefObject<HTMLElement | null>;
    /** Sends the picked sticker; the composer decides the media type. */
    onSelect: (url: string) => void;
    onClose: () => void;
    /** Injectable sticker library API; defaults to the real stickerApi. */
    libraryApi?: StickerLibraryApi;
    /** Injectable reduced-motion reader; defaults to `matchMedia`. */
    prefersReducedMotion?: () => boolean;
}

interface StickerTile {
    url: string;
    alt: string;
    tags: readonly string[];
    animated: boolean;
    /** Present only for the user's own stickers, which can be deleted. */
    ownedId?: number;
}

const readPrefersReducedMotion = (): boolean =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;

const toBuiltinTile = (sticker: BuiltinSticker): StickerTile => ({
    url: sticker.url,
    alt: sticker.alt,
    tags: sticker.tags,
    animated: false,
});

const toOwnedTile = (sticker: Sticker): StickerTile => ({
    url: sticker.url,
    alt: sticker.tags.length ? `Sticker propio: ${sticker.tags.join(', ')}` : 'Sticker propio',
    tags: sticker.tags,
    animated: sticker.animated,
    ownedId: sticker.id,
});

const TabIcon = ({ children }: { children: ReactNode }) => (
    <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        {children}
    </svg>
);

const CLOCK_ICON = <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z" />;
const STAR_ICON = <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5l2.31 4.68 5.17.75-3.74 3.64.88 5.15-4.62-2.43-4.62 2.43.88-5.15L3.99 8.93l5.17-.75 2.32-4.68z" />;
const SMILE_ICON = <path strokeLinecap="round" strokeLinejoin="round" d="M15.18 15.18a4.5 4.5 0 01-6.36 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9 10h.01M15 10h.01" />;
const PACK_ICON = <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />;

/**
 * A single thumbnail. Animated stickers become a static canvas frame when
 * reduced motion is on (drawn from the first decoded frame); otherwise they are
 * a plain `<img>` so the animation plays.
 */
function StickerThumbnail({ tile, reducedMotion }: { tile: StickerTile; reducedMotion: boolean }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const staticFrame = tile.animated && reducedMotion;

    useEffect(() => {
        if (!staticFrame) return undefined;
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        let cancelled = false;
        const draw = async (): Promise<void> => {
            try {
                const response = await fetch(tile.url);
                const blob = await response.blob();
                const bitmap = await createImageBitmap(blob);
                if (cancelled) {
                    bitmap.close();
                    return;
                }
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                bitmap.close();
            } catch {
                // A decode failure keeps the empty canvas; the tile still selects.
            }
        };
        void draw();
        return () => { cancelled = true; };
    }, [staticFrame, tile.url]);

    if (staticFrame) {
        return <canvas ref={canvasRef} width={64} height={64} aria-hidden="true" className="w-16 h-16" />;
    }
    return (
        <img
            src={tile.url}
            alt=""
            width={64}
            height={64}
            loading="lazy"
            draggable={false}
            className="w-16 h-16 object-contain"
        />
    );
}

export default function StickerPanel({
    anchorRef,
    onSelect,
    onClose,
    libraryApi,
    prefersReducedMotion = readPrefersReducedMotion,
}: StickerPanelProps) {
    const library = useStickerLibrary({ enabled: true, api: libraryApi });
    const [activeTab, setActiveTab] = useState('recents');
    const [query, setQuery] = useState('');
    const [menuFor, setMenuFor] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<Sticker | null>(null);
    const [creatorOpen, setCreatorOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const getTileRef = useRefMap();
    const bindLongPress = useLongPress<string>(setMenuFor);

    const reducedMotion = prefersReducedMotion();

    // Close the tile menu when pressing anywhere outside it (inside the panel
    // included). The shared Popover already owns the "close the whole panel"
    // gesture; the menu lives inside its DOM so it never triggers that.
    useEffect(() => {
        if (!menuFor) return undefined;
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (target && menuRef.current?.contains(target)) return;
            setMenuFor(null);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => document.removeEventListener('pointerdown', onPointerDown, true);
    }, [menuFor]);

    const isFavorite = (tile: StickerTile): boolean =>
        library.favorites.some((item) => item.url === tile.url)
        || library.mine.some((item) => item.url === tile.url && item.favorite);

    const resolveUrl = (url: string): StickerTile => {
        const builtin = findBuiltinSticker(url);
        if (builtin) return toBuiltinTile(builtin);
        const owned = library.mine.find((item) => item.url === url);
        if (owned) return toOwnedTile(owned);
        return { url, alt: 'Sticker', tags: [], animated: false };
    };

    const allTiles = useMemo<StickerTile[]>(() => [
        ...BUILTIN_PACKS.flatMap((pack) => pack.stickers.map(toBuiltinTile)),
        ...library.mine.map(toOwnedTile),
    ], [library.mine]);

    const searching = normalizeForSearch(query) !== '';
    const searchResults = searching ? filterByTags(query, allTiles) : null;

    const activeTiles = useMemo<StickerTile[]>(() => {
        if (activeTab === 'recents') return library.recents.map((item) => resolveUrl(item.url));
        if (activeTab === 'favorites') return library.favorites.map((item) => resolveUrl(item.url));
        if (activeTab === 'mine') return library.mine.map(toOwnedTile);
        const pack = BUILTIN_PACKS.find((item) => item.id === activeTab);
        return pack ? pack.stickers.map(toBuiltinTile) : [];
        // resolveUrl closes over library.mine, already in the dependency list.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, library.recents, library.favorites, library.mine]);

    const isServerTab = activeTab === 'recents' || activeTab === 'favorites' || activeTab === 'mine';

    const emptyMessage = activeTab === 'recents'
        ? 'Todavía no usaste ningún sticker.'
        : activeTab === 'favorites'
            ? 'Todavía no marcaste favoritos.'
            : 'Todavía no creaste stickers.';

    const handleSelect = (url: string): void => {
        onSelect(url);
        onClose();
    };

    const handleToggleFavorite = async (tile: StickerTile): Promise<void> => {
        const next = !isFavorite(tile);
        setMenuFor(null);
        await library.toggleFavorite(tile.url, next);
    };

    const handleDelete = async (): Promise<void> => {
        if (!confirmDelete) return;
        const { id } = confirmDelete;
        setConfirmDelete(null);
        await library.remove(id);
    };

    const renderTile = (tile: StickerTile) => (
        <div
            key={tile.url}
            ref={(el: HTMLDivElement | null) => {
                if (el) getTileRef(tile.url).current = el;
                else getTileRef.release(tile.url);
            }}
            className="relative"
            {...bindLongPress(tile.url)}
            onContextMenu={(event) => {
                event.preventDefault();
                setMenuFor(tile.url);
            }}
        >
            <button
                type="button"
                data-sticker-url={tile.url}
                aria-label={tile.alt}
                onClick={() => handleSelect(tile.url)}
                className="w-16 h-16 rounded-xl flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all"
            >
                <StickerThumbnail tile={tile} reducedMotion={reducedMotion} />
            </button>

            {menuFor === tile.url && (
                <div
                    ref={menuRef}
                    role="menu"
                    aria-label={`Opciones de ${tile.alt}`}
                    className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-white/10 bg-slate-800 p-1 shadow-2xl"
                >
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => { void handleToggleFavorite(tile); }}
                        className="w-full px-3 py-2 rounded-lg text-left text-[13px] font-medium text-slate-200 hover:bg-white/[0.06] transition-colors"
                    >
                        {isFavorite(tile) ? 'Quitar de favoritos' : 'Favorito'}
                    </button>
                    {tile.ownedId !== undefined && (
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                setConfirmDelete(library.mine.find((item) => item.id === tile.ownedId) ?? null);
                                setMenuFor(null);
                            }}
                            className="w-full px-3 py-2 rounded-lg text-left text-[13px] font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
                        >
                            Eliminar
                        </button>
                    )}
                </div>
            )}
        </div>
    );

    const tabs: { id: string; label: string; icon: ReactNode }[] = [
        { id: 'recents', label: 'Recientes', icon: CLOCK_ICON },
        { id: 'favorites', label: 'Favoritos', icon: STAR_ICON },
        { id: 'mine', label: 'Mis stickers', icon: SMILE_ICON },
        ...BUILTIN_PACKS.map((pack) => ({ id: pack.id, label: pack.name, icon: PACK_ICON })),
    ];

    return (
        <Popover
            open
            onClose={onClose}
            anchorRef={anchorRef}
            className="w-80 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-2 animate-slide-up origin-bottom-left"
        >
            <input
                type="search"
                aria-label="Buscar stickers"
                placeholder="Buscar por etiqueta"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full mb-2 rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-slate-500 outline-none focus:bg-white/[0.14]"
            />

            <div role="tablist" aria-label="Categorías de stickers" className="flex items-center gap-0.5 mb-2 overflow-x-auto">
                {tabs.map((item) => {
                    const selected = !searching && activeTab === item.id;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            onClick={() => { setActiveTab(item.id); setMenuFor(null); }}
                            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors shrink-0 ${
                                selected ? 'bg-emerald-600/80 text-white' : 'text-slate-400 hover:bg-white/10 hover:text-slate-200'
                            }`}
                        >
                            <TabIcon>{item.icon}</TabIcon>
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </div>

            {isServerTab && library.status === 'error' && (
                <p role="status" className="mb-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-[12px] text-amber-300">
                    Sin conexión. Se muestran solo los stickers del dispositivo.
                </p>
            )}

            <div className="grid grid-cols-4 gap-1 max-h-72 overflow-y-auto">
                {activeTab === 'mine' && !searching && (
                    <button
                        type="button"
                        aria-label="Crear sticker"
                        onClick={() => setCreatorOpen(true)}
                        className="w-16 h-16 rounded-xl flex items-center justify-center border border-dashed border-emerald-500/60 text-emerald-400 text-2xl hover:bg-emerald-500/10 active:scale-95 transition-all"
                    >
                        +
                    </button>
                )}
                {(searchResults ?? activeTiles).map(renderTile)}
            </div>

            {!searching && isServerTab && (searchResults ?? activeTiles).length === 0 && library.status !== 'loading' && (
                <p className="mt-2 text-center text-[12px] text-slate-500">{emptyMessage}</p>
            )}
            {searching && searchResults?.length === 0 && (
                <p className="mt-2 text-center text-[12px] text-slate-500">No se encontraron stickers con esa etiqueta.</p>
            )}

            {confirmDelete && (
                <div
                    role="dialog"
                    aria-label="Eliminar sticker"
                    className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-black/70 p-4 text-center"
                >
                    <div>
                        <p className="text-sm text-white">¿Eliminar este sticker de &quot;Mis stickers&quot;?</p>
                        <div className="mt-3 flex justify-center gap-2">
                            <button
                                type="button"
                                onClick={() => setConfirmDelete(null)}
                                className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => { void handleDelete(); }}
                                className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-500"
                            >
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {creatorOpen && (
                <div className="absolute inset-0 z-30 overflow-y-auto rounded-2xl bg-slate-900/95">
                    <StickerCreator
                        onCreated={(created) => {
                            void library.saveFromMessage(created.url);
                            setActiveTab('mine');
                            setCreatorOpen(false);
                        }}
                        onSend={(url) => handleSelect(url)}
                        onClose={() => setCreatorOpen(false)}
                    />
                </div>
            )}
        </Popover>
    );
}
