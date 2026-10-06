// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import type { RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import StickerPanel from './StickerPanel';
import { BUILTIN_PACKS } from './builtinPack';
import { uploadSticker } from '../../api/stickerApi';
import type { Sticker, StickerLibraryResponse } from '../../types/api';
import type { StickerLibraryApi } from './useStickerLibrary';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// SF6: panel v2. An icon tab bar (Recientes / Favoritos / Mis stickers / one per
// built-in pack), an accent-insensitive tag search, a per-tile long-press /
// right-click menu (Favorito, Eliminar for owned), a create tile that opens
// StickerCreator, an offline hint on the server-backed tabs and static
// thumbnails under prefers-reduced-motion.

vi.mock('../../api/stickerApi', () => ({
    uploadSticker: vi.fn(),
    getStickerLibrary: vi.fn(),
    setStickerFavorite: vi.fn(),
    deleteSticker: vi.fn(),
    saveSticker: vi.fn(),
}));
const uploadMock = vi.mocked(uploadSticker);

const ownedSticker = (over: Partial<Sticker> = {}): Sticker => ({
    id: 7,
    url: '/storage/bucket/stickers/abc.webp',
    sha256: 'a'.repeat(64),
    animated: false,
    favorite: false,
    tags: ['hola', 'saludo'],
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
});

const library = (over: Partial<StickerLibraryResponse> = {}): StickerLibraryResponse => ({
    mine: [],
    favorites: [],
    recents: [],
    ...over,
});

describe('StickerPanel v2', () => {
    let container: HTMLDivElement;
    let root: Root;
    let anchor: HTMLButtonElement;
    let anchorRef: RefObject<HTMLElement | null>;
    const onSelect = vi.fn();
    const onClose = vi.fn();

    const api: StickerLibraryApi = {
        getStickerLibrary: vi.fn(),
        setStickerFavorite: vi.fn(),
        deleteSticker: vi.fn(),
        saveSticker: vi.fn(),
    };
    const apiMock = vi.mocked(api);

    const basic = BUILTIN_PACKS.find((pack) => pack.id === 'basic')!.stickers;
    const animales = BUILTIN_PACKS.find((pack) => pack.id === 'animales')!.stickers;

    const render = (options: { reducedMotion?: boolean } = {}) => {
        act(() => {
            root.render(
                <StickerPanel
                    anchorRef={anchorRef}
                    onSelect={onSelect}
                    onClose={onClose}
                    libraryApi={api}
                    prefersReducedMotion={() => options.reducedMotion ?? false}
                />,
            );
        });
    };

    const flush = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };

    const tab = (name: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
        .find((item) => item.textContent?.includes(name));
    const clickTab = async (name: string) => { await act(async () => { tab(name)?.click(); }); };

    const tileButton = (url: string) => document.querySelector<HTMLButtonElement>(`button[data-sticker-url="${url}"]`);
    const createTile = () => document.querySelector<HTMLButtonElement>('button[aria-label="Crear sticker"]');

    beforeEach(() => {
        vi.clearAllMocks();
        apiMock.getStickerLibrary.mockResolvedValue(library());
        apiMock.setStickerFavorite.mockResolvedValue(undefined);
        apiMock.deleteSticker.mockResolvedValue(undefined);
        apiMock.saveSticker.mockResolvedValue(null);
        uploadMock.mockResolvedValue(ownedSticker());
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
        vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 512, height: 512, close: vi.fn() })));
        vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob() })));
        URL.createObjectURL = vi.fn(() => 'blob:mock');
        URL.revokeObjectURL = vi.fn();
        anchor = document.createElement('button');
        document.body.appendChild(anchor);
        anchorRef = { current: anchor };
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        vi.unstubAllGlobals();
        Reflect.deleteProperty(URL, 'createObjectURL');
        Reflect.deleteProperty(URL, 'revokeObjectURL');
        document.body.innerHTML = '';
    });

    it('renders an icon tab bar: Recientes, Favoritos, Mis stickers and one tab per pack', () => {
        render();

        const labels = Array.from(document.querySelectorAll('[role="tab"]')).map((item) => item.textContent);
        expect(labels.some((label) => label?.includes('Recientes'))).toBe(true);
        expect(labels.some((label) => label?.includes('Favoritos'))).toBe(true);
        expect(labels.some((label) => label?.includes('Mis stickers'))).toBe(true);
        for (const pack of BUILTIN_PACKS) {
            expect(labels.some((label) => label?.includes(pack.name)), pack.id).toBe(true);
        }
    });

    it('switches to a pack tab and selects a sticker with one click', async () => {
        render();
        await flush();
        await clickTab('Básicos');

        const first = basic[0]!;
        const button = tileButton(first.url);
        expect(button).not.toBeNull();
        expect(button!.querySelector('img')?.getAttribute('src')).toBe(first.url);

        await act(async () => { button!.click(); });
        expect(onSelect).toHaveBeenCalledWith(first.url);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('filters built-in and custom stickers by tag, accent- and case-insensitive', async () => {
        apiMock.getStickerLibrary.mockResolvedValue(library({ mine: [ownedSticker()] }));
        render();
        await flush();

        const search = document.querySelector<HTMLInputElement>('input[aria-label="Buscar stickers"]')!;
        expect(search).not.toBeNull();

        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        await act(async () => {
            setValue.call(search, 'CORAZÓN');
            search.dispatchEvent(new Event('input', { bubbles: true }));
        });

        // The built-in "corazon" sticker matches "CORAZÓN"; the custom one does not.
        expect(tileButton('/stickers/basic/corazon.webp')).not.toBeNull();
        expect(tileButton(ownedSticker().url)).toBeNull();
        // The pack tabs are bypassed while searching.
        expect(tab('Básicos')).not.toBeNull();
    });

    it('shows the create tile on "Mis stickers" and opens StickerCreator', async () => {
        render();
        await flush();
        await clickTab('Mis stickers');

        const create = createTile();
        expect(create).not.toBeNull();

        await act(async () => { create!.click(); });
        expect(document.querySelector('[role="dialog"][aria-label="Crear sticker"]')).not.toBeNull();
    });

    it('refreshes "Mis stickers" through the library when a sticker is created', async () => {
        const created = ownedSticker({ id: 9, url: '/storage/bucket/stickers/new.webp' });
        uploadMock.mockResolvedValue(created);
        apiMock.saveSticker.mockResolvedValue(created);
        render();
        await flush();
        await clickTab('Mis stickers');
        await act(async () => { createTile()!.click(); });

        // Animated WebP pick keeps the creation path canvas-free.
        const bytes = new Uint8Array([
            0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
            0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0x02, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
        ]);
        const file = new File([bytes], 'animado.webp', { type: 'image/webp' });
        const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
        await act(async () => {
            Object.defineProperty(input, 'files', { configurable: true, value: [file] });
            input.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        const createButton = Array.from(document.querySelectorAll('button'))
            .find((item) => item.textContent?.includes('Crear sticker'))!;
        await act(async () => {
            createButton.click();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(apiMock.saveSticker).toHaveBeenCalledWith(created.url);
    });

    it('opens the tile menu on right-click with Favorito and toggles the favorite', async () => {
        apiMock.getStickerLibrary.mockResolvedValue(library({ mine: [ownedSticker()] }));
        render();
        await flush();
        await clickTab('Mis stickers');

        const wrapper = tileButton(ownedSticker().url)!.parentElement!;
        await act(async () => {
            wrapper.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        });

        const favorite = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
            .find((item) => item.textContent?.includes('Favorito'))!;
        expect(favorite).not.toBeUndefined();

        await act(async () => { favorite.click(); });
        expect(apiMock.setStickerFavorite).toHaveBeenCalledWith(ownedSticker().url, true);
    });

    it('offers Eliminar only for owned stickers and confirms before deleting', async () => {
        apiMock.getStickerLibrary.mockResolvedValue(library({ mine: [ownedSticker()] }));
        render();
        await flush();
        await clickTab('Básicos');

        // A built-in tile has no Eliminar.
        const builtinWrapper = tileButton(basic[0]!.url)!.parentElement!;
        await act(async () => {
            builtinWrapper.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        });
        expect(document.querySelector('[role="menuitem"]')?.textContent).toContain('Favorito');
        expect(Array.from(document.querySelectorAll('[role="menuitem"]')).some((item) => item.textContent?.includes('Eliminar'))).toBe(false);

        await clickTab('Mis stickers');
        const ownWrapper = tileButton(ownedSticker().url)!.parentElement!;
        await act(async () => {
            ownWrapper.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        });
        const remove = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
            .find((item) => item.textContent?.includes('Eliminar'))!;
        await act(async () => { remove.click(); });

        const dialog = document.querySelector('[role="dialog"][aria-label="Eliminar sticker"]');
        expect(dialog).not.toBeNull();
        expect(apiMock.deleteSticker).not.toHaveBeenCalled();

        const confirm = Array.from(dialog!.querySelectorAll<HTMLButtonElement>('button'))
            .find((item) => item.textContent?.includes('Eliminar'))!;
        await act(async () => { confirm.click(); await Promise.resolve(); });
        expect(apiMock.deleteSticker).toHaveBeenCalledWith(ownedSticker().id);
    });

    it('shows an offline hint on server tabs when the library fetch fails and keeps packs usable', async () => {
        apiMock.getStickerLibrary.mockRejectedValue(new Error('offline'));
        render();
        await flush();

        const hint = document.querySelector('[role="status"]');
        expect(hint?.textContent).toContain('Sin conexión');

        await clickTab('Básicos');
        expect(document.querySelector('[role="status"]')).toBeNull();
        expect(tileButton(basic[0]!.url)).not.toBeNull();
    });

    it('renders a static canvas thumbnail for animated stickers under reduced motion', async () => {
        apiMock.getStickerLibrary.mockResolvedValue(library({
            mine: [ownedSticker({ animated: true })],
        }));
        render({ reducedMotion: true });
        await flush();
        await clickTab('Mis stickers');

        const button = tileButton(ownedSticker().url)!;
        expect(button.querySelector('canvas')).not.toBeNull();
        expect(button.querySelector('img')).toBeNull();
    });

    it('renders the animated sticker as an <img> when motion is allowed', async () => {
        apiMock.getStickerLibrary.mockResolvedValue(library({
            mine: [ownedSticker({ animated: true })],
        }));
        render({ reducedMotion: false });
        await flush();
        await clickTab('Mis stickers');

        const button = tileButton(ownedSticker().url)!;
        expect(button.querySelector('img')).not.toBeNull();
        expect(button.querySelector('canvas')).toBeNull();
    });

    it('lists favorite URLs on the Favoritos tab', async () => {
        apiMock.getStickerLibrary.mockResolvedValue(library({
            favorites: [{ url: '/stickers/animales/gato.webp', createdAt: '2026-01-01T00:00:00Z' }],
        }));
        render();
        await flush();
        await clickTab('Favoritos');

        expect(tileButton('/stickers/animales/gato.webp')).not.toBeNull();
        expect(animales[0]!.url).toBe('/stickers/animales/gato.webp');
    });
});
