// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import MessageList from './MessageList';
import type { Message } from '../../../types/api';

// SB3: sticker messages in the 1:1 chat render a bare sticker (transparent
// bubble, no "Editar"), while reactions keep working.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const dash = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const messaging = vi.hoisted(() => ({ menuOpen: null as number | null, setMenuOpen: vi.fn() }));
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

const stickerMsg = (over: Partial<Message> = {}): Message => ({
    MessageID: 1,
    SenderTelephon: '111',
    Receptor: '222',
    Message: '/stickers/basic/hola.webp',
    MediaType: 'sticker',
    MediaUrl: '/stickers/basic/hola.webp',
    Status: 'enviado',
    Time: '2026-01-01T10:00:00Z',
    Edited: false,
    ...over,
});

describe('MessageList sticker rendering (1:1)', () => {
    let container: HTMLDivElement;
    let root: Root;
    const reactToMessage = vi.fn();

    const render = (message: Message, menuOpen: number | null = null) => {
        messaging.menuOpen = menuOpen;
        dash.value = {
            selected: { Number: '222' },
            focusedChat: {},
            messagesByChat: { '222': [message] },
            chatPaging: {},
            loadOlderMessages: vi.fn(),
            profile: { Telephon: '111' },
            globalWallpaper: null,
            reactToMessage,
        };
        act(() => { root.render(<MessageList />); });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        document.body.innerHTML = '';
    });

    it('renderiza el sticker y la burbuja queda transparente (sin fondo)', () => {
        render(stickerMsg());
        const img = container.querySelector('img');
        expect(img?.getAttribute('src')).toBe('/stickers/basic/hola.webp');
        const bubble = img?.parentElement as HTMLElement;
        expect(bubble.className).not.toMatch(/bg-indigo-/);
        expect(bubble.className).not.toMatch(/bg-slate-/);
    });

    it('oculta "Editar" en stickers propios y conserva el resto del menú', () => {
        render(stickerMsg(), 1);
        expect(document.body.textContent).not.toContain('Editar');
        expect(document.body.textContent).toContain('Eliminar para todos');
        expect(document.body.textContent).toContain('Responder');
    });

    it('las reacciones siguen funcionando en sticker messages', () => {
        render(stickerMsg({ Reactions: [{ Emoji: '👍', Count: 2, Mine: true }] }));
        const chip = Array.from(container.querySelectorAll<HTMLElement>('button'))
            .find(b => b.getAttribute('aria-label') === '👍 2, reaccionaste');
        expect(chip).toBeTruthy();
        act(() => { chip?.click(); });
        expect(reactToMessage).toHaveBeenCalledExactlyOnceWith({ kind: 'direct', messageID: 1 }, '👍');
    });

    it('la cita de respuesta a un sticker muestra la etiqueta, no la URL', () => {
        render(stickerMsg({
            ReplyToMessageID: 0,
            ReplyToTelephon: '222',
            ReplyToMessage: '/stickers/basic/hola.webp',
        }));
        expect(container.textContent).toContain('✨ Sticker');
        expect(container.textContent).not.toContain('/stickers/basic/hola.webp');
    });
});
