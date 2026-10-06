// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GroupMessageBubble, GroupMessageList } from './GroupChatWindow';
import { useDashboard, type DashboardContextValue } from '../context/DashboardContext';
import { useGroupMessaging, type UseGroupMessagingResult } from '../hooks/useGroupMessaging';
import type { GroupMessageResponse } from '../../../types/api';

// SF6: group sticker messages gain the same received-sticker menu items as 1:1.
// SF7 (RF19/RF20): the feedback strings are asserted and the list wires the
// toast through an optional chain (addToast may be absent).

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const lib = vi.hoisted(() => ({
    toggleFavorite: vi.fn(async () => true),
    saveFromMessage: vi.fn(async (): Promise<{ id: number } | null> => null),
}));

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../hooks/useGroupMessaging', () => ({
    GroupMessagingProvider: ({ children }: { children: unknown }) => children,
    useGroupMessaging: vi.fn(),
}));
vi.mock('../../stickers/useStickerLibrary', () => ({
    useStickerLibrary: () => ({
        mine: [], favorites: [], recents: [], status: 'idle',
        load: vi.fn(), remove: vi.fn(),
        toggleFavorite: lib.toggleFavorite, saveFromMessage: lib.saveFromMessage,
    }),
}));

const mockUseDashboard = vi.mocked(useDashboard);
const mockUseGroupMessaging = vi.mocked(useGroupMessaging);

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

    const renderBubble = (msg: GroupMessageResponse, onStickerFeedback = vi.fn()) => {
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
                    onStickerFeedback={onStickerFeedback}
                />,
            );
        });
        return onStickerFeedback;
    };

    const menuItem = (text: string) => Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent?.includes(text))!;

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
        const item = menuItem('Añadir a favoritos');
        expect(item).toBeTruthy();

        await act(async () => { item.click(); await Promise.resolve(); });
        expect(lib.toggleFavorite).toHaveBeenCalledWith('/stickers/animales/gato.webp', true);
    });

    it('offers "Añadir a mis stickers" for a custom storage sticker and calls the hook', async () => {
        renderBubble(baseMsg({ MediaType: 'sticker', MediaUrl: '/storage/bucket/stickers/abc.webp', Message: '/storage/bucket/stickers/abc.webp' }));
        const item = menuItem('Añadir a mis stickers');
        expect(item).toBeTruthy();

        await act(async () => { item.click(); await Promise.resolve(); });
        expect(lib.saveFromMessage).toHaveBeenCalledWith('/storage/bucket/stickers/abc.webp');
    });

    it('does not offer the sticker items for a non-sticker message', () => {
        renderBubble(baseMsg({ MediaType: 'image', MediaUrl: '/storage/a.png', Message: '/storage/a.png' }));
        expect(document.body.textContent).not.toContain('Añadir a favoritos');
        expect(document.body.textContent).not.toContain('Añadir a mis stickers');
    });

    // RF19: los textos del toast (éxito y fallo) del menú de grupo.
    it('reports success and failure feedback for the favorite action', async () => {
        const okFeedback = renderBubble(baseMsg({ MediaType: 'sticker', MediaUrl: '/stickers/animales/gato.webp', Message: '/stickers/animales/gato.webp' }));
        await act(async () => { menuItem('Añadir a favoritos').click(); await Promise.resolve(); });
        expect(okFeedback).toHaveBeenCalledWith('Añadido a favoritos', 'success');

        act(() => { root.unmount(); });
        document.body.innerHTML = '';
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        lib.toggleFavorite.mockResolvedValue(false);
        const failFeedback = renderBubble(baseMsg({ MediaType: 'sticker', MediaUrl: '/stickers/animales/gato.webp', Message: '/stickers/animales/gato.webp' }));
        await act(async () => { menuItem('Añadir a favoritos').click(); await Promise.resolve(); });
        expect(failFeedback).toHaveBeenCalledWith('No se pudo añadir a favoritos', 'error');
    });

    it('reports success and failure feedback for the save action', async () => {
        lib.saveFromMessage.mockResolvedValue({ id: 1 });
        const okFeedback = renderBubble(baseMsg({ MediaType: 'sticker', MediaUrl: '/storage/bucket/stickers/abc.webp', Message: '/storage/bucket/stickers/abc.webp' }));
        await act(async () => { menuItem('Añadir a mis stickers').click(); await Promise.resolve(); });
        expect(okFeedback).toHaveBeenCalledWith('Añadido a Mis stickers', 'success');

        act(() => { root.unmount(); });
        document.body.innerHTML = '';
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        lib.saveFromMessage.mockResolvedValue(null);
        const failFeedback = renderBubble(baseMsg({ MediaType: 'sticker', MediaUrl: '/storage/bucket/stickers/abc.webp', Message: '/storage/bucket/stickers/abc.webp' }));
        await act(async () => { menuItem('Añadir a mis stickers').click(); await Promise.resolve(); });
        expect(failFeedback).toHaveBeenCalledWith('No se pudo añadir el sticker', 'error');
    });
});

// RF20: GroupMessageList debe cablear el toast de stickers con optional chaining
// (como el 1:1) y seguir llamando a la acción del menú.
describe('GroupMessageList sticker feedback wiring', () => {
    let container: HTMLDivElement;
    let root: Root;
    const addToast = vi.fn();

    const renderList = (msg: GroupMessageResponse) => {
        act(() => {
            root.render(
                <GroupMessageList
                    messages={[msg]}
                    myTelephon="111"
                    activeWallpaper={null}
                    groupID={5}
                    hasMore={false}
                    loadingOlder={false}
                    onLoadOlder={vi.fn()}
                />,
            );
        });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
        mockUseDashboard.mockReturnValue({
            selectedGroup: { ID: 5, Members: [] },
            groupReceipts: {},
            groupMemberNames: {},
            reactToMessage: vi.fn(),
            outboxItems: [],
            addToast,
        } as unknown as DashboardContextValue);
        mockUseGroupMessaging.mockReturnValue({
            handleEditMessage: vi.fn(), handleDeleteMessage: vi.fn(), handleDeleteMessageForMe: vi.fn(),
            handleReplyToMessage: vi.fn(), messageMenuOpen: 1, setMessageMenuOpen: vi.fn(),
        } as unknown as UseGroupMessagingResult);
        lib.toggleFavorite.mockResolvedValue(true);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
        document.body.innerHTML = '';
    });

    it('routes the sticker feedback to the dashboard toast on a menu click', async () => {
        renderList(baseMsg({ MediaType: 'sticker', MediaUrl: '/stickers/animales/gato.webp', Message: '/stickers/animales/gato.webp' }));
        const item = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
            .find((button) => button.textContent?.includes('Añadir a favoritos'))!;
        expect(item).toBeTruthy();

        await act(async () => { item.click(); await Promise.resolve(); });

        expect(lib.toggleFavorite).toHaveBeenCalledWith('/stickers/animales/gato.webp', true);
        expect(addToast).toHaveBeenCalledWith({ type: 'success', message: 'Añadido a favoritos' });
    });

    it('does not crash the sticker feedback when the dashboard toast is absent', async () => {
        mockUseDashboard.mockReturnValue({
            selectedGroup: { ID: 5, Members: [] },
            groupReceipts: {},
            groupMemberNames: {},
            reactToMessage: vi.fn(),
            outboxItems: [],
        } as unknown as DashboardContextValue);
        renderList(baseMsg({ MediaType: 'sticker', MediaUrl: '/stickers/animales/gato.webp', Message: '/stickers/animales/gato.webp' }));
        const item = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
            .find((button) => button.textContent?.includes('Añadir a favoritos'))!;
        expect(item).toBeTruthy();

        await act(async () => { item.click(); await Promise.resolve(); });

        expect(lib.toggleFavorite).toHaveBeenCalledWith('/stickers/animales/gato.webp', true);
    });
});
