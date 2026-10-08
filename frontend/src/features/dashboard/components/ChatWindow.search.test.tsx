// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ChatWindow from './ChatWindow';
import { useDashboard, type DashboardContextValue } from '../context/DashboardContext';
import { searchChat } from '../api/searchApi';
import { createFocusedWindow } from '../lib/focusedWindow';
import type { Message, SearchPage } from '../../../types/api';

// message-search (MS5): in-chat search wired into the 1:1 header.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../hooks/useMessaging', () => ({
    MessagingProvider: ({ children }: { children: unknown }) => children,
    useMessaging: () => ({ forwardingMessage: null, setForwardingMessage: vi.fn(), executeForward: vi.fn() }),
}));
vi.mock('./MessageList', () => ({
    default: ({ searchQuery }: { searchQuery?: string }) => <div data-testid="list" data-query={searchQuery ?? ''} />,
}));
vi.mock('./MessageInput', () => ({ default: () => null }));
vi.mock('./AddContactModal', () => ({ default: () => null }));
vi.mock('./ForwardMessageModal', () => ({ default: () => null }));
vi.mock('../api/searchApi', () => ({ searchChat: vi.fn() }));

const mockUseDashboard = vi.mocked(useDashboard);
const mockSearchChat = vi.mocked(searchChat);

const hit = (id: number) => ({ messageID: id, time: '2026-01-01T00:00:00Z', snippet: `m${id}`, highlights: [] as [number, number][] });
const page = (ids: number[]): SearchPage => ({ results: ids.map(hit), hasMore: false });
const msg = (id: number): Message => ({
    MessageID: id, SenderTelephon: '222', Receptor: '111', Message: `m${id}`, Status: 'visto', Time: '2026-01-01T10:00:00Z', Edited: false,
});

describe('ChatWindow in-chat search', () => {
    let container: HTMLDivElement;
    let root: Root;
    const openMessageAt = vi.fn();
    const returnToLatest = vi.fn();

    const renderChat = (focusedChat: DashboardContextValue['focusedChat'] = {}) => {
        mockUseDashboard.mockReturnValue({
            selected: { telephon: '222', contactName: 'Luis', username: 'luis' },
            setSelected: vi.fn(), isConnected: true, avatarMap: {}, onlineUsers: new Set(), typingUsers: new Set(),
            lastSeenMap: {}, setMessagesByChat: vi.fn(), contacts: [{ telephon: '222' }], addToast: vi.fn(),
            messagesByChat: { '222': [msg(1)] }, fetchChatMessages: vi.fn(), profile: { telephon: '111' },
            allChatGroups: {}, markAsRead: vi.fn(),
            focusedChat, openMessageAt, returnToLatest,
        } as unknown as DashboardContextValue);
        act(() => { root.render(<ChatWindow onShowContactDetails={vi.fn()} />); });
    };

    const searchButton = () => container.querySelector('button[aria-label="Buscar en el chat"]') as HTMLButtonElement | null;
    const input = () => container.querySelector('input[placeholder="Buscar"]') as HTMLInputElement | null;
    const typeQuery = async (q: string) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        act(() => {
            setter?.call(input(), q);
            input()?.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    };

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        openMessageAt.mockResolvedValue(true);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.useRealTimers();
    });

    it('has a search button in the header; the bar is hidden until it is clicked', () => {
        renderChat();
        expect(input()).toBeNull();
        act(() => { searchButton()?.click(); });
        expect(input()).not.toBeNull();
    });

    it('searches the open conversation, jumps to the newest hit and passes the term to the list', async () => {
        mockSearchChat.mockResolvedValue(page([30, 20]));
        renderChat();
        act(() => { searchButton()?.click(); });
        await typeQuery('hola');

        expect(mockSearchChat).toHaveBeenCalledWith('222', 'hola', expect.objectContaining({ limit: 30 }));
        expect(openMessageAt).toHaveBeenCalledWith({ kind: 'chat', key: '222' }, 30);
        expect(container.textContent).toContain('1 de 2');
        expect(container.querySelector('[data-testid="list"]')?.getAttribute('data-query')).toBe('hola');
    });

    it('Escape closes the bar and clears the highlight term', async () => {
        mockSearchChat.mockResolvedValue(page([30]));
        renderChat();
        act(() => { searchButton()?.click(); });
        await typeQuery('hola');

        act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });

        expect(input()).toBeNull();
        expect(container.querySelector('[data-testid="list"]')?.getAttribute('data-query')).toBe('');
    });

    it('shows "Ir a los mensajes recientes" only while a detached window is open and returns to the latest', () => {
        renderChat();
        expect(container.querySelector('button[aria-label="Ir a los mensajes recientes"]')).toBeNull();

        const win = createFocusedWindow<Message>([msg(10)], { hasMoreOlder: true, hasMoreNewer: true }, 10, 1);
        renderChat({ '222': win });
        const back = container.querySelector('button[aria-label="Ir a los mensajes recientes"]') as HTMLButtonElement;
        expect(back).not.toBeNull();
        expect(back.textContent).toContain('Ir a los mensajes recientes');
        act(() => { back.click(); });
        expect(returnToLatest).toHaveBeenCalledWith({ kind: 'chat', key: '222' });
    });
});
