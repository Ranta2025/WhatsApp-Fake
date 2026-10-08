// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import MessageList from './MessageList';
import type { Message } from '../../../types/api';

// SF6: sticker messages gain "Añadir a favoritos" (built-in) and "Añadir a mis
// stickers" (custom storage URL) in the message menu, backed by useStickerLibrary.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const dash = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const messaging = vi.hoisted(() => ({ menuOpen: null as number | null, setMenuOpen: vi.fn() }));
const toast = vi.hoisted(() => ({ addToast: vi.fn() }));
const lib = vi.hoisted(() => ({
    toggleFavorite: vi.fn(async () => true),
    saveFromMessage: vi.fn(async (): Promise<{ id: number } | null> => null),
}));

vi.mock('../context/DashboardContext', () => ({ useDashboard: () => dash.value }));
vi.mock('../hooks/useMessaging', () => ({
    useMessaging: () => ({
        editingMessageId: null, editingMessageText: '',
        handleEditMessageChange: vi.fn(), handleEditMessageSave: vi.fn(),
        handleEditMessageCancel: vi.fn(), handleEditMessage: vi.fn(),
        messageMenuOpen: messaging.menuOpen, setMessageMenuOpen: messaging.setMenuOpen,
        handleDeleteMessage: vi.fn(), handleDeleteMessageForMe: vi.fn(),
        handleReplyToMessage: vi.fn(), handleForwardMessage: vi.fn(),
    }),
}));
vi.mock('../../stickers/useStickerLibrary', () => ({
    useStickerLibrary: () => ({
        mine: [], favorites: [], recents: [], status: 'idle',
        load: vi.fn(), remove: vi.fn(),
        toggleFavorite: lib.toggleFavorite, saveFromMessage: lib.saveFromMessage,
    }),
}));

const message = (over: Partial<Message> = {}): Message => ({
    messageID: 1,
    senderTelephon: '111',
    receptor: '222',
    message: '/stickers/basic/hola.webp',
    mediaType: 'sticker',
    mediaUrl: '/stickers/basic/hola.webp',
    status: 'enviado',
    time: '2026-01-01T10:00:00Z',
    edited: false,
    ...over,
});

const menuText = () => document.body.textContent ?? '';
const menuItem = (text: string) => Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
    .find((button) => button.textContent?.includes(text))!;

describe('MessageList received-sticker menu (1:1)', () => {
    let container: HTMLDivElement;
    let root: Root;

    const render = (msg: Message, menuOpen: number | null = 1) => {
        messaging.menuOpen = menuOpen;
        dash.value = {
            selected: { telephon: '222' },
            focusedChat: {},
            messagesByChat: { '222': [msg] },
            chatPaging: {},
            loadOlderMessages: vi.fn(),
            profile: { telephon: '111' },
            globalWallpaper: null,
            reactToMessage: vi.fn(),
            addToast: toast.addToast,
        };
        act(() => { root.render(<MessageList />); });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        lib.toggleFavorite.mockResolvedValue(true);
        lib.saveFromMessage.mockResolvedValue(null);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        document.body.innerHTML = '';
    });

    it('offers "Añadir a favoritos" for a built-in sticker and calls the hook', async () => {
        render(message());
        const item = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
            .find((button) => button.textContent?.includes('Añadir a favoritos'))!;
        expect(item).toBeTruthy();

        await act(async () => { item.click(); await Promise.resolve(); });
        expect(lib.toggleFavorite).toHaveBeenCalledWith('/stickers/basic/hola.webp', true);
    });

    it('offers "Añadir a mis stickers" for a custom storage sticker and calls the hook', async () => {
        render(message({ mediaType: 'sticker', mediaUrl: '/storage/bucket/stickers/abc.webp', message: '/storage/bucket/stickers/abc.webp' }));
        const item = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
            .find((button) => button.textContent?.includes('Añadir a mis stickers'))!;
        expect(item).toBeTruthy();

        await act(async () => { item.click(); await Promise.resolve(); });
        expect(lib.saveFromMessage).toHaveBeenCalledWith('/storage/bucket/stickers/abc.webp');
    });

    it('does not offer the sticker items for a non-sticker message', () => {
        render(message({ mediaType: 'image', mediaUrl: '/storage/a.png', message: '/storage/a.png' }));
        expect(menuText()).not.toContain('Añadir a favoritos');
        expect(menuText()).not.toContain('Añadir a mis stickers');
    });

    it('does not offer "Añadir a mis stickers" for a built-in sticker', () => {
        render(message());
        expect(menuText()).toContain('Añadir a favoritos');
        expect(menuText()).not.toContain('Añadir a mis stickers');
    });

    // RF19: los textos del toast, éxito y fallo, en el menú 1:1.
    it('emits the success toast for favoriting and saving a sticker', async () => {
        lib.toggleFavorite.mockResolvedValue(true);
        render(message());
        await act(async () => { menuItem('Añadir a favoritos').click(); await Promise.resolve(); });
        expect(toast.addToast).toHaveBeenCalledWith({ type: 'success', message: 'Añadido a favoritos' });

        toast.addToast.mockClear();
        lib.saveFromMessage.mockResolvedValue({ id: 1 });
        render(message({ mediaType: 'sticker', mediaUrl: '/storage/bucket/stickers/abc.webp', message: '/storage/bucket/stickers/abc.webp' }));
        await act(async () => { menuItem('Añadir a mis stickers').click(); await Promise.resolve(); });
        expect(toast.addToast).toHaveBeenCalledWith({ type: 'success', message: 'Añadido a Mis stickers' });
    });

    it('emits the failure toast for favoriting and saving a sticker', async () => {
        lib.toggleFavorite.mockResolvedValue(false);
        render(message());
        await act(async () => { menuItem('Añadir a favoritos').click(); await Promise.resolve(); });
        expect(toast.addToast).toHaveBeenCalledWith({ type: 'error', message: 'No se pudo añadir a favoritos' });

        toast.addToast.mockClear();
        lib.saveFromMessage.mockResolvedValue(null);
        render(message({ mediaType: 'sticker', mediaUrl: '/storage/bucket/stickers/abc.webp', message: '/storage/bucket/stickers/abc.webp' }));
        await act(async () => { menuItem('Añadir a mis stickers').click(); await Promise.resolve(); });
        expect(toast.addToast).toHaveBeenCalledWith({ type: 'error', message: 'No se pudo añadir el sticker' });
    });
});
