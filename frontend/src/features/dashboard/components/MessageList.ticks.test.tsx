// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import MessageList from './MessageList';
import type { Message, MessageStatus } from '../../../types/api';

// group-read-receipts (RR5): the 1:1 status ticks were extracted into a shared
// component. This pins the rendered markup of MessageList so the extraction
// (and any future tweak of the shared ticks) cannot silently change 1:1 chats.

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

const msg = (id: number, status: MessageStatus, senderTelephon = 'me'): Message => ({
    messageID: id, senderTelephon, receptor: 'B', message: `m${id}`, status, time: '2026-01-01T10:00:00Z', edited: false,
});

describe('MessageList status ticks (1:1)', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        dash.value = {
            selected: { telephon: 'B', username: 'bea' },
            focusedChat: {},
            messagesByChat: { B: [msg(1, 'enviado'), msg(2, 'entregado'), msg(3, 'visto'), msg(4, 'visto', 'B')] },
            profile: { telephon: 'me' },
            globalWallpaper: '',
            chatPaging: {},
            loadOlderMessages: vi.fn(),
        };
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const ticks = () => {
        act(() => { root.render(<MessageList />); });
        return Array.from(container.querySelectorAll('svg[role="img"]')).map(svg => ({
            label: svg.getAttribute('aria-label'),
            className: svg.getAttribute('class'),
            viewBox: svg.getAttribute('viewBox'),
            paths: Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d')),
            stroke: svg.querySelector('path')?.getAttribute('stroke'),
            strokeWidth: svg.querySelector('path')?.getAttribute('stroke-width'),
        }));
    };

    it('renders sent / delivered / read ticks for own messages only, with the exact geometry and colors', () => {
        expect(ticks()).toEqual([
            {
                label: 'Enviado', className: 'h-3 w-5 shrink-0 text-on-accent/60', viewBox: '0 0 20 12',
                paths: ['M4.5 6.5 8 10l7.5-8'], stroke: 'currentColor', strokeWidth: '1.7',
            },
            {
                label: 'Entregado', className: 'h-3 w-5 shrink-0 transition-colors duration-300 text-on-accent/60', viewBox: '0 0 20 12',
                paths: ['M1.5 6.5 5 10l7.5-8', 'M8.6 9.4 9.2 10l7.5-8'], stroke: 'currentColor', strokeWidth: '1.7',
            },
            {
                label: 'Visto', className: 'h-3 w-5 shrink-0 transition-colors duration-300 text-tick-read', viewBox: '0 0 20 12',
                paths: ['M1.5 6.5 5 10l7.5-8', 'M8.6 9.4 9.2 10l7.5-8'], stroke: 'currentColor', strokeWidth: '1.7',
            },
        ]);
    });

    it('falls back to the clock icon for an unknown status', () => {
        dash.value.messagesByChat = { B: [msg(9, 'pendiente' as unknown as MessageStatus)] };
        expect(ticks().map(t => t.label)).toEqual(['Enviando']);
    });
});
