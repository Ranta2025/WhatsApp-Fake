// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import MessageList from './MessageList';
import type { Message } from '../../../types/api';

// reactions (RE5): quick row in the menu, hover smile, chips, who modal, long-press (1:1).

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const dash = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const messaging = vi.hoisted(() => ({ menuOpen: null as number | null, setMenuOpen: vi.fn() }));
vi.mock('../context/DashboardContext', () => ({ useDashboard: () => dash.value }));
vi.mock('../hooks/useMessaging', () => ({
    useMessaging: () => ({
        editingMessageId: null, editingMessageText: '', handleEditMessageChange: vi.fn(),
        handleEditMessageSave: vi.fn(), handleEditMessageCancel: vi.fn(), handleEditMessage: vi.fn(),
        handleDeleteMessage: vi.fn(), handleDeleteMessageForMe: vi.fn(), handleReplyToMessage: vi.fn(),
        handleForwardMessage: vi.fn(), messageMenuOpen: messaging.menuOpen, setMessageMenuOpen: messaging.setMenuOpen,
    }),
}));
const mockGetReactions = vi.fn();
vi.mock('../../../api/reactionApi', () => ({ getReactions: (...a: unknown[]) => mockGetReactions(...a) }));
const picker = vi.hoisted(() => ({ el: null as HTMLElement | null }));
vi.mock('./reactions/emojiPickerLoader', () => ({
    createEmojiPicker: () => { picker.el = document.createElement('div'); return picker.el; },
}));

const msg = (id: number, over: Partial<Message> = {}): Message => ({
    MessageID: id, SenderTelephon: 'B', Receptor: 'me', Message: `m${id}`, Status: 'visto',
    Time: '2026-01-01T10:00:00Z', Edited: false, ...over,
});

describe('MessageList reactions (1:1)', () => {
    let container: HTMLDivElement;
    let root: Root;
    const reactToMessage = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        messaging.menuOpen = null;
        mockGetReactions.mockResolvedValue({ reactions: [{ emoji: '👍', users: [{ telephon: 'B', username: 'bea', avatarUrl: '' }] }] });
        dash.value = {
            selected: { Number: 'B', Username: 'bea' },
            focusedChat: {},
            messagesByChat: { B: [msg(1, { Reactions: [{ Emoji: '👍', Count: 2, Mine: true }, { Emoji: '❤️', Count: 1, Mine: false }] }), msg(2)] },
            profile: { Telephon: 'me' },
            globalWallpaper: '',
            chatPaging: {},
            loadOlderMessages: vi.fn(),
            reactToMessage,
        };
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        document.body.innerHTML = '';
    });

    const render = () => act(() => { root.render(<MessageList />); });
    const byLabel = (label: string, scope: ParentNode = document.body) =>
        Array.from(scope.querySelectorAll<HTMLElement>('button')).filter(b => b.getAttribute('aria-label') === label);
    const bubble = (id: number) => container.querySelector<HTMLElement>(`[data-message-id="${id}"]`) as HTMLElement;
    const bubbleBody = (id: number) => bubble(id).querySelector<HTMLElement>('.rounded-2xl') as HTMLElement;

    it('draws chips only on messages that have reactions', () => {
        render();
        expect(byLabel('👍 2, reaccionaste', bubble(1))).toHaveLength(1);
        expect(byLabel('❤️ 1', bubble(1))).toHaveLength(1);
        expect(bubble(2).querySelector('button[aria-pressed]')).toBeNull();
    });

    it('tapping a chip reacts with the 1:1 target', () => {
        render();
        act(() => { byLabel('❤️ 1', bubble(1))[0]?.click(); });
        expect(reactToMessage).toHaveBeenCalledExactlyOnceWith({ kind: 'direct', messageID: 1 }, '❤️');
    });

    it('"Ver reacciones" opens the who-reacted modal for that message', async () => {
        render();
        await act(async () => { byLabel('Ver reacciones', bubble(1))[0]?.click(); });
        expect(mockGetReactions).toHaveBeenCalledWith('direct', 1, undefined);
        expect(document.body.querySelector('[role="dialog"][aria-label="Reacciones"]')).not.toBeNull();
        expect(document.body.textContent).toContain('bea');
    });

    it('puts the quick row at the top of the open menu and reacts + closes it', () => {
        messaging.menuOpen = 1;
        render();
        const pressed = Array.from(document.body.querySelectorAll('button[aria-pressed="true"][aria-label^="Reaccionar con"]'));
        expect(pressed.map(b => b.getAttribute('aria-label'))).toEqual(['Reaccionar con 👍']);
        act(() => { byLabel('Reaccionar con 😮')[0]?.click(); });
        expect(reactToMessage).toHaveBeenCalledExactlyOnceWith({ kind: 'direct', messageID: 1 }, '😮');
        expect(messaging.setMenuOpen).toHaveBeenCalledWith(null);
    });

    it('"+" closes the menu and opens the lazy full picker; picking reacts', async () => {
        messaging.menuOpen = 2;
        render();
        await act(async () => { byLabel('Más emojis')[0]?.click(); });
        expect(messaging.setMenuOpen).toHaveBeenCalledWith(null);
        expect(document.body.querySelector('[role="dialog"][aria-label="Elegir emoji"]')).not.toBeNull();
        await act(async () => { picker.el?.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '🎉' } })); });
        expect(reactToMessage).toHaveBeenCalledExactlyOnceWith({ kind: 'direct', messageID: 2 }, '🎉');
        expect(document.body.querySelector('[role="dialog"][aria-label="Elegir emoji"]')).toBeNull();
    });

    it('the hover smile opens only the quick row (no other menu entries)', () => {
        render();
        expect(document.body.querySelector('button[aria-label="Reaccionar con 👍"]')).toBeNull();
        act(() => { byLabel('Reaccionar', bubble(2))[0]?.click(); });
        expect(byLabel('Reaccionar con 👍')).toHaveLength(1);
        expect(document.body.textContent).not.toContain('Responder');
        act(() => { byLabel('Reaccionar con 🙏')[0]?.click(); });
        expect(reactToMessage).toHaveBeenCalledExactlyOnceWith({ kind: 'direct', messageID: 2 }, '🙏');
        expect(byLabel('Reaccionar con 👍')).toHaveLength(0);
    });

    describe('long press', () => {
        beforeEach(() => { vi.useFakeTimers(); });
        afterEach(() => { vi.useRealTimers(); });

        const touch = (el: HTMLElement, type: string, x = 5, y = 5) => {
            const ev = new Event(type, { bubbles: true });
            Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] });
            act(() => { el.dispatchEvent(ev); });
        };

        it('opens the message menu after 400 ms on the bubble', () => {
            render();
            touch(bubbleBody(2), 'touchstart');
            act(() => { vi.advanceTimersByTime(400); });
            expect(messaging.setMenuOpen).toHaveBeenCalledExactlyOnceWith(2);
        });

        it('does nothing if the finger moves (scroll)', () => {
            render();
            touch(bubbleBody(2), 'touchstart', 5, 5);
            touch(bubbleBody(2), 'touchmove', 5, 60);
            act(() => { vi.advanceTimersByTime(1000); });
            expect(messaging.setMenuOpen).not.toHaveBeenCalled();
        });
    });
});
