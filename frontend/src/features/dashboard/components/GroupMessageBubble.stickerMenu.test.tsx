// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GroupMessageBubble } from './GroupChatWindow';
import type { GroupMessageResponse } from '../../../types/api';

// SF6: group sticker messages gain the same received-sticker menu items as 1:1.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const lib = vi.hoisted(() => ({
    toggleFavorite: vi.fn(async () => true),
    saveFromMessage: vi.fn(async () => null),
}));

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../../stickers/useStickerLibrary', () => ({
    useStickerLibrary: () => ({
        mine: [], favorites: [], recents: [], status: 'idle',
        load: vi.fn(), remove: vi.fn(),
        toggleFavorite: lib.toggleFavorite, saveFromMessage: lib.saveFromMessage,
    }),
}));

const baseMsg = (over: Partial<GroupMessageResponse>): GroupMessageResponse => ({
    MessageID: 1,
    GroupID: 5,
    SenderTelephon: '222',
    SenderUsername: 'bob',
    Message: '',
    Time: '2026-01-01T10:00:00Z',
    Edited: false,
    ...over,
});

describe('GroupMessageBubble received-sticker menu', () => {
    let container: HTMLDivElement;
    let root: Root;

    const renderBubble = (msg: GroupMessageResponse) => {
        act(() => {
            root.render(
                <GroupMessageBubble
                    msg={msg}
                    isMine={false}
                    replySender=""
                    onEdit={vi.fn()}
                    onDelete={vi.fn()}
                    onReply={vi.fn()}
                    onDeleteForMe={vi.fn()}
                    menuOpen={msg.MessageID}
                    setMenuOpen={vi.fn()}
                />,
            );
        });
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
        renderBubble(baseMsg({ MediaType: 'sticker', MediaUrl: '/stickers/animales/gato.webp', Message: '/stickers/animales/gato.webp' }));
        const item = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
            .find((button) => button.textContent?.includes('Añadir a favoritos'))!;
        expect(item).toBeTruthy();

        await act(async () => { item.click(); await Promise.resolve(); });
        expect(lib.toggleFavorite).toHaveBeenCalledWith('/stickers/animales/gato.webp', true);
    });

    it('offers "Añadir a mis stickers" for a custom storage sticker and calls the hook', async () => {
        renderBubble(baseMsg({ MediaType: 'sticker', MediaUrl: '/storage/bucket/stickers/abc.webp', Message: '/storage/bucket/stickers/abc.webp' }));
        const item = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
            .find((button) => button.textContent?.includes('Añadir a mis stickers'))!;
        expect(item).toBeTruthy();

        await act(async () => { item.click(); await Promise.resolve(); });
        expect(lib.saveFromMessage).toHaveBeenCalledWith('/storage/bucket/stickers/abc.webp');
    });

    it('does not offer the sticker items for a non-sticker message', () => {
        renderBubble(baseMsg({ MediaType: 'image', MediaUrl: '/storage/a.png', Message: '/storage/a.png' }));
        expect(document.body.textContent).not.toContain('Añadir a favoritos');
        expect(document.body.textContent).not.toContain('Añadir a mis stickers');
    });
});
