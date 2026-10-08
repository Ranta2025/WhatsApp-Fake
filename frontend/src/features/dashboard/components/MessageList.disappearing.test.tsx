// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import MessageList from './MessageList';
import type { Message } from '../../../types/api';

// disappearing-messages (DE6): clock icon next to the time on 1:1 bubbles with a valid ExpiresAt.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const dash = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../context/DashboardContext', () => ({ useDashboard: () => dash.value }));
vi.mock('../hooks/useMessaging', () => ({
    useMessaging: () => ({
        editingMessageId: null, editingMessageText: '', handleEditMessageChange: vi.fn(),
        handleEditMessageSave: vi.fn(), handleEditMessageCancel: vi.fn(), handleEditMessage: vi.fn(),
        handleDeleteMessage: vi.fn(), handleDeleteMessageForMe: vi.fn(), handleReplyToMessage: vi.fn(),
        handleForwardMessage: vi.fn(), messageMenuOpen: null, setMessageMenuOpen: vi.fn(),
    }),
}));

const msg = (id: number, over: Partial<Message> = {}): Message => ({
    MessageID: id, SenderTelephon: 'B', Receptor: 'me', Message: `m${id}`, Status: 'visto',
    Time: '2026-01-01T10:00:00Z', Edited: false, ...over,
});

describe('MessageList expiry clock (1:1)', () => {
    let container: HTMLDivElement;
    let root: Root;
    const row = (id: number) => container.querySelector<HTMLElement>(`[data-message-id="${id}"]`) as HTMLElement;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        dash.value = {
            selected: { telephon: 'B', username: 'bea', contactName: 'Bea' },
            focusedChat: {},
            messagesByChat: { B: [
                msg(1),
                msg(2, { ExpiresAt: '2026-01-02T10:00:00Z' }),
                msg(3, { ExpiresAt: 'garbage' }),
                msg(4, { SenderTelephon: 'me', Receptor: 'B', ExpiresAt: '2026-01-02T10:00:00Z' }),
            ] },
            profile: { telephon: 'me' },
            globalWallpaper: '', chatPaging: {}, loadOlderMessages: vi.fn(), reactToMessage: vi.fn(),
        };
        act(() => { root.render(<MessageList />); });
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        document.body.innerHTML = '';
    });

    it('shows the clock only on messages with a valid ExpiresAt (incoming and mine)', () => {
        expect(row(1).querySelector('[data-testid="expiry-clock"]')).toBeNull();
        expect(row(2).querySelector('[aria-label="Mensaje temporal"]')).not.toBeNull();
        expect(row(3).querySelector('[data-testid="expiry-clock"]')).toBeNull();
        expect(row(4).querySelector('[aria-label="Mensaje temporal"]')).not.toBeNull();
    });
});
