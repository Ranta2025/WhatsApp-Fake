// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import MessageList from './MessageList';
import type { Message } from '../../../types/api';

// disappearing-messages (DE5): a 1:1 system message renders as a centered pill with no bubble and no actions.

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
    messageID: id, senderTelephon: 'B', receptor: 'me', message: `m${id}`, status: 'visto',
    time: '2026-01-01T10:00:00Z', edited: false, ...over,
});

describe('MessageList system messages (1:1)', () => {
    let container: HTMLDivElement;
    let root: Root;

    const mountWith = (messages: Message[]) => {
        dash.value = {
            selected: { telephon: 'B', username: 'bea', contactName: 'Bea' },
            focusedChat: {},
            messagesByChat: { B: messages },
            profile: { telephon: 'me' },
            globalWallpaper: '',
            chatPaging: {},
            loadOlderMessages: vi.fn(),
            reactToMessage: vi.fn(),
        };
        act(() => { root.render(<MessageList />); });
    };
    const row = (id: number) => container.querySelector<HTMLElement>(`[data-message-id="${id}"]`) as HTMLElement;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        document.body.innerHTML = '';
    });

    it('renders the other participant notice as a pill with their name', () => {
        mountWith([msg(1), msg(2, { kind: 'system', systemEvent: 'disappearing_changed', message: '86400' })]);
        expect(row(2).textContent).toBe('Bea activó los mensajes temporales: 24 horas');
        expect(row(2).querySelector('.rounded-full')).not.toBeNull();
        expect(row(2).querySelector('.rounded-2xl')).toBeNull();
    });

    it('words it in second person for my own change and for turning it off', () => {
        mountWith([
            msg(2, { kind: 'system', systemEvent: 'disappearing_changed', message: '604800', senderTelephon: 'me', receptor: 'B' }),
            msg(3, { kind: 'system', systemEvent: 'disappearing_changed', message: '0', senderTelephon: 'me', receptor: 'B' }),
            msg(4, { kind: 'system', systemEvent: 'disappearing_changed', message: '0' }),
        ]);
        expect(row(2).textContent).toBe('Activaste los mensajes temporales: 7 días');
        expect(row(3).textContent).toBe('Desactivaste los mensajes temporales');
        expect(row(4).textContent).toBe('Bea desactivó los mensajes temporales');
    });

    it('offers no reply/react/edit/delete/forward controls on a system message but keeps them on a normal one', () => {
        mountWith([msg(1), msg(2, { kind: 'system', systemEvent: 'disappearing_changed', message: '86400' })]);
        expect(row(2).querySelectorAll('button')).toHaveLength(0);
        expect(row(1).querySelectorAll('button').length).toBeGreaterThan(0);
    });
});
